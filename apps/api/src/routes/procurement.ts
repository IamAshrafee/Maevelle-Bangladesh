import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  addPurchaseLine,
  archiveSupplier,
  createPurchase,
  createShipment,
  createSupplier,
  getPurchase,
  getShipment,
  listInboundReceipts,
  listPurchases,
  listShipments,
  listSuppliers,
  markShipmentArrived,
  placePurchase,
  postInboundReceipt,
  ProcurementDomainError,
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
  app.get('/admin/suppliers', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listSuppliers(database.db, active.organizationId) };
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
        };
        return reply.code(201).send({
          data: await createSupplier(database.db, { ...active, ...body }),
        });
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
    return { data: await listPurchases(database.db, active.organizationId) };
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
          currencyCode: Type.Union([Type.Literal('BDT'), Type.Literal('CNY'), Type.Literal('USD')]),
          notes: Type.Optional(Type.String()),
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
        };
        return reply.code(201).send({
          data: await createPurchase(database.db, { ...active, ...body }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
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
    return { data: await listShipments(database.db, active.organizationId) };
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
    return { data: await listInboundReceipts(database.db, active.organizationId) };
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
