import type { FastifyInstance } from 'fastify';
import type { Static } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import {
  cancelShipment,
  createShipment,
  getShipment,
  listShipments,
  markShipmentArrived,
  markShipmentInTransit,
  updateShipment,
  updateShipmentAllocations,
} from '@maevelle/database/procurement';

import { idempotencyKey, requireAdmin, requireKey, sendError, type Auth } from './common.js';
import {
  cancelShipmentBodySchema,
  createShipmentBodySchema,
  listShipmentsQuerySchema,
  updateShipmentAllocationsBodySchema,
  updateShipmentBodySchema,
  versionBodySchema,
} from './schemas.js';

type CreateShipmentBody = Static<typeof createShipmentBodySchema>;
type UpdateShipmentBody = Static<typeof updateShipmentBodySchema>;
type UpdateShipmentAllocationsBody = Static<typeof updateShipmentAllocationsBodySchema>;
type CancelShipmentBody = Static<typeof cancelShipmentBodySchema>;
type VersionBody = Static<typeof versionBodySchema>;

export function registerShipmentRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/inbound-shipments',
    { schema: { querystring: listShipmentsQuerySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const query = request.query as Record<string, string | undefined>;
        const page = query.page ? Number.parseInt(query.page, 10) : undefined;
        const pageSize = query.pageSize ? Number.parseInt(query.pageSize, 10) : undefined;
        const search = query.search ?? query.q;
        const result = await listShipments(database.db, active.organizationId, {
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
          ...(search !== undefined ? { search } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.receivingStatus !== undefined ? { receivingStatus: query.receivingStatus } : {}),
          ...(query.purchaseId !== undefined ? { purchaseId: query.purchaseId } : {}),
          ...(query.receivingLocationId !== undefined
            ? { receivingLocationId: query.receivingLocationId }
            : {}),
          ...(query.transportMode !== undefined ? { transportMode: query.transportMode } : {}),
          ...(query.sortBy !== undefined ? { sortBy: query.sortBy as any } : {}),
          ...(query.sortOrder !== undefined ? { sortOrder: query.sortOrder as any } : {}),
        });
        return { data: result.items, pagination: result.pagination };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

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
    { schema: { body: createShipmentBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CreateShipmentBody;
        const key = idempotencyKey(request.headers);
        const shipment = await createShipment(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
          ...(key ? { idempotencyKey: key } : {}),
        });
        return reply.code(201).send({ data: shipment });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/inbound-shipments/:shipmentId',
    { schema: { body: updateShipmentBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as UpdateShipmentBody;
        const { version, ...changes } = body;
        return {
          data: await updateShipment(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: version,
            ...changes,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.put(
    '/admin/inbound-shipments/:shipmentId/allocations',
    { schema: { body: updateShipmentAllocationsBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as UpdateShipmentAllocationsBody;
        const { version, allocations } = body;
        return {
          data: await updateShipmentAllocations(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: version,
            allocations,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/inbound-shipments/:shipmentId/depart',
    { schema: { body: versionBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        const body = request.body as VersionBody;
        return {
          data: await markShipmentInTransit(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: body.version,
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
    { schema: { body: cancelShipmentBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CancelShipmentBody;
        const key = idempotencyKey(request.headers);
        return {
          data: await cancelShipment(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: body.version,
            reason: body.reason,
            ...(key ? { idempotencyKey: key } : {}),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/inbound-shipments/:shipmentId/arrive',
    { schema: { body: versionBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'inbound_shipment.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      const key = requireKey(reply, idempotencyKey(request.headers));
      if (!key) return;
      try {
        const body = request.body as VersionBody;
        return {
          data: await markShipmentArrived(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            shipmentId: (request.params as { shipmentId: string }).shipmentId,
            expectedVersion: body.version,
            idempotencyKey: key,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
