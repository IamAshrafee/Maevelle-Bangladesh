import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  addPurchaseLine,
  archiveSupplier,
  cancelPurchase,
  cancelShipment,
  createPurchase,
  createShipment,
  createSupplier,
  getPurchase,
  getSupplyOverview,
  getShipment,
  listInboundReceipts,
  listPurchases,
  listShipments,
  listSuppliers,
  markShipmentArrived,
  markShipmentInTransit,
  placePurchase,
  postInboundReceipt,
  ProcurementDomainError,
  removePurchaseLine,
  updatePurchaseLine,
  updateSupplier,
} from '@maevelle/database/procurement';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

const quantity = Type.String({ pattern: '^\\d+(?:\\.\\d{1,6})?$' });
const condition = Type.Union([
  Type.Literal('SELLABLE'),
  Type.Literal('DAMAGED'),
  Type.Literal('QUARANTINE'),
  Type.Literal('INSPECTION'),
]);
const currency = Type.Union([Type.Literal('BDT'), Type.Literal('CNY'), Type.Literal('USD')]);
const supplierType = Type.Union([
  Type.Literal('MANUFACTURER'),
  Type.Literal('WHOLESALER'),
  Type.Literal('DISTRIBUTOR'),
  Type.Literal('AGENT'),
  Type.Literal('LOCAL_VENDOR'),
  Type.Literal('OTHER'),
]);

function pageOf<T>(items: readonly T[], query: unknown) {
  const input = (query ?? {}) as { page?: string; pageSize?: string };
  const page = Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(input.pageSize ?? '20', 10) || 20));
  const totalItems = items.length;
  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

function requestHeaders(value: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(value).flatMap(([name, header]) =>
      typeof header === 'string' ? [[name, header]] : [],
    ),
  );
}

async function requireAdmin(
  database: DatabaseClient,
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: requestHeaders(headers) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
  });
  return active ? { ...active, actorId: session.user.id } : undefined;
}

function idempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const value = headers['idempotency-key'];
  const key = Array.isArray(value) ? value[0] : value;
  return key && /^[\x21-\x7e]{1,128}$/.test(key) ? key : undefined;
}

function requireKey(
  reply: { code(status: number): { send(value: unknown): unknown } },
  key: string | undefined,
): string | undefined {
  if (key) return key;
  reply.code(400).send({
    error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required.' },
  });
  return undefined;
}

function sendError(
  reply: { code(status: number): { send(value: unknown): unknown } },
  error: unknown,
) {
  if (error instanceof ProcurementDomainError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : ['CONFLICT', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'OVER_RECEIPT'].includes(error.code)
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

export function registerProcurementRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/supply/overview', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await getSupplyOverview(database.db, active.organizationId) };
  });

  app.get('/admin/suppliers', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return pageOf(await listSuppliers(database.db, active.organizationId), request.query);
  });
  app.post(
    '/admin/suppliers',
    {
      schema: {
        body: Type.Object({
          code: Type.String({ minLength: 1 }),
          name: Type.String({ minLength: 1 }),
          contactName: Type.Optional(Type.String()),
          contactEmail: Type.Optional(Type.String()),
          contactPhone: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
          supplierType: Type.Optional(supplierType),
          countryCode: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
          preferredCurrencyCode: Type.Optional(currency),
          paymentTerms: Type.Optional(Type.String()),
          leadTimeDays: Type.Optional(Type.Integer({ minimum: 0 })),
          websiteUrl: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          code: string;
          name: string;
          contactName?: string;
          contactEmail?: string;
          contactPhone?: string;
          notes?: string;
          supplierType?:
            'MANUFACTURER' | 'WHOLESALER' | 'DISTRIBUTOR' | 'AGENT' | 'LOCAL_VENDOR' | 'OTHER';
          countryCode?: string;
          preferredCurrencyCode?: 'BDT' | 'CNY' | 'USD';
          paymentTerms?: string;
          leadTimeDays?: number;
          websiteUrl?: string;
        };
        return reply.code(201).send({
          data: await createSupplier(database.db, { ...active, ...body }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.patch(
    '/admin/suppliers/:supplierId',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          name: Type.Optional(Type.String({ minLength: 1 })),
          status: Type.Optional(
            Type.Union([
              Type.Literal('ACTIVE'),
              Type.Literal('INACTIVE'),
              Type.Literal('BLOCKED'),
              Type.Literal('ARCHIVED'),
            ]),
          ),
          supplierType: Type.Optional(supplierType),
          countryCode: Type.Optional(
            Type.Union([Type.String({ minLength: 2, maxLength: 2 }), Type.Null()]),
          ),
          preferredCurrencyCode: Type.Optional(Type.Union([currency, Type.Null()])),
          paymentTerms: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          leadTimeDays: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
          websiteUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          contactName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          contactEmail: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          contactPhone: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as Parameters<typeof updateSupplier>[1] & { version: number };
        const { version, ...changes } = body;
        return {
          data: await updateSupplier(database.db, {
            ...active,
            ...changes,
            supplierId: (request.params as { supplierId: string }).supplierId,
            expectedVersion: version,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/suppliers/:supplierId/archive',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await archiveSupplier(database.db, {
            ...active,
            supplierId: (request.params as { supplierId: string }).supplierId,
            expectedVersion: (request.body as { version: number }).version,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/purchases', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return pageOf(await listPurchases(database.db, active.organizationId), request.query);
  });
  app.get('/admin/purchases/:purchaseId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getPurchase(database.db, {
          organizationId: active.organizationId,
          purchaseId: (request.params as { purchaseId: string }).purchaseId,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.post(
    '/admin/purchases',
    {
      schema: {
        body: Type.Object({
          supplierId: Type.String({ minLength: 1 }),
          currencyCode: currency,
          notes: Type.Optional(Type.String()),
          supplierReference: Type.Optional(Type.String()),
          orderDate: Type.Optional(Type.String({ format: 'date' })),
          expectedDate: Type.Optional(Type.String({ format: 'date' })),
          destinationLocationId: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          supplierId: string;
          currencyCode: 'BDT' | 'CNY' | 'USD';
          notes?: string;
          supplierReference?: string;
          orderDate?: string;
          expectedDate?: string;
          destinationLocationId?: string;
        };
        return reply.code(201).send({
          data: await createPurchase(database.db, { ...active, ...body }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.patch(
    '/admin/purchases/:purchaseId/lines/:lineId',
    {
      schema: {
        body: Type.Object({
          quantity,
          unitPrice: Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const params = request.params as { purchaseId: string; lineId: string };
        return {
          data: await updatePurchaseLine(database.db, {
            ...active,
            ...params,
            ...(request.body as { quantity: string; unitPrice: string }),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.delete('/admin/purchases/:purchaseId/lines/:lineId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await removePurchaseLine(database.db, {
          ...active,
          ...(request.params as { purchaseId: string; lineId: string }),
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.post(
    '/admin/purchases/:purchaseId/lines',
    {
      schema: {
        body: Type.Object({
          variantId: Type.String({ minLength: 1 }),
          quantity,
          unitPrice: Type.String({ pattern: '^\\d+(?:\\.\\d{1,4})?$' }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { variantId: string; quantity: string; unitPrice: string };
        return {
          data: await addPurchaseLine(database.db, {
            ...active,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
            ...body,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/purchases/:purchaseId/cancel',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { version: number; reason: string };
        return {
          data: await cancelPurchase(database.db, {
            ...active,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
            expectedVersion: body.version,
            reason: body.reason,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/purchases/:purchaseId/place',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await placePurchase(database.db, {
            ...active,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
            expectedVersion: (request.body as { version: number }).version,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/inbound-shipments', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return pageOf(await listShipments(database.db, active.organizationId), request.query);
  });
  app.get('/admin/inbound-shipments/:shipmentId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getShipment(database.db, {
          organizationId: active.organizationId,
          shipmentId: (request.params as { shipmentId: string }).shipmentId,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
  app.post(
    '/admin/inbound-shipments',
    {
      schema: {
        body: Type.Object({
          receivingLocationId: Type.String({ minLength: 1 }),
          transportMode: Type.Union([
            Type.Literal('AIR'),
            Type.Literal('SEA'),
            Type.Literal('ROAD'),
            Type.Literal('RAIL'),
            Type.Literal('OTHER'),
          ]),
          originText: Type.Optional(Type.String()),
          trackingReference: Type.Optional(Type.String()),
          expectedArrivalDate: Type.Optional(Type.String({ format: 'date' })),
          allocations: Type.Array(
            Type.Object({ purchaseLineId: Type.String({ minLength: 1 }), quantity }),
            { minItems: 1 },
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as {
          receivingLocationId: string;
          transportMode: 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER';
          originText?: string;
          trackingReference?: string;
          expectedArrivalDate?: string;
          allocations: { purchaseLineId: string; quantity: string }[];
        };
        return reply.code(201).send({
          data: await createShipment(database.db, { ...active, ...body }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inbound-shipments/:shipmentId/depart',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        return {
          data: await markShipmentInTransit(database.db, {
            ...active,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: (request.body as { version: number }).version,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inbound-shipments/:shipmentId/cancel',
    {
      schema: {
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          reason: Type.String({ minLength: 1 }),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as { version: number; reason: string };
        return {
          data: await cancelShipment(database.db, {
            ...active,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: body.version,
            reason: body.reason,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
  app.post(
    '/admin/inbound-shipments/:shipmentId/arrive',
    { schema: { body: Type.Object({ version: Type.Integer({ minimum: 1 }) }) } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        return {
          data: await markShipmentArrived(database.db, {
            ...active,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: (request.body as { version: number }).version,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/inbound-receipts', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'receiving.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return pageOf(await listInboundReceipts(database.db, active.organizationId), request.query);
  });
  app.post(
    '/admin/inbound-shipments/:shipmentId/receipts',
    {
      schema: {
        body: Type.Object({
          lines: Type.Array(
            Type.Object({
              shipmentAllocationId: Type.String({ minLength: 1 }),
              condition,
              quantity,
            }),
            { minItems: 1 },
          ),
          packingSlipReference: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'receiving.post');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        const body = request.body as {
          lines: {
            shipmentAllocationId: string;
            condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
            quantity: string;
          }[];
          packingSlipReference?: string;
          notes?: string;
        };
        return reply.code(201).send({
          data: await postInboundReceipt(database.db, {
            ...active,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            ...body,
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
