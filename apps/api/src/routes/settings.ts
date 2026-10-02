import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';
import {
  deleteIntegrationSecret,
  getModuleSettings,
  listAllSettings,
  resetModuleSettings,
  resetSingleSetting,
  saveIntegrationSecret,
  SettingsDomainError,
  updateModuleSettings,
  updateSingleSetting,
} from '@maevelle/database/settings';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function headers(source: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function context(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof source['x-organization-id'] === 'string'
      ? { organizationId: source['x-organization-id'] }
      : {}),
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}

function failure(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof SettingsDomainError) {
    const status =
      error.code === 'SETTING_NOT_FOUND'
        ? 404
        : error.code === 'VERSION_CONFLICT' || error.code === 'CONFIGURATION_CONFLICT'
          ? 409
          : error.code === 'SETTING_NOT_EDITABLE'
            ? 403
            : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

function resolveManageCapability(module: string): string {
  switch (module) {
    case 'email':
      return 'settings.email.manage';
    case 'media':
      return 'settings.media.manage';
    case 'storefront':
      return 'settings.storefront.manage';
    case 'integrations':
      return 'settings.integrations.manage';
    default:
      return 'settings.manage';
  }
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
): void {
  const encryptionKey = {
    id: 'runtime-auth-key',
    value: Buffer.from(config.authEncryptionKey, 'base64'),
  };

  // GET /admin/settings - List all modules and settings metadata + effective values
  app.get('/admin/settings', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'settings.view');
    if (!active) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    }

    try {
      const data = await listAllSettings(database.db, active.organizationId, config);
      return { data };
    } catch (error) {
      return failure(reply, error);
    }
  });

  // GET /admin/settings/:module - Get module specific settings, effective values, schema, and readiness
  app.get(
    '/admin/settings/:module',
    {
      schema: {
        params: Type.Object({
          module: Type.String({ minLength: 1, maxLength: 50 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'settings.view');
      if (!active) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      }

      const { module } = request.params as { module: string };

      try {
        const data = await getModuleSettings(database.db, active.organizationId, module, config);
        return { data };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  // PATCH /admin/settings/:module - Update settings for a module
  app.patch(
    '/admin/settings/:module',
    {
      schema: {
        params: Type.Object({
          module: Type.String({ minLength: 1, maxLength: 50 }),
        }),
        body: Type.Object({
          settings: Type.Record(Type.String(), Type.Unknown()),
          reason: Type.Optional(Type.String({ maxLength: 500 })),
          expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (request, reply) => {
      const { module } = request.params as { module: string };
      const capability = resolveManageCapability(module);
      const active = await context(database, auth, request.headers, capability);
      if (!active) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      }

      const body = request.body as {
        settings: Record<string, unknown>;
        reason?: string;
        expectedVersion?: number;
      };

      try {
        const data = await updateModuleSettings(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          module,
          settings: body.settings,
          ...(body.reason !== undefined ? { reason: body.reason } : {}),
          ...(body.expectedVersion !== undefined ? { expectedVersion: body.expectedVersion } : {}),
          deployment: config,
        });
        return { data };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  // POST /admin/settings/:module/reset - Reset a setting or entire module to default
  app.post(
    '/admin/settings/:module/reset',
    {
      schema: {
        params: Type.Object({
          module: Type.String({ minLength: 1, maxLength: 50 }),
        }),
        body: Type.Optional(
          Type.Object({
            key: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
            reason: Type.Optional(Type.String({ maxLength: 500 })),
          }),
        ),
      },
    },
    async (request, reply) => {
      const { module } = request.params as { module: string };
      const capability = resolveManageCapability(module);
      const active = await context(database, auth, request.headers, capability);
      if (!active) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      }

      const body = (request.body ?? {}) as { key?: string; reason?: string };

      try {
        if (body.key) {
          const data = await resetSingleSetting(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            key: body.key,
            ...(body.reason !== undefined ? { reason: body.reason } : {}),
            deployment: config,
          });
          return { data };
        }

        const data = await resetModuleSettings(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          module,
          ...(body.reason !== undefined ? { reason: body.reason } : {}),
          deployment: config,
        });
        return { data };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  // POST /admin/settings/integrations/:provider/secret - Store/rotate encrypted integration secret
  app.post(
    '/admin/settings/integrations/:provider/secret',
    {
      schema: {
        params: Type.Object({
          provider: Type.String({ minLength: 1, maxLength: 50 }),
        }),
        body: Type.Object({
          keyName: Type.String({ minLength: 1, maxLength: 50 }),
          secret: Type.String({ minLength: 1 }),
          reason: Type.Optional(Type.String({ maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'settings.integrations.manage');
      if (!active) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      }

      const { provider } = request.params as { provider: string };
      const body = request.body as { keyName: string; secret: string; reason?: string };

      try {
        const data = await saveIntegrationSecret(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          providerCode: provider,
          keyName: body.keyName,
          plaintextSecret: body.secret,
          encryptionKey,
          ...(body.reason !== undefined ? { reason: body.reason } : {}),
        });
        return reply.code(201).send({ data });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  // DELETE /admin/settings/integrations/:provider/secret - Revoke integration secret
  app.delete(
    '/admin/settings/integrations/:provider/secret',
    {
      schema: {
        params: Type.Object({
          provider: Type.String({ minLength: 1, maxLength: 50 }),
        }),
        querystring: Type.Object({
          keyName: Type.String({ minLength: 1, maxLength: 50 }),
          reason: Type.Optional(Type.String({ maxLength: 500 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'settings.integrations.manage');
      if (!active) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      }

      const { provider } = request.params as { provider: string };
      const query = request.query as { keyName: string; reason?: string };

      try {
        await deleteIntegrationSecret(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          providerCode: provider,
          keyName: query.keyName,
          ...(query.reason !== undefined ? { reason: query.reason } : {}),
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
}
