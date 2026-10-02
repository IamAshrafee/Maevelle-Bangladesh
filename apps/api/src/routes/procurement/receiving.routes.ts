import type { FastifyInstance } from 'fastify';
import { sql, type DatabaseClient } from '@maevelle/database';
import {
  getInboundReceipt,
  listInboundReceipts,
  postInboundReceipt,
  resolveReceiptLineCondition,
  reverseInboundReceipt,
} from '@maevelle/database/procurement';

import {
  canAccessLocation,
  locationScopeError,
  locationScopeIds,
} from '../../authorization/location-scope.js';
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
      const allowedLocationIds = locationScopeIds(active, 'receiving.view');
      try {
        const query = request.query as Record<string, string | undefined>;
        if (query.locationId && !canAccessLocation(active, 'receiving.view', query.locationId)) {
          return reply.code(403).send(locationScopeError());
        }
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
          ...(allowedLocationIds !== undefined ? { locationIds: allowedLocationIds } : {}),
          ...(query.fromDate !== undefined ? { fromDate: query.fromDate } : {}),
          ...(query.toDate !== undefined ? { toDate: query.toDate } : {}),
          ...(query.sortBy !== undefined
            ? { sortBy: query.sortBy as 'receiptNumber' | 'postedAt' | 'createdAt' }
            : {}),
          ...(query.sortOrder !== undefined
            ? { sortOrder: query.sortOrder as 'asc' | 'desc' }
            : {}),
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
      const receipt = await getInboundReceipt(database.db, {
        organizationId: active.organizationId,
        receiptId: (request.params as { receiptId: string }).receiptId,
      });
      if (!canAccessLocation(active, 'receiving.view', receipt.locationId)) {
        return reply.code(403).send(locationScopeError());
      }
      return { data: receipt };
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
      const shipmentId = (request.params as { shipmentId: string }).shipmentId;
      const shipmentRow = await sql<{ receiving_location_id: string }>`select receiving_location_id from inbound_shipment.shipments where organization_id = ${active.organizationId} and id = ${shipmentId}`.execute(database.db);
      if (shipmentRow.rows[0] && !canAccessLocation(active, 'receiving.post', shipmentRow.rows[0].receiving_location_id)) {
        return reply.code(403).send(locationScopeError());
      }
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        const body = request.body as Parameters<typeof postInboundReceipt>[1];
        return reply.code(201).send({
          data: await postInboundReceipt(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            shipmentId,
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
      const receiptId = (request.params as { receiptId: string }).receiptId;
      try {
        const receipt = await getInboundReceipt(database.db, {
          organizationId: active.organizationId,
          receiptId,
        });
        if (!canAccessLocation(active, 'receiving.adjust', receipt.locationId)) {
          return reply.code(403).send(locationScopeError());
        }
        const key = requireKey(reply, idempotencyKey(request.headers));
        if (!key) return;
        const body = request.body as { reason: string };
        return {
          data: await reverseInboundReceipt(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            receiptId,
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
      const receiptId = (request.params as { receiptId: string }).receiptId;
      try {
        const receipt = await getInboundReceipt(database.db, {
          organizationId: active.organizationId,
          receiptId,
        });
        if (!canAccessLocation(active, 'receiving.adjust', receipt.locationId)) {
          return reply.code(403).send(locationScopeError());
        }
        const key = requireKey(reply, idempotencyKey(request.headers));
        if (!key) return;
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
            receiptId,
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
