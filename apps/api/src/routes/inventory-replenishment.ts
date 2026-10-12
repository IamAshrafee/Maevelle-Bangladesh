import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  deleteReplenishmentPolicy,
  getReplenishmentPolicy,
  listReplenishmentPolicies,
  listReplenishmentRecommendations,
  putReplenishmentPolicy,
  ReplenishmentDomainError,
  type ReplenishmentPolicyInput,
} from '@maevelle/database/inventory-replenishment';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';
import { locationScopeIds } from '../authorization/location-scope.js';

type Auth = ReturnType<typeof createAuth>;

function headers(input: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function context(
  database: DatabaseClient,
  auth: Auth,
  requestHeaders: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(requestHeaders) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof requestHeaders['x-organization-id'] === 'string'
      ? { organizationId: requestHeaders['x-organization-id'] }
      : {}),
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}

function idempotencyKey(value: string | string[] | undefined): string | undefined {
  const key = Array.isArray(value) ? value[0] : value;
  return key && /^[\x21-\x7e]{1,128}$/.test(key) ? key : undefined;
}

function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof ReplenishmentDomainError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'STALE_VERSION'
          ? 412
          : error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_KEY_REUSED'
            ? 409
            : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
    return reply.code(409).send({
      error: { code: 'CONFLICT', message: 'A policy already exists for that item and location.' },
    });
  throw error;
}

const pageQuery = {
  search: Type.Optional(Type.String({ maxLength: 120 })),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
};

const nullableUuid = Type.Union([Type.String({ format: 'uuid' }), Type.Null()]);
const quantity = Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' });

export function registerInventoryReplenishmentRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/inventory/replenishment-policies',
    {
      schema: {
        querystring: Type.Object({
          ...pageQuery,
          inventoryItemId: Type.Optional(Type.String({ format: 'uuid' })),
          locationId: Type.Optional(Type.String({ format: 'uuid' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
      const query = request.query as {
        search?: string;
        inventoryItemId?: string;
        locationId?: string;
        page?: number;
        limit?: number;
      };
      const scope = locationScopeIds(active, 'inventory.view');
      if (query.locationId && scope && !scope.includes(query.locationId))
        return reply.code(403).send({ error: { code: 'LOCATION_SCOPE_FORBIDDEN' } });
      return {
        data: await listReplenishmentPolicies(database.db, active.organizationId, {
          ...(query.search ? { search: query.search } : {}),
          ...(query.inventoryItemId ? { inventoryItemId: query.inventoryItemId } : {}),
          ...(query.locationId
            ? { locationIds: [query.locationId] }
            : scope
              ? { locationIds: scope }
              : {}),
          ...(query.page ? { page: query.page } : {}),
          ...(query.limit ? { limit: query.limit } : {}),
        }),
      };
    },
  );

  app.get(
    '/admin/inventory/replenishment-recommendations',
    {
      schema: {
        querystring: Type.Object({
          ...pageQuery,
          locationId: Type.Optional(Type.String({ format: 'uuid' })),
          attentionOnly: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
      const query = request.query as {
        search?: string;
        locationId?: string;
        attentionOnly?: boolean;
        page?: number;
        limit?: number;
      };
      const scope = locationScopeIds(active, 'inventory.view');
      if (query.locationId && scope && !scope.includes(query.locationId))
        return reply.code(403).send({ error: { code: 'LOCATION_SCOPE_FORBIDDEN' } });
      return {
        data: await listReplenishmentRecommendations(database.db, active.organizationId, {
          ...(query.search ? { search: query.search } : {}),
          ...(query.locationId
            ? { locationIds: [query.locationId] }
            : scope
              ? { locationIds: scope }
              : {}),
          ...(query.attentionOnly === undefined ? {} : { attentionOnly: query.attentionOnly }),
          ...(query.page ? { page: query.page } : {}),
          ...(query.limit ? { limit: query.limit } : {}),
        }),
      };
    },
  );

  app.put(
    '/admin/inventory/replenishment-policies',
    {
      schema: {
        body: Type.Object({
          inventoryItemId: Type.String({ format: 'uuid' }),
          locationId: nullableUuid,
          reorderPoint: quantity,
          safetyStock: quantity,
          targetStock: quantity,
          leadTimeDays: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
          preferredSourceLocationId: nullableUuid,
          preferredSupplierId: nullableUuid,
          expectedVersion: Type.Integer({ minimum: 0 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(
        database,
        auth,
        request.headers,
        'inventory.replenishment.manage',
      );
      if (!active) return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
      const key = idempotencyKey(request.headers['idempotency-key']);
      if (!key)
        return reply.code(400).send({
          error: {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key is required for this inventory command.',
          },
        });
      const input = request.body as ReplenishmentPolicyInput;
      const scope = locationScopeIds(active, 'inventory.replenishment.manage');
      if (scope && (!input.locationId || !scope.includes(input.locationId)))
        return reply.code(403).send({
          error: {
            code: 'LOCATION_SCOPE_FORBIDDEN',
            message: 'This policy is outside your authorized location scope.',
          },
        });
      try {
        const policy = await putReplenishmentPolicy(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          idempotencyKey: key,
          input,
        });
        return reply.code(input.expectedVersion === 0 ? 201 : 200).send({ data: policy });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete(
    '/admin/inventory/replenishment-policies/:policyId',
    {
      schema: {
        params: Type.Object({ policyId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ expectedVersion: Type.Integer({ minimum: 1 }) }),
      },
    },
    async (request, reply) => {
      const active = await context(
        database,
        auth,
        request.headers,
        'inventory.replenishment.manage',
      );
      if (!active) return reply.code(403).send({ error: { code: 'FORBIDDEN' } });
      const key = idempotencyKey(request.headers['idempotency-key']);
      if (!key)
        return reply.code(400).send({
          error: {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key is required for this inventory command.',
          },
        });
      const { policyId } = request.params as { policyId: string };
      const policy = await getReplenishmentPolicy(
        database.db,
        active.organizationId,
        policyId,
      );
      if (!policy)
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'The replenishment policy was not found.' },
        });
      const scope = locationScopeIds(active, 'inventory.replenishment.manage');
      if (scope && (!policy.locationId || !scope.includes(policy.locationId)))
        return reply.code(403).send({ error: { code: 'LOCATION_SCOPE_FORBIDDEN' } });
      try {
        return {
          data: await deleteReplenishmentPolicy(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            policyId,
            expectedVersion: (request.body as { expectedVersion: number }).expectedVersion,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
