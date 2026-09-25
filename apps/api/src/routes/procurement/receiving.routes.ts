import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@maevelle/database';
import {
  getInboundReceipt,
  listInboundReceipts,
  postInboundReceipt,
  resolveReceiptLineCondition,
  reverseInboundReceipt,
} from '@maevelle/database/procurement';

import { idempotencyKey, requireAdmin, requireKey, sendError, type Auth } from './common.js';
import {
  listReceiptsQuerySchema,
  postInboundReceiptBodySchema,
  resolveConditionBodySchema,
  reverseInboundReceiptBodySchema,
} from './schemas.js';

export function registerReceivingRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/inbound-receipts',
    { schema: { querystring: listReceiptsQuerySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'receiving.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const query = request.query as Record<string, string | undefined>;
        const page = query.page ? Number.parseInt(query.page, 10) : undefined;
        const pageSize = query.pageSize ? Number.parseInt(query.pageSize, 10) : undefined;
        const search = query.search ?? query.q;
        const result = await listInboundReceipts(database.db, active.organizationId, {
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
          ...(search !== undefined ? { search } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.shipmentId !== undefined ? { shipmentId: query.shipmentId } : {}),
          ...(query.locationId !== undefined ? { locationId: query.locationId } : {}),
          ...(query.fromDate !== undefined ? { fromDate: query.fromDate } : {}),
          ...(query.toDate !== undefined ? { toDate: query.toDate } : {}),
          ...(query.sortBy !== undefined ? { sortBy: query.sortBy as any } : {}),
          ...(query.sortOrder !== undefined ? { sortOrder: query.sortOrder as any } : {}),
        });
        return { data: result.items, pagination: result.pagination };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/inbound-receipts/:receiptId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'receiving.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getInboundReceipt(database.db, {
          organizationId: active.organizationId,
          receiptId: (request.params as { receiptId: string }).receiptId,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post(
    '/admin/inbound-shipments/:shipmentId/receipts',
    { schema: { body: postInboundReceiptBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'receiving.post');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        const body = request.body as Parameters<typeof postInboundReceipt>[1];
        return reply.code(201).send({
          data: await postInboundReceipt(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            lines: body.lines,
            ...(body.packingSlipReference !== undefined
              ? { packingSlipReference: body.packingSlipReference }
              : {}),
            ...(body.notes !== undefined ? { notes: body.notes } : {}),
            idempotencyKey: key,
          }),
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/inbound-receipts/:receiptId/reverse',
    { schema: { body: reverseInboundReceiptBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'receiving.adjust');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        const body = request.body as { reason: string };
        return {
          data: await reverseInboundReceipt(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            receiptId: (request.params as { receiptId: string }).receiptId,
            reason: body.reason,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/inbound-receipts/:receiptId/resolve-condition',
    { schema: { body: resolveConditionBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'receiving.adjust');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        const body = request.body as {
          lineId: string;
          targetCondition: 'SELLABLE' | 'DAMAGED';
          quantity: string;
          reason?: string;
        };
        return {
          data: await resolveReceiptLineCondition(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            receiptId: (request.params as { receiptId: string }).receiptId,
            lineId: body.lineId,
            targetCondition: body.targetCondition,
            quantity: body.quantity,
            ...(body.reason !== undefined ? { reason: body.reason } : {}),
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
