import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import * as assets from '@maevelle/database/assets';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
const uuid = Type.String({ format: 'uuid' });
const idempotencyKey = Type.String({ minLength: 8, maxLength: 200 });
const nullableUuid = Type.Optional(Type.Union([uuid, Type.Null()]));
const nullableText = (maxLength: number) =>
  Type.Optional(Type.Union([Type.String({ maxLength }), Type.Null()]));

function requestHeaders(source: Record<string, string | string[] | undefined>) {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}
async function authorize(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof headers['x-organization-id'] === 'string'
      ? { organizationId: headers['x-organization-id'] }
      : {}),
  });
  return context && { ...context, actorId: session.user.id };
}
function failure(
  reply: { code(value: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof assets.AssetDomainError)
    return reply
      .code(error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : 422)
      .send({ error: { code: error.code, message: error.message } });
  throw error;
}
const status = Type.Union(
  ['ACTIVE', 'IN_STORAGE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'SOLD', 'DISPOSED'].map((value) =>
    Type.Literal(value),
  ),
);
const mutableStatus = Type.Union(
  ['ACTIVE', 'IN_STORAGE', 'UNDER_REPAIR', 'DAMAGED', 'LOST'].map((value) => Type.Literal(value)),
);
const condition = Type.Union(
  ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'].map((value) => Type.Literal(value)),
);

export function registerAssetRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/assets/summary', async (request, reply) => {
    const c = await authorize(database, auth, request.headers, 'assets.view');
    if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: await assets.getAssetSummary(database.db, c.organizationId) };
  });
  app.get('/admin/assets/options', async (request, reply) => {
    const c = await authorize(database, auth, request.headers, 'assets.view');
    if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: await assets.getAssetOptions(database.db, c.organizationId) };
  });
  app.get('/admin/assets/categories', async (request, reply) => {
    const c = await authorize(database, auth, request.headers, 'assets.view');
    if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
    return { data: await assets.listAssetCategories(database.db, c.organizationId, true) };
  });
  app.post(
    '/admin/assets/categories',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 100 }),
          description: Type.Optional(Type.String({ maxLength: 500 })),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return reply.code(201).send({
          data: await assets.createAssetCategory(database.db, {
            ...(request.body as { name: string; description?: string; idempotencyKey: string }),
            organizationId: c.organizationId,
            actorId: c.actorId,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.patch(
    '/admin/assets/categories/:id',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 100 }),
          description: nullableText(500),
          status: Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')]),
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return {
          data: await assets.updateAssetCategory(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.updateAssetCategory>[1],
              'organizationId' | 'actorId' | 'categoryId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
            categoryId: (request.params as { id: string }).id,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.get(
    '/admin/assets',
    {
      schema: {
        querystring: Type.Object({
          search: Type.Optional(Type.String({ maxLength: 200 })),
          status: Type.Optional(status),
          condition: Type.Optional(condition),
          categoryId: Type.Optional(uuid),
          locationId: Type.Optional(uuid),
          custodianId: Type.Optional(uuid),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.view');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      return {
        data: await assets.listAssets(
          database.db,
          c.organizationId,
          request.query as Parameters<typeof assets.listAssets>[2],
        ),
      };
    },
  );
  app.get(
    '/admin/assets/:id',
    { schema: { params: Type.Object({ id: uuid }) } },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.view');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return {
          data: await assets.getAssetDetail(
            database.db,
            c.organizationId,
            (request.params as { id: string }).id,
          ),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1, maxLength: 200 }),
          categoryId: Type.Optional(uuid),
          description: Type.Optional(Type.String({ maxLength: 4000 })),
          brand: Type.Optional(Type.String({ maxLength: 120 })),
          model: Type.Optional(Type.String({ maxLength: 120 })),
          serialNumber: Type.Optional(Type.String({ maxLength: 200 })),
          condition: Type.Optional(condition),
          acquisitionSource: Type.Union(
            ['EXISTING', 'EXPENSE', 'PURCHASE', 'GIFT'].map((value) => Type.Literal(value)),
          ),
          acquisitionDate: Type.String({ format: 'date' }),
          acquisitionCost: Type.Optional(Type.String({ maxLength: 30 })),
          currencyCode: Type.String({ pattern: '^[A-Z]{3}$' }),
          expenseId: Type.Optional(uuid),
          purchaseId: Type.Optional(uuid),
          purchaseLineId: Type.Optional(uuid),
          locationId: Type.Optional(uuid),
          customLocation: Type.Optional(Type.String({ maxLength: 200 })),
          custodianMembershipId: Type.Optional(uuid),
          warrantyExpiresOn: Type.Optional(Type.String({ format: 'date' })),
          notes: Type.Optional(Type.String({ maxLength: 4000 })),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return reply.code(201).send({
          data: await assets.createAsset(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.createAsset>[1],
              'organizationId' | 'actorId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.patch(
    '/admin/assets/:id',
    {
      schema: {
        body: Type.Object({
          expectedVersion: Type.Integer({ minimum: 1 }),
          name: Type.String({ minLength: 1, maxLength: 200 }),
          categoryId: nullableUuid,
          description: nullableText(4000),
          brand: nullableText(120),
          model: nullableText(120),
          serialNumber: nullableText(200),
          condition,
          warrantyExpiresOn: Type.Optional(
            Type.Union([Type.String({ format: 'date' }), Type.Null()]),
          ),
          notes: nullableText(4000),
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return {
          data: await assets.updateAsset(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.updateAsset>[1],
              'organizationId' | 'actorId' | 'assetId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/assignment',
    {
      schema: {
        body: Type.Object({
          custodianMembershipId: nullableUuid,
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return {
          data: await assets.assignAsset(database.db, {
            ...(request.body as { custodianMembershipId?: string | null; expectedVersion: number }),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/location',
    {
      schema: {
        body: Type.Object({
          locationId: nullableUuid,
          customLocation: nullableText(200),
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return {
          data: await assets.moveAsset(database.db, {
            ...(request.body as {
              locationId?: string | null;
              customLocation?: string | null;
              expectedVersion: number;
            }),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/lifecycle',
    {
      schema: {
        body: Type.Object({
          status: mutableStatus,
          condition: Type.Optional(condition),
          reason: Type.String({ minLength: 4, maxLength: 1000 }),
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.lifecycle.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return {
          data: await assets.changeAssetLifecycle(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.changeAssetLifecycle>[1],
              'organizationId' | 'actorId' | 'assetId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/maintenance',
    {
      schema: {
        body: Type.Object({
          type: Type.Union(
            ['INSPECTION', 'SERVICE', 'REPAIR', 'PART_REPLACEMENT'].map((value) =>
              Type.Literal(value),
            ),
          ),
          occurredOn: Type.String({ format: 'date' }),
          issue: Type.Optional(Type.String({ maxLength: 2000 })),
          workPerformed: Type.String({ minLength: 1, maxLength: 4000 }),
          serviceProvider: Type.Optional(Type.String({ maxLength: 200 })),
          expenseId: Type.Optional(uuid),
          nextServiceOn: Type.Optional(Type.String({ format: 'date' })),
          notes: Type.Optional(Type.String({ maxLength: 4000 })),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return reply.code(201).send({
          data: await assets.recordMaintenance(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.recordMaintenance>[1],
              'organizationId' | 'actorId' | 'assetId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/maintenance/:maintenanceId/void',
    { schema: { body: Type.Object({ reason: Type.String({ minLength: 4, maxLength: 1000 }) }) } },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const params = request.params as { id: string; maintenanceId: string };
        return {
          data: await assets.voidMaintenance(database.db, {
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: params.id,
            maintenanceId: params.maintenanceId,
            reason: (request.body as { reason: string }).reason,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/media',
    {
      schema: {
        body: Type.Object({
          mediaAssetId: uuid,
          role: Type.Union(
            [
              'PHOTO',
              'PURCHASE_RECEIPT',
              'INVOICE',
              'WARRANTY',
              'REPAIR_RECEIPT',
              'SERIAL_PHOTO',
              'OTHER',
            ].map((value) => Type.Literal(value)),
          ),
          label: Type.Optional(Type.String({ maxLength: 160 })),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return reply.code(201).send({
          data: await assets.attachAssetMedia(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.attachAssetMedia>[1],
              'organizationId' | 'actorId' | 'assetId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.delete(
    '/admin/assets/:id/media/:linkId',
    { schema: { body: Type.Object({ reason: Type.String({ minLength: 4, maxLength: 1000 }) }) } },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        const params = request.params as { id: string; linkId: string };
        return {
          data: await assets.detachAssetMedia(database.db, {
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: params.id,
            linkId: params.linkId,
            reason: (request.body as { reason: string }).reason,
          }),
        };
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/sale',
    {
      schema: {
        body: Type.Object({
          accountId: uuid,
          amount: Type.String({ minLength: 1, maxLength: 30 }),
          occurredAt: Type.String({ format: 'date-time' }),
          buyerReference: Type.Optional(Type.String({ maxLength: 200 })),
          note: Type.Optional(Type.String({ maxLength: 1000 })),
          expectedVersion: Type.Integer({ minimum: 1 }),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.lifecycle.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return reply.code(201).send({
          data: await assets.sellAsset(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.sellAsset>[1],
              'organizationId' | 'actorId' | 'assetId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
  app.post(
    '/admin/assets/:id/disposal',
    {
      schema: {
        body: Type.Object({
          reason: Type.String({ minLength: 4, maxLength: 1000 }),
          occurredAt: Type.String({ format: 'date-time' }),
          expectedVersion: Type.Integer({ minimum: 1 }),
          idempotencyKey,
        }),
      },
    },
    async (request, reply) => {
      const c = await authorize(database, auth, request.headers, 'assets.lifecycle.manage');
      if (!c) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden.' } });
      try {
        return reply.code(201).send({
          data: await assets.disposeAsset(database.db, {
            ...(request.body as Omit<
              Parameters<typeof assets.disposeAsset>[1],
              'organizationId' | 'actorId' | 'assetId'
            >),
            organizationId: c.organizationId,
            actorId: c.actorId,
            assetId: (request.params as { id: string }).id,
          }),
        });
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
}
