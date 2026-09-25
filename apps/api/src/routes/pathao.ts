import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import {
  DeliveryDomainError,
  getCourierQuoteRequest,
  recordCourierQuote,
} from '@maevelle/database/delivery';
import {
  checkPathaoConnection,
  configurePathaoAccount,
  createPathaoProvider,
  getPathaoConfigurations,
  listPathaoLocationMappings,
  listPathaoStores,
  mapPathaoStore,
  PathaoIntegrationError,
  setPathaoAccountStatus,
  syncPathaoStores,
} from '@maevelle/database/pathao';
import { findActiveAdminContext } from '@maevelle/database/platform';

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
  if (error instanceof PathaoIntegrationError) {
    const status =
      error.code === 'ACCOUNT_NOT_FOUND'
        ? 404
        : error.code === 'CONFLICT'
          ? 409
          : error.code === 'AUTHENTICATION_FAILED'
            ? 422
            : error.code === 'RATE_LIMITED'
              ? 429
              : error.retryable
                ? 503
                : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof DeliveryDomainError)
    return reply
      .code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  throw error;
}

export function registerPathaoRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  config: RuntimeConfig,
): void {
  app.get(
    '/admin/integrations/pathao',
    {
      schema: {
        querystring: Type.Object({ accountId: Type.Optional(Type.String({ minLength: 1 })) }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const accounts = await getPathaoConfigurations(database.db, active.organizationId);
      const requestedId = (request.query as { accountId?: string }).accountId;
      const selectedAccountId = requestedId ?? accounts[0]?.accountId;
      if (requestedId && !accounts.some((account) => account.accountId === requestedId))
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Pathao account was not found.' } });
      const [stores, mappings] = selectedAccountId
        ? await Promise.all([
            listPathaoStores(database.db, active.organizationId, selectedAccountId),
            listPathaoLocationMappings(database.db, active.organizationId, selectedAccountId),
          ])
        : [[], []];
      return { data: { accounts, selectedAccountId, stores, mappings } };
    },
  );

  app.put(
    '/admin/integrations/pathao',
    {
      schema: {
        body: Type.Object({
          accountId: Type.Optional(Type.String({ minLength: 1 })),
          name: Type.String({ minLength: 1, maxLength: 120 }),
          environment: Type.Union([Type.Literal('SANDBOX'), Type.Literal('PRODUCTION')]),
          defaultDeliveryService: Type.Union([Type.Literal('NORMAL'), Type.Literal('ON_DEMAND')]),
          defaultItemType: Type.Union([Type.Literal('DOCUMENT'), Type.Literal('PARCEL')]),
          clientId: Type.String({ minLength: 1 }),
          clientSecret: Type.String({ minLength: 1 }),
          username: Type.String({ minLength: 1 }),
          password: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          accountId?: string;
          name: string;
          environment: 'SANDBOX' | 'PRODUCTION';
          defaultDeliveryService: 'NORMAL' | 'ON_DEMAND';
          defaultItemType: 'DOCUMENT' | 'PARCEL';
          clientId: string;
          clientSecret: string;
          username: string;
          password: string;
        };
        const saved = await configurePathaoAccount(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...(body.accountId ? { accountId: body.accountId } : {}),
          name: body.name,
          environment: body.environment,
          defaultDeliveryService: body.defaultDeliveryService,
          defaultItemType: body.defaultItemType,
          credentials: {
            clientId: body.clientId,
            clientSecret: body.clientSecret,
            username: body.username,
            password: body.password,
          },
          encryptionKey: encryptionKey(config),
        });
        return reply.code(body.accountId ? 200 : 201).send({ data: saved });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.post(
    '/admin/integrations/pathao/:accountId/check-connection',
    { schema: { params: Type.Object({ accountId: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await checkPathaoConnection(database.db, {
            organizationId: active.organizationId,
            accountId: (request.params as { accountId: string }).accountId,
            encryptionKey: encryptionKey(config),
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.patch(
    '/admin/integrations/pathao/:accountId/status',
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
        await setPathaoAccountStatus(database.db, {
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

  app.post(
    '/admin/integrations/pathao/:accountId/stores/sync',
    { schema: { params: Type.Object({ accountId: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await syncPathaoStores(database.db, {
            organizationId: active.organizationId,
            accountId: (request.params as { accountId: string }).accountId,
            encryptionKey: encryptionKey(config),
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.put(
    '/admin/integrations/pathao/:accountId/store-mappings/:locationId',
    {
      schema: {
        params: Type.Object({
          accountId: Type.String({ minLength: 1 }),
          locationId: Type.String({ minLength: 1 }),
        }),
        body: Type.Object({ providerStoreId: Type.String({ minLength: 1 }) }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'integrations.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const params = request.params as { accountId: string; locationId: string };
        await mapPathaoStore(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          accountId: params.accountId,
          locationId: params.locationId,
          providerStoreId: (request.body as { providerStoreId: string }).providerStoreId,
        });
        return reply.code(204).send();
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.post(
    '/admin/deliveries/:deliveryId/pathao-quotes',
    {
      schema: {
        params: Type.Object({ deliveryId: Type.String({ minLength: 1 }) }),
        body: Type.Object({
          integrationAccountId: Type.String({ minLength: 1 }),
          packageWeightKg: Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'delivery.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { integrationAccountId: string; packageWeightKg: string };
        const deliveryId = (request.params as { deliveryId: string }).deliveryId;
        const prepared = await getCourierQuoteRequest(database.db, {
          organizationId: active.organizationId,
          deliveryId,
          integrationAccountId: body.integrationAccountId,
          packageWeightKg: body.packageWeightKg,
        });
        const provider = await createPathaoProvider(database.db, {
          organizationId: active.organizationId,
          accountId: body.integrationAccountId,
          encryptionKey: encryptionKey(config),
        });
        if (!provider.quote)
          throw new PathaoIntegrationError(
            'CAPABILITY_NOT_SUPPORTED',
            'Pathao quoting is unavailable.',
          );
        const quote = await provider.quote(prepared.request);
        const persisted = await recordCourierQuote(database.db, {
          organizationId: active.organizationId,
          deliveryId,
          integrationAccountId: body.integrationAccountId,
          providerCode: prepared.providerCode,
          request: prepared.request,
          quote,
        });
        return reply.code(201).send({ data: { ...quote, ...persisted } });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
}
