import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';
import {
  checkSteadfastConnection,
  configureSteadfastAccount,
  getSteadfastConfigurations,
  setSteadfastAccountStatus,
  SteadfastIntegrationError,
  type SteadfastEnvironment,
} from '@maevelle/database/steadfast';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function headers(input: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function requireAdmin(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof source['x-organization-id'] === 'string'
      ? { organizationId: source['x-organization-id'] }
      : {}),
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

function encryptionKey(config: RuntimeConfig) {
  return {
    id: 'runtime-auth-key',
    value: Buffer.from(config.authEncryptionKey, 'base64'),
  };
}

function failure(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof SteadfastIntegrationError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'CONFLICT'
          ? 409
          : error.code === 'AUTHENTICATION_FAILED' || error.code === 'MISSING_CREDENTIALS'
            ? 422
            : error.code === 'RATE_LIMITED'
              ? 429
              : error.retryable
                ? 503
                : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export function registerSteadfastRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
): void {
  app.get(
    '/admin/integrations/steadfast',
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const accounts = await getSteadfastConfigurations(database.db, active.organizationId);
      return { data: accounts };
    },
  );

  app.put(
    '/admin/integrations/steadfast',
    {
      schema: {
        body: Type.Object({
          accountId: Type.Optional(Type.String({ minLength: 1 })),
          name: Type.Optional(Type.String({ minLength: 1 })),
          environment: Type.Union([Type.Literal('SANDBOX'), Type.Literal('PRODUCTION')]),
          credentials: Type.Optional(
            Type.Object({
              apiKey: Type.String({ minLength: 1 }),
              secretKey: Type.String({ minLength: 1 }),
            }),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          accountId?: string;
          name?: string;
          environment: SteadfastEnvironment;
          credentials?: { apiKey: string; secretKey: string };
        };
        const configured = await configureSteadfastAccount(
          database.db,
          encryptionKey(config),
          {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(body.accountId ? { accountId: body.accountId } : {}),
            ...(body.name ? { name: body.name } : {}),
            environment: body.environment,
            ...(body.credentials ? { credentials: body.credentials } : {}),
          },
        );
        return reply.code(200).send({ data: configured });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.post(
    '/admin/integrations/steadfast/:accountId/check-connection',
    { schema: { params: Type.Object({ accountId: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const result = await checkSteadfastConnection(
          database.db,
          encryptionKey(config),
          {
            organizationId: active.organizationId,
            accountId: (request.params as { accountId: string }).accountId,
          },
        );
        return { data: result };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.patch(
    '/admin/integrations/steadfast/:accountId/status',
    {
      schema: {
        params: Type.Object({ accountId: Type.String({ minLength: 1 }) }),
        body: Type.Object({
          status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('DISABLED')]),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await setSteadfastAccountStatus(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          accountId: (request.params as { accountId: string }).accountId,
          status: (request.body as { status: 'ACTIVE' | 'DISABLED' }).status,
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
}
