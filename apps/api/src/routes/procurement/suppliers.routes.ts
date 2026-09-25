import type { FastifyInstance } from 'fastify';
import type { Static } from 'typebox';
import type { DatabaseClient } from '@maevelle/database';
import {
  archiveSupplier,
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from '@maevelle/database/procurement';

import { requireAdmin, sendError, type Auth } from './common.js';
import {
  createSupplierBodySchema,
  listSuppliersQuerySchema,
  updateSupplierBodySchema,
  versionBodySchema,
} from './schemas.js';

type CreateSupplierBody = Static<typeof createSupplierBodySchema>;
type UpdateSupplierBody = Static<typeof updateSupplierBodySchema>;
type VersionBody = Static<typeof versionBodySchema>;

export function registerSupplierRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get(
    '/admin/suppliers',
    { schema: { querystring: listSuppliersQuerySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const query = request.query as Record<string, string | undefined>;
        const page = query.page ? Number.parseInt(query.page, 10) : undefined;
        const pageSize = query.pageSize ? Number.parseInt(query.pageSize, 10) : undefined;
        const search = query.search ?? query.q;
        const result = await listSuppliers(database.db, active.organizationId, {
          ...(page !== undefined ? { page } : {}),
          ...(pageSize !== undefined ? { pageSize } : {}),
          ...(search !== undefined ? { search } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.supplierType !== undefined ? { supplierType: query.supplierType } : {}),
          ...(query.countryCode !== undefined ? { countryCode: query.countryCode } : {}),
          ...(query.sortBy !== undefined ? { sortBy: query.sortBy as any } : {}),
          ...(query.sortOrder !== undefined ? { sortOrder: query.sortOrder as any } : {}),
        });
        return { data: result.items, pagination: result.pagination };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get('/admin/suppliers/:supplierId', async (request, reply) => {
    const active = await requireAdmin(database, auth, request.headers, 'procurement.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    try {
      return {
        data: await getSupplier(database.db, {
          organizationId: active.organizationId,
          supplierId: (request.params as { supplierId: string }).supplierId,
        }),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post(
    '/admin/suppliers',
    { schema: { body: createSupplierBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as CreateSupplierBody;
        const supplier = await createSupplier(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...body,
        });
        return reply.code(201).send({ data: supplier });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch(
    '/admin/suppliers/:supplierId',
    { schema: { body: updateSupplierBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as UpdateSupplierBody;
        const { version, ...changes } = body;
        return {
          data: await updateSupplier(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            supplierId: (request.params as { supplierId: string }).supplierId,
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
    '/admin/suppliers/:supplierId/archive',
    { schema: { body: versionBodySchema } },
    async (request, reply) => {
      const active = await requireAdmin(database, auth, request.headers, 'procurement.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        const body = request.body as VersionBody;
        return {
          data: await archiveSupplier(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            supplierId: (request.params as { supplierId: string }).supplierId,
            expectedVersion: body.version,
          }),
        };
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
