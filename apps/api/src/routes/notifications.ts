import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import * as notifications from '@maevelle/database/notifications';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
function headers(input: Record<string, string | string[] | undefined>) {
  return new Headers(
    Object.entries(input).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  );
}
async function admin(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return context && { ...context, actorId: session.user.id };
}
function failure(
  reply: { code: (n: number) => { send: (v: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof notifications.NotificationDomainError)
    return reply
      .code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  throw error;
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
) {
  app.get('/admin/notifications', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'notifications.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await notifications.listNotifications(database.db, a.organizationId) };
  });
  app.post(
    '/admin/notifications/:notificationId/read',
    { schema: { params: Type.Object({ notificationId: Type.String() }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.view');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await notifications.markNotificationRead(database.db, {
          organizationId: a.organizationId,
          recipientType: 'MEMBERSHIP',
          recipientId: a.membershipId,
          notificationId: (req.params as { notificationId: string }).notificationId,
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.get('/admin/notifications/preferences/me', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'notifications.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await notifications.listNotificationPreferences(database.db, {
        organizationId: a.organizationId,
        recipientType: 'MEMBERSHIP',
        recipientId: a.membershipId,
      }),
    };
  });
  app.post(
    '/admin/notifications/preferences/me',
    {
      schema: {
        body: Type.Object({
          notificationType: Type.String({ minLength: 1, maxLength: 120 }),
          channel: Type.Union([Type.Literal('IN_APP'), Type.Literal('EMAIL')]),
          enabled: Type.Boolean(),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      await notifications.setNotificationPreference(database.db, {
        organizationId: a.organizationId,
        recipientType: 'MEMBERSHIP',
        recipientId: a.membershipId,
        ...(req.body as {
          notificationType: string;
          channel: 'IN_APP' | 'EMAIL';
          enabled: boolean;
        }),
      });
      return reply.code(204).send();
    },
  );
  app.post(
    '/admin/notifications/preferences',
    {
      schema: {
        body: Type.Object({
          recipientType: Type.Union([Type.Literal('MEMBERSHIP'), Type.Literal('CUSTOMER')]),
          recipientId: Type.String(),
          notificationType: Type.String(),
          channel: Type.Union([Type.Literal('IN_APP'), Type.Literal('EMAIL')]),
          enabled: Type.Boolean(),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      const body = req.body as {
        recipientType: 'MEMBERSHIP' | 'CUSTOMER';
        recipientId: string;
        notificationType: string;
        channel: 'IN_APP' | 'EMAIL';
        enabled: boolean;
      };
      await notifications.setNotificationPreference(database.db, {
        organizationId: a.organizationId,
        ...body,
      });
      return reply.code(204).send();
    },
  );
  app.get('/admin/integrations', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'integrations.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    const [health, operations] = await Promise.all([
      notifications.integrationHealth(database.db, a.organizationId),
      notifications.integrationOperations(database.db, a.organizationId),
    ]);
    return { data: { health, ...operations } };
  });
  app.get('/admin/integrations/integrity', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'integrations.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await notifications.verifyNotificationIntegrationIntegrity(
        database.db,
        a.organizationId,
      ),
    };
  });
  app.post(
    '/admin/integrations/operations/:operationId/reconcile',
    {
      schema: {
        params: Type.Object({ operationId: Type.String() }),
        body: Type.Object({
          outcome: Type.Union([
            Type.Literal('CONFIRMED_SUCCESS'),
            Type.Literal('CONFIRMED_FAILURE'),
            Type.Literal('RECONCILIATION_REQUIRED'),
          ]),
          externalReference: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'integrations.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await notifications.reconcileIntegrationOperation(database.db, {
          organizationId: a.organizationId,
          operationId: (req.params as { operationId: string }).operationId,
          ...(req.body as {
            outcome: 'CONFIRMED_SUCCESS' | 'CONFIRMED_FAILURE' | 'RECONCILIATION_REQUIRED';
            externalReference?: string;
          }),
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/integrations/webhooks',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 160 }),
          endpointUrl: Type.String(),
          eventTypes: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'webhooks.manage');
      if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = req.body as { name: string; endpointUrl: string; eventTypes: string[] };
        return reply.code(201).send({
          data: await notifications.createWebhookEndpoint(database.db, {
            organizationId: a.organizationId,
            actorId: a.actorId,
            ...body,
            encryptionKey: {
              id: 'runtime-auth-key',
              value: Buffer.from(config.authEncryptionKey, 'base64'),
            },
          }),
        });
      } catch (e) {
        return failure(reply, e);
      }
    },
  );
}
