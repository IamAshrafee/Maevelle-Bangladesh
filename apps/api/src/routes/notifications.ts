import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import * as notifications from '@maevelle/database/notifications';
import { resolveEmailSettings, resolveStorefrontSettings } from '@maevelle/database/settings';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';
import { Resend } from 'resend';

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
    ...(typeof source['x-organization-id'] === 'string'
      ? { organizationId: source['x-organization-id'] }
      : {}),
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
  if (error instanceof notifications.EmailNotificationError)
    return reply
      .code(
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'CONFLICT'
            ? 409
            : error.code === 'FORBIDDEN'
              ? 403
              : 422,
      )
      .send({ error: { code: error.code, message: error.message } });
  throw error;
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
) {
  const emailEnvironment = config.emailEnvironment ?? config.nodeEnv;
  const emailReplyTo = config.emailReplyTo ?? 'maevelleBangladesh@gmail.com';
  const emailFromName = config.emailFromName ?? 'Maevelle';
  const emailFromAddress = config.emailFromAddress ?? 'orders@example.invalid';
  app.get('/admin/notifications', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'notifications.view');
    if (!a) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await notifications.listNotifications(database.db, a.organizationId) };
  });
  app.post(
    '/admin/notifications/:notificationId/read',
    { schema: { params: Type.Object({ notificationId: Type.String({ format: 'uuid' }) }) } },
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

  async function getRenderOptions(organizationId: string) {
    const emailRes = await resolveEmailSettings(database.db, organizationId, config);
    const storefront = await resolveStorefrontSettings(database.db, organizationId, config);
    return {
      storefrontBaseUrl: storefront.publicBaseUrl,
      supportEmail: emailRes.settings.replyTo,
      senderFrom: `${emailRes.settings.fromName} <${emailRes.settings.fromAddress}>`,
      ...(emailRes.readiness.environment !== 'production'
        ? { environmentLabel: emailRes.readiness.environment.toUpperCase() }
        : {}),
    };
  }

  app.get(
    '/admin/email/operations',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          status: Type.Optional(Type.String()),
          notificationType: Type.Optional(Type.String()),
          search: Type.Optional(Type.String({ maxLength: 200 })),
          sourceId: Type.Optional(Type.String({ format: 'uuid' })),
          customerId: Type.Optional(Type.String({ format: 'uuid' })),
          recipient: Type.Optional(Type.String({ maxLength: 200 })),
          triggerType: Type.Optional(Type.String({ maxLength: 40 })),
          provider: Type.Optional(Type.String({ maxLength: 80 })),
          createdAfter: Type.Optional(Type.String({ format: 'date-time' })),
          createdBefore: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.view');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      const query = req.query as {
        page?: number;
        pageSize?: number;
        status?: string;
        notificationType?: string;
        search?: string;
        sourceId?: string;
        customerId?: string;
        recipient?: string;
        triggerType?: string;
        provider?: string;
        createdAfter?: string;
        createdBefore?: string;
      };
      return notifications.listEmailNotifications(database.db, {
        organizationId: a.organizationId,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 25,
        ...(query.status ? { status: query.status } : {}),
        ...(query.notificationType ? { notificationType: query.notificationType } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(query.sourceId ? { sourceId: query.sourceId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.recipient ? { recipient: query.recipient } : {}),
        ...(query.triggerType ? { triggerType: query.triggerType } : {}),
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.createdAfter ? { createdAfter: query.createdAfter } : {}),
        ...(query.createdBefore ? { createdBefore: query.createdBefore } : {}),
      });
    },
  );
  app.get(
    '/admin/email/operations/:notificationId',
    { schema: { params: Type.Object({ notificationId: Type.String({ format: 'uuid' }) }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.view');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return {
          data: await notifications.getEmailNotification(
            database.db,
            a.organizationId,
            (req.params as { notificationId: string }).notificationId,
          ),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.get('/admin/email/policies', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'notifications.view');
    if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: await notifications.listEmailPolicies(database.db, a.organizationId) };
  });
  app.patch(
    '/admin/email/policies/:notificationType',
    {
      schema: {
        params: Type.Object({ notificationType: Type.String() }),
        body: Type.Object({
          enabled: Type.Boolean(),
          automaticEnabled: Type.Boolean(),
          manualAllowed: Type.Boolean(),
          reason: Type.String({ minLength: 3, maxLength: 500 }),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.manage');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        await notifications.updateEmailPolicy(database.db, {
          organizationId: a.organizationId,
          notificationType: (req.params as { notificationType: string }).notificationType,
          actorId: a.actorId,
          ...(req.body as {
            enabled: boolean;
            automaticEnabled: boolean;
            manualAllowed: boolean;
            reason: string;
          }),
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.get('/admin/email/templates', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'notifications.view');
    if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: notifications.listTransactionalEmailTemplates() };
  });
  app.post(
    '/admin/email/templates/:notificationType/preview',
    {
      schema: {
        params: Type.Object({ notificationType: Type.String() }),
        body: Type.Object({
          orderId: Type.Optional(Type.String({ maxLength: 80 })),
          fixtureKey: Type.Optional(Type.String({ maxLength: 80 })),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.view');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      const body = (req.body ?? {}) as { orderId?: string; fixtureKey?: string };
      const reqOrderId = body.orderId?.trim();
      const reqFixtureKey = body.fixtureKey?.trim();
      try {
        return {
          data: await notifications.previewOrderEmail(database.db, {
            organizationId: a.organizationId,
            ...(reqOrderId ? { orderId: reqOrderId } : {}),
            ...(reqFixtureKey ? { fixtureKey: reqFixtureKey } : {}),
            notificationType: (req.params as { notificationType: string }).notificationType,
            options: await getRenderOptions(a.organizationId),
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.get(
    '/admin/email/orders/:orderId/eligibility',
    { schema: { params: Type.Object({ orderId: Type.String({ minLength: 1, maxLength: 80 }) }) } },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.view');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      const emailRes = await resolveEmailSettings(database.db, a.organizationId, config);
      try {
        return {
          data: await notifications.getOrderEmailEligibility(database.db, {
            organizationId: a.organizationId,
            orderId: (req.params as { orderId: string }).orderId,
            globalEnabled: emailRes.settings.enabled,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/email/test-send',
    {
      schema: {
        body: Type.Object({
          notificationType: Type.String(),
          testRecipient: Type.String(),
          orderId: Type.Optional(Type.String({ maxLength: 80 })),
          fixtureKey: Type.Optional(Type.String({ maxLength: 80 })),
          reason: Type.Optional(Type.String({ maxLength: 500 })),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.send');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      const body = req.body as {
        notificationType: string;
        testRecipient: string;
        orderId?: string;
        fixtureKey?: string;
        reason?: string;
      };
      const emailRes = await resolveEmailSettings(database.db, a.organizationId, config);
      const testRecipient = body.testRecipient.trim().toLowerCase();
      const allowedRecipients = emailRes.settings.allowedTestRecipients.length > 0
        ? emailRes.settings.allowedTestRecipients
        : (config.emailAllowedTestRecipients ?? []);
      if (
        emailRes.readiness.environment === 'production' ||
        !allowedRecipients.includes(testRecipient)
      ) {
        return reply.code(422).send({
          error: {
            code: 'UNSAFE_TEST_RECIPIENT',
            message: 'The test recipient is not in the deployment allow-list.',
          },
        });
      }
      try {
        const result = await notifications.sendTestEmail(database.db, {
          organizationId: a.organizationId,
          actorId: a.actorId,
          notificationType: body.notificationType,
          ...(body.orderId?.trim() ? { orderId: body.orderId.trim() } : {}),
          ...(body.fixtureKey?.trim() ? { fixtureKey: body.fixtureKey.trim() } : {}),
          testRecipient,
          ...(body.reason?.trim() ? { reason: body.reason.trim() } : {}),
          options: await getRenderOptions(a.organizationId),
        });
        return reply.code(201).send({ data: result });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/email/orders/:orderId/send',
    {
      schema: {
        params: Type.Object({ orderId: Type.String({ minLength: 1, maxLength: 80 }) }),
        body: Type.Object({
          notificationType: Type.String(),
          idempotencyKey: Type.String({ minLength: 8, maxLength: 200 }),
          reason: Type.String({ minLength: 3, maxLength: 500 }),
          testRecipient: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.send');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      const body = req.body as {
        notificationType: string;
        idempotencyKey: string;
        reason: string;
        testRecipient?: string;
      };
      const testRecipient = body.testRecipient?.trim().toLowerCase();
      if (
        testRecipient &&
        (emailEnvironment === 'production' ||
          !(config.emailAllowedTestRecipients ?? []).includes(testRecipient))
      )
        return reply.code(422).send({
          error: {
            code: 'UNSAFE_TEST_RECIPIENT',
            message: 'The test recipient is not in the deployment allow-list.',
          },
        });
      try {
        const result = await notifications.createManualOrderEmail(database.db, {
          organizationId: a.organizationId,
          orderId: (req.params as { orderId: string }).orderId,
          notificationType: body.notificationType,
          actorId: a.actorId,
          idempotencyKey: body.idempotencyKey,
          reason: body.reason,
          triggerType: testRecipient ? 'TEST' : 'MANUAL',
          ...(testRecipient ? { recipientOverride: testRecipient } : {}),
          options: await getRenderOptions(a.organizationId),
        });
        return reply.code(result.created ? 201 : 200).send({ data: result });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/email/operations/:notificationId/retry',
    {
      schema: {
        params: Type.Object({ notificationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ reason: Type.String({ minLength: 3, maxLength: 500 }) }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.retry');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        await notifications.retryEmailNotification(database.db, {
          organizationId: a.organizationId,
          notificationId: (req.params as { notificationId: string }).notificationId,
          actorId: a.actorId,
          reason: (req.body as { reason: string }).reason,
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/email/operations/:notificationId/resend',
    {
      schema: {
        params: Type.Object({ notificationId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          idempotencyKey: Type.String({ minLength: 8, maxLength: 200 }),
          reason: Type.String({ minLength: 3, maxLength: 500 }),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.send');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const notificationId = (req.params as { notificationId: string }).notificationId;
        const original = (await notifications.getEmailNotification(
          database.db,
          a.organizationId,
          notificationId,
        )) as { source_id: string; notification_type: string };
        const body = req.body as { idempotencyKey: string; reason: string };
        const result = await notifications.createManualOrderEmail(database.db, {
          organizationId: a.organizationId,
          orderId: original.source_id,
          notificationType: original.notification_type,
          actorId: a.actorId,
          idempotencyKey: body.idempotencyKey,
          reason: body.reason,
          triggerType: 'RESEND',
          parentNotificationId: notificationId,
          options: await getRenderOptions(a.organizationId),
        });
        return reply.code(result.created ? 201 : 200).send({ data: result });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.get('/admin/email/suppressions', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'notifications.view');
    if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: await notifications.listEmailSuppressions(database.db, a.organizationId) };
  });
  app.post(
    '/admin/email/suppressions',
    {
      schema: {
        body: Type.Object({
          email: Type.String(),
          active: Type.Boolean(),
          reason: Type.String({ minLength: 3, maxLength: 500 }),
        }),
      },
    },
    async (req, reply) => {
      const a = await admin(database, auth, req.headers, 'notifications.suppressions.manage');
      if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        await notifications.setEmailSuppression(database.db, {
          organizationId: a.organizationId,
          actorId: a.actorId,
          ...(req.body as { email: string; active: boolean; reason: string }),
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.get('/admin/email/diagnostics', async (req, reply) => {
    const a = await admin(database, auth, req.headers, 'notifications.view');
    if (!a) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    const emailRes = await resolveEmailSettings(database.db, a.organizationId, config);
    return {
      data: {
        provider: emailRes.settings.provider,
        environment: emailRes.readiness.environment,
        enabled: emailRes.settings.enabled,
        from: `${emailRes.settings.fromName} <${emailRes.settings.fromAddress}>`,
        replyTo: emailRes.settings.replyTo,
        providerConfigured: emailRes.readiness.providerConfigured,
        webhookConfigured: emailRes.readiness.webhookConfigured,
        testRecipientOverride: emailRes.settings.testRecipientOverride,
        allowedTestRecipients: emailRes.settings.allowedTestRecipients.length > 0
          ? emailRes.settings.allowedTestRecipients
          : (config.emailAllowedTestRecipients ?? []),
        ...(await notifications.emailOperationalSummary(database.db, a.organizationId)),
      },
    };
  });

  app.post('/webhooks/resend', async (req, reply) => {
    if (!config.resendWebhookSecret)
      return reply.code(503).send({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook is not configured.' } });
    const rawBody = (req as typeof req & { rawBody?: string }).rawBody;
    const id = req.headers['svix-id'];
    const timestamp = req.headers['svix-timestamp'];
    const signature = req.headers['svix-signature'];
    if (!rawBody || typeof id !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string')
      return reply.code(400).send({ error: { code: 'INVALID_WEBHOOK', message: 'Webhook signature headers are missing.' } });
    let event: { type: string; created_at?: string; data: Record<string, unknown> };
    try {
      const resend = new Resend(config.resendApiKey ?? 're_webhook_verification_only');
      event = resend.webhooks.verify({
        payload: rawBody,
        headers: { id, timestamp, signature },
        webhookSecret: config.resendWebhookSecret,
      }) as unknown as { type: string; created_at?: string; data: Record<string, unknown> };
    } catch {
      return reply.code(400).send({ error: { code: 'INVALID_WEBHOOK', message: 'Webhook signature is invalid.' } });
    }
    try {
      await notifications.ingestResendWebhook(database.db, {
        providerEventId: id,
        type: event.type,
        ...(event.created_at ? { createdAt: event.created_at } : {}),
        data: event.data,
        rawPayload: JSON.parse(rawBody) as Record<string, unknown>,
      });
      return reply.code(204).send();
    } catch (error) {
      req.log.error({ err: error, providerEventId: id }, 'Verified Resend webhook could not be persisted.');
      return reply.code(500).send({ error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Webhook could not be processed.' } });
    }
  });
}
