import type { FastifyInstance } from 'fastify';
import type { Static } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import {
  addPurchaseLine,
  cancelPurchase,
  closePurchase,
  createPurchase,
  getPurchase,
  getSupplyOverview,
  listPurchases,
  placePurchase,
  removePurchaseLine,
  updatePurchase,
  updatePurchaseLine,
} from '@maevelle/database/procurement';

import { idempotencyKey, requireAdmin, sendError, type Auth } from './common.js';
import {
  addPurchaseLineBodySchema,
  cancelPurchaseBodySchema,
  closePurchaseBodySchema,
  createPurchaseBodySchema,
  listPurchasesQuerySchema,
  updatePurchaseBodySchema,
  updatePurchaseLineBodySchema,
  versionBodySchema,
} from './schemas.js';

type CreatePurchaseBody = Static<typeof createPurchaseBodySchema>;
type UpdatePurchaseBody = Static<typeof updatePurchaseBodySchema>;
type AddPurchaseLineBody = Static<typeof addPurchaseLineBodySchema>;
type UpdatePurchaseLineBody = Static<typeof updatePurchaseLineBodySchema>;
type CancelPurchaseBody = Static<typeof cancelPurchaseBodySchema>;
type ClosePurchaseBody = Static<typeof closePurchaseBodySchema>;
type VersionBody = Static<typeof versionBodySchema>;

export function registerPurchaseRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/supply/overview', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return { data: await getSupplyOverview(database.db, active.organizationId) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get(
    '/admin/purchases',
    { schema: { querystring: listPurchasesQuerySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const query = request.query as Record<string, string | undefined>;
        const page = query.page ? Number.parseInt(query.page, 10) : undefined;
        const pageSize = query.pageSize ? Number.parseInt(query.pageSize, 10) : undefined;
        const search = query.search ?? query.q;
        const result = await listPurchases(database.db, active.organizationId, {
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
          ...(search !== undefined ? { search } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.supplierId !== undefined ? { supplierId: query.supplierId } : {}),
          ...(query.currencyCode !== undefined
            ? { currencyCode: query.currencyCode as 'BDT' | 'CNY' | 'USD' }
            : {}),
          ...(query.destinationLocationId !== undefined
            ? { destinationLocationId: query.destinationLocationId }
            : {}),
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
    { schema: { body: createPurchaseBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CreatePurchaseBody;
        const key = idempotencyKey(request.headers);
        const purchase = await createPurchase(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
          ...(key ? { idempotencyKey: key } : {}),
        });
        return reply.code(201).send({ data: purchase });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/purchases/:purchaseId',
    { schema: { body: updatePurchaseBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as UpdatePurchaseBody;
        const { version, ...changes } = body;
        return {
          data: await updatePurchase(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
            expectedVersion: version,
            ...changes,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/purchases/:purchaseId/lines',
    { schema: { body: addPurchaseLineBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as AddPurchaseLineBody;
        return {
          data: await addPurchaseLine(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
            ...body,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/purchases/:purchaseId/lines/:lineId',
    { schema: { body: updatePurchaseLineBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const params = request.params as { purchaseId: string; lineId: string };
        const body = request.body as UpdatePurchaseLineBody;
        return {
          data: await updatePurchaseLine(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            purchaseId: params.purchaseId,
            lineId: params.lineId,
            ...body,
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
      const params = request.params as { purchaseId: string; lineId: string };
      return {
        data: await removePurchaseLine(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          purchaseId: params.purchaseId,
          lineId: params.lineId,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post(
    '/admin/purchases/:purchaseId/place',
    { schema: { body: versionBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as VersionBody;
        const key = idempotencyKey(request.headers);
        return {
          data: await placePurchase(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
            expectedVersion: body.version,
            ...(key ? { idempotencyKey: key } : {}),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/purchases/:purchaseId/close',
    { schema: { body: closePurchaseBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as ClosePurchaseBody;
        const key = idempotencyKey(request.headers);
        return {
          data: await closePurchase(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
            expectedVersion: body.version,
            ...(body.reason !== undefined ? { reason: body.reason } : {}),
            ...(key ? { idempotencyKey: key } : {}),
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.post(
    '/admin/purchases/:purchaseId/cancel',
    { schema: { body: cancelPurchaseBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CancelPurchaseBody;
        const key = idempotencyKey(request.headers);
        return {
          data: await cancelPurchase(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            purchaseId: (request.params as { purchaseId: string }).purchaseId,
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
}
