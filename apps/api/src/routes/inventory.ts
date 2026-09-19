import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  adjustInventory,
  addFoundStocktakeLine,
  createInventoryReservation,
  listInventoryBalances,
  listInventoryItemChoices,
  listInventoryPositions,
  listInventoryHistory,
  moveInventoryCondition,
  postStocktake,
  submitStocktakeForReview,
  cancelStocktake,
  recordStocktakeCount,
  releaseInventoryReservation,
  startStocktake,
  getStocktakeWorkspace,
  listStocktakeSessions,
  getInventoryStats,
  getInventoryItemDetail,
  listInventoryReservations,
  InventoryDomainError,
} from '@maevelle/database/inventory';
import { WarehouseDomainError } from '@maevelle/database/warehouse';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
const condition = Type.Union([
  Type.Literal('SELLABLE'),
  Type.Literal('DAMAGED'),
  Type.Literal('QUARANTINE'),
  Type.Literal('INSPECTION'),
]);
const quantity = Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' });
const inventoryTransactionType = Type.Union([
  Type.Literal('OPENING_BALANCE'),
  Type.Literal('ADJUSTMENT'),
  Type.Literal('CONDITION_CHANGE'),
  Type.Literal('TRANSFER_DISPATCH'),
  Type.Literal('TRANSFER_RECEIPT'),
  Type.Literal('STOCKTAKE_ADJUSTMENT'),
  Type.Literal('FULFILLMENT_DISPATCH'),
  Type.Literal('INBOUND_RECEIPT'),
  Type.Literal('RETURN_RECEIPT'),
]);

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
  if (error instanceof InventoryDomainError || error instanceof WarehouseDomainError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'INSUFFICIENT_STOCK'
          ? 422
          : error.code === 'STALE_VERSION'
            ? 412
            : error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_KEY_REUSED'
              ? 409
              : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
    return reply
      .code(409)
      .send({ error: { code: 'CONFLICT', message: 'That record already exists.' } });
  throw error;
}

function requireKey(
  reply: { code(status: number): { send(value: unknown): unknown } },
  key: string | undefined,
) {
  return (
    key ??
    reply.code(400).send({
      error: {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required for this inventory command.',
      },
    })
  );
}

export function registerInventoryRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/inventory/items',
    {
      schema: {
        querystring: Type.Object({
          search: Type.Optional(Type.String({ maxLength: 120 })),
          sku: Type.Optional(Type.String({ maxLength: 120 })),
          productId: Type.Optional(Type.String({ format: 'uuid' })),
          variantId: Type.Optional(Type.String({ format: 'uuid' })),
          catalogStatus: Type.Optional(
            Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')]),
          ),
          positionState: Type.Optional(
            Type.Union([Type.Literal('NO_POSITION'), Type.Literal('HAS_POSITION')]),
          ),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listInventoryItemChoices(
          database.db,
          active.organizationId,
          request.query as {
            search?: string;
            sku?: string;
            productId?: string;
            variantId?: string;
            catalogStatus?: 'ACTIVE' | 'ARCHIVED';
            positionState?: 'NO_POSITION' | 'HAS_POSITION';
            page?: number;
            limit?: number;
          },
        ),
      };
    },
  );
  app.get(
    '/admin/inventory/positions',
    {
      schema: {
        querystring: Type.Object({
          locationId: Type.Optional(Type.String({ format: 'uuid' })),
          search: Type.Optional(Type.String({ maxLength: 120 })),
          condition: Type.Optional(condition),
          availability: Type.Optional(
            Type.Union([
              Type.Literal('IN_STOCK'),
              Type.Literal('LOW_STOCK'),
              Type.Literal('OUT_OF_STOCK'),
            ]),
          ),
          catalogStatus: Type.Optional(
            Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')]),
          ),
          sortBy: Type.Optional(
            Type.Union([
              Type.Literal('PRODUCT'),
              Type.Literal('SKU'),
              Type.Literal('ON_HAND'),
              Type.Literal('AVAILABLE'),
              Type.Literal('LAST_MOVEMENT'),
            ]),
          ),
          sortOrder: Type.Optional(Type.Union([Type.Literal('ASC'), Type.Literal('DESC')])),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listInventoryPositions(
          database.db,
          active.organizationId,
          request.query as {
            locationId?: string;
            search?: string;
            condition?: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
            availability?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
            catalogStatus?: 'ACTIVE' | 'ARCHIVED';
            sortBy?: 'PRODUCT' | 'SKU' | 'ON_HAND' | 'AVAILABLE' | 'LAST_MOVEMENT';
            sortOrder?: 'ASC' | 'DESC';
            page?: number;
            limit?: number;
          },
        ),
      };
    },
  );
  app.get(
    '/admin/inventory/stock',
    {
      schema: {
        querystring: Type.Object({
          locationId: Type.Optional(Type.String()),
          search: Type.Optional(Type.String()),
          condition: Type.Optional(condition),
          availability: Type.Optional(
            Type.Union([
              Type.Literal('IN_STOCK'),
              Type.Literal('LOW_STOCK'),
              Type.Literal('OUT_OF_STOCK'),
            ]),
          ),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listInventoryBalances(
          database.db,
          active.organizationId,
          request.query as {
            locationId?: string;
            search?: string;
            condition?: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
            availability?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
            page?: number;
            limit?: number;
          },
        ),
      };
    },
  );
  app.get(
    '/admin/inventory/history',
    {
      schema: {
        querystring: Type.Object({
          inventoryItemId: Type.Optional(Type.String({ format: 'uuid' })),
          locationId: Type.Optional(Type.String({ format: 'uuid' })),
          transactionType: Type.Optional(inventoryTransactionType),
          condition: Type.Optional(condition),
          search: Type.Optional(Type.String({ maxLength: 120 })),
          dateFrom: Type.Optional(Type.String({ format: 'date' })),
          dateTo: Type.Optional(Type.String({ format: 'date' })),
          sortOrder: Type.Optional(Type.Union([Type.Literal('ASC'), Type.Literal('DESC')])),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listInventoryHistory(
          database.db,
          active.organizationId,
          request.query as {
            inventoryItemId?: string;
            locationId?: string;
            transactionType?: string;
            condition?: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
            search?: string;
            dateFrom?: string;
            dateTo?: string;
            sortOrder?: 'ASC' | 'DESC';
            page?: number;
            limit?: number;
          },
        ),
      };
    },
  );
  app.post(
    '/admin/inventory/adjustments',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          locationId: Type.String(),
          condition,
          quantityDelta: Type.String({ pattern: '^-?\\d+(?:\\.\\d{1,6})?$' }),
          reasonCode: Type.Union([
            Type.Literal('OPENING_BALANCE'),
            Type.Literal('CORRECTION'),
            Type.Literal('DAMAGE'),
            Type.Literal('FOUND_STOCK'),
            Type.Literal('OTHER'),
          ]),
          note: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.adjust');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers['idempotency-key']));
      if (!key || typeof key !== 'string') return key;
      try {
        return reply.code(201).send({
          data: await adjustInventory(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as Omit<
              Parameters<typeof adjustInventory>[1],
              'organizationId' | 'actorId' | 'idempotencyKey'
            >),
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inventory/condition-movements',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          locationId: Type.String(),
          fromCondition: condition,
          toCondition: condition,
          quantity,
          reason: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.adjust');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers['idempotency-key']));
      if (!key || typeof key !== 'string') return key;
      try {
        return reply.code(201).send({
          data: await moveInventoryCondition(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as Omit<
              Parameters<typeof moveInventoryCondition>[1],
              'organizationId' | 'actorId' | 'idempotencyKey'
            >),
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inventory/reservations',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String(),
          locationId: Type.String(),
          quantity,
          sourceType: Type.String({ minLength: 1 }),
          sourceReference: Type.String({ minLength: 1 }),
          expiresAt: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.reserve');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers['idempotency-key']));
      if (!key || typeof key !== 'string') return key;
      try {
        const body = request.body as {
          variantId: string;
          locationId: string;
          quantity: string;
          sourceType: string;
          sourceReference: string;
          expiresAt?: string;
        };
        return reply.code(201).send({
          data: await createInventoryReservation(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            variantId: body.variantId,
            locationId: body.locationId,
            quantity: body.quantity,
            sourceType: body.sourceType,
            sourceReference: body.sourceReference,
            ...(body.expiresAt ? { expiresAt: new Date(body.expiresAt) } : {}),
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post('/admin/inventory/reservations/:reservationId/release', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'inventory.reserve');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const key = requireKey(reply, idempotencyKey(request.headers['idempotency-key']));
    if (!key || typeof key !== 'string') return key;
    try {
      return {
        data: await releaseInventoryReservation(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          reservationId: (request.params as { reservationId: string }).reservationId,
          idempotencyKey: key,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.post(
    '/admin/inventory/stocktakes',
    { schema: { body: Type.Object({ locationId: Type.String() }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.stocktake');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await startStocktake(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as { locationId: string }),
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.get('/admin/inventory/stocktakes/:stocktakeId', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'inventory.stocktake');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const workspace = await getStocktakeWorkspace(
      database.db,
      active.organizationId,
      (request.params as { stocktakeId: string }).stocktakeId,
    );
    return workspace ? { data: workspace } : reply.code(404).send({ error: 'NOT_FOUND' });
  });
  app.post(
    '/admin/inventory/stocktakes/:stocktakeId/lines/:inventoryItemId/count',
    {
      schema: {
        body: Type.Object({
          countedQuantity: quantity,
          countedQuantitiesByCondition: Type.Optional(
            Type.Object({
              SELLABLE: Type.Optional(quantity),
              DAMAGED: Type.Optional(quantity),
              QUARANTINE: Type.Optional(quantity),
              INSPECTION: Type.Optional(quantity),
            }),
          ),
          version: Type.Integer({ minimum: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.stocktake');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          countedQuantity: string;
          countedQuantitiesByCondition?: Partial<
            Record<'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION', string>
          >;
          version: number;
        };
        await recordStocktakeCount(database.db, {
          organizationId: active.organizationId,
          stocktakeId: (request.params as { stocktakeId: string }).stocktakeId,
          inventoryItemId: (request.params as { inventoryItemId: string }).inventoryItemId,
          ...body,
          expectedVersion: body.version,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inventory/stocktakes/:stocktakeId/found-lines',
    {
      schema: {
        body: Type.Object({ variantId: Type.String(), version: Type.Integer({ minimum: 1 }) }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.stocktake');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { variantId: string; version: number };
        return reply.code(201).send({
          data: await addFoundStocktakeLine(database.db, {
            organizationId: active.organizationId,
            stocktakeId: (request.params as { stocktakeId: string }).stocktakeId,
            variantId: body.variantId,
            expectedVersion: body.version,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inventory/stocktakes/:stocktakeId/submit-review',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.stocktake');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { version: number };
        return {
          data: await submitStocktakeForReview(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            stocktakeId: (request.params as { stocktakeId: string }).stocktakeId,
            expectedVersion: body.version,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inventory/stocktakes/:stocktakeId/cancel',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.stocktake');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { version: number };
        return {
          data: await cancelStocktake(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            stocktakeId: (request.params as { stocktakeId: string }).stocktakeId,
            expectedVersion: body.version,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post('/admin/inventory/stocktakes/:stocktakeId/post', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'inventory.stocktake');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const key = requireKey(reply, idempotencyKey(request.headers['idempotency-key']));
    if (!key || typeof key !== 'string') return key;
    try {
      return {
        data: await postStocktake(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          stocktakeId: (request.params as { stocktakeId: string }).stocktakeId,
          idempotencyKey: key,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/admin/inventory/stats', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'inventory.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await getInventoryStats(database.db, active.organizationId) };
  });

  app.get(
    '/admin/inventory/stock/:inventoryItemId',
    {
      schema: {
        params: Type.Object({ inventoryItemId: Type.String({ format: 'uuid' }) }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const detail = await getInventoryItemDetail(
        database.db,
        active.organizationId,
        (request.params as { inventoryItemId: string }).inventoryItemId,
      );
      return detail ? { data: detail } : reply.code(404).send({ error: 'NOT_FOUND' });
    },
  );

  app.get(
    '/admin/inventory/reservations',
    {
      schema: {
        querystring: Type.Object({
          locationId: Type.Optional(Type.String({ format: 'uuid' })),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ALL')])),
          search: Type.Optional(Type.String({ maxLength: 120 })),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listInventoryReservations(
          database.db,
          active.organizationId,
          request.query as {
            locationId?: string;
            status?: 'ACTIVE' | 'ALL';
            search?: string;
            page?: number;
            limit?: number;
          },
        ),
      };
    },
  );

  app.get(
    '/admin/inventory/stocktakes',
    {
      schema: {
        querystring: Type.Object({
          locationId: Type.Optional(Type.String()),
          status: Type.Optional(Type.String()),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'inventory.stocktake');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await listStocktakeSessions(
          database.db,
          active.organizationId,
          request.query as { locationId?: string; status?: string; page?: number; limit?: number },
        ),
      };
    },
  );
}
