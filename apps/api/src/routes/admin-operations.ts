import type { FastifyInstance, FastifyReply } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import * as operations from '@maevelle/database/admin-operations';
import * as integrity from '@maevelle/database/integrity';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
function headers(source: Record<string, string | string[] | undefined>) {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}
async function context(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  capability: string,
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  const active = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof source['x-organization-id'] === 'string'
      ? { organizationId: source['x-organization-id'] }
      : {}),
  });
  return active && { ...active, actorId: session.user.id };
}

export function registerAdminOperationsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/operations/overview', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.operations.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await operations.getOperationsOverview(
        database.db,
        active.organizationId,
        active.capabilities,
      ),
    };
  });
  app.get(
    '/admin/search',
    { schema: { querystring: Type.Object({ q: Type.String({ minLength: 2, maxLength: 120 }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.operations.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await operations.globalSearch(
          database.db,
          active.organizationId,
          (request.query as { q: string }).q,
          active.capabilities,
        ),
      };
    },
  );
  app.get('/admin/saved-views', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.saved_views.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await operations.listSavedViews(database.db, active.organizationId, active.actorId),
    };
  });
  app.post(
    '/admin/saved-views',
    {
      schema: {
        body: Type.Object({
          resourceKey: Type.String(),
          name: Type.String({ minLength: 1, maxLength: 100 }),
          filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
          sort: Type.Optional(Type.Array(Type.Unknown())),
          columns: Type.Optional(Type.Array(Type.String())),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.saved_views.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await operations.saveView(database.db, {
            organizationId: active.organizationId,
            userId: active.actorId,
            ...(request.body as Omit<
              Parameters<typeof operations.saveView>[1],
              'organizationId' | 'userId'
            >),
          }),
        });
      } catch (error) {
        return reply
          .code(422)
          .send({ error: error instanceof Error ? error.message : 'INVALID_VIEW' });
      }
    },
  );
  app.patch(
    '/admin/saved-views/:viewId',
    {
      schema: {
        params: Type.Object({ viewId: Type.String() }),
        body: Type.Object({
          name: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
          filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
          sort: Type.Optional(Type.Array(Type.Unknown())),
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')])),
          isDefault: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.saved_views.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await operations.updateSavedView(database.db, {
            organizationId: active.organizationId,
            userId: active.actorId,
            viewId: (request.params as { viewId: string }).viewId,
            ...(request.body as {
              name?: string;
              filters?: unknown;
              sort?: unknown;
              status?: 'ACTIVE' | 'ARCHIVED';
              isDefault?: boolean;
            }),
          }),
        };
      } catch (error) {
        return reply
          .code(422)
          .send({ error: error instanceof Error ? error.message : 'INVALID_VIEW' });
      }
    },
  );
  const integrityError = (reply: FastifyReply, error: unknown) => {
    if (!(error instanceof integrity.IntegrityDomainError))
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Integrity operation failed.' } });
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'CONFLICT' || error.code === 'STALE_VERSION'
          ? 409
          : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  };
  app.get('/admin/integrity/checks', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.integrity.view');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return { data: integrity.listIntegrityChecks() };
  });
  const findingQuery = Type.Object({
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    status: Type.Optional(Type.String()),
    severity: Type.Optional(Type.String()),
    module: Type.Optional(Type.String()),
  });
  app.get('/admin/integrity', { schema: { querystring: findingQuery } }, async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.integrity.view');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    const query = request.query as {
      page?: number;
      pageSize?: number;
      status?: string;
      severity?: string;
      module?: string;
    };
    const result = await integrity.listIntegrityFindings(database.db, {
      organizationId: active.organizationId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.module ? { module: query.module } : {}),
    });
    return { data: result.items, meta: { pagination: result.pagination } };
  });
  app.get(
    '/admin/integrity/findings/:findingId',
    { schema: { params: Type.Object({ findingId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await integrity.getIntegrityFinding(
            database.db,
            active.organizationId,
            (request.params as { findingId: string }).findingId,
          ),
        };
      } catch (error) {
        return integrityError(reply, error);
      }
    },
  );
  app.patch(
    '/admin/integrity/findings/:findingId',
    {
      schema: {
        params: Type.Object({ findingId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          version: Type.Integer({ minimum: 1 }),
          status: Type.Union([
            Type.Literal('OPEN'),
            Type.Literal('INVESTIGATING'),
            Type.Literal('ACCEPTED'),
          ]),
          reason: Type.Optional(Type.String({ minLength: 8, maxLength: 1000 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await integrity.updateFindingStatus(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            findingId: (request.params as { findingId: string }).findingId,
            ...(request.body as {
              version: number;
              status: 'OPEN' | 'INVESTIGATING' | 'ACCEPTED';
              reason?: string;
            }),
          }),
        };
      } catch (error) {
        return integrityError(reply, error);
      }
    },
  );
  app.get(
    '/admin/integrity/runs',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const query = request.query as { page?: number; pageSize?: number };
      const result = await integrity.listIntegrityRuns(
        database.db,
        active.organizationId,
        query.page ?? 1,
        query.pageSize ?? 25,
      );
      return { data: result.items, meta: { pagination: result.pagination } };
    },
  );
  app.get(
    '/admin/integrity/runs/:runId',
    { schema: { params: Type.Object({ runId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.view');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await integrity.getIntegrityRun(
            database.db,
            active.organizationId,
            (request.params as { runId: string }).runId,
          ),
        };
      } catch (error) {
        return integrityError(reply, error);
      }
    },
  );
  app.post(
    '/admin/integrity/runs',
    {
      schema: {
        body: Type.Object({
          module: Type.Optional(Type.String({ maxLength: 80 })),
          checkIds: Type.Optional(
            Type.Array(Type.String({ maxLength: 120 }), { minItems: 1, maxItems: 25 }),
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.run');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        const body = request.body as { module?: string; checkIds?: string[] };
        return reply.code(202).send({
          data: await integrity.requestIntegrityRun(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            triggerType: body.module || body.checkIds ? 'TARGETED' : 'MANUAL',
            ...(body.module ? { module: body.module } : {}),
            ...(body.checkIds ? { checkIds: body.checkIds } : {}),
          }),
        });
      } catch (error) {
        return integrityError(reply, error);
      }
    },
  );
  app.post(
    '/admin/integrity/findings/:findingId/repair-preview',
    { schema: { params: Type.Object({ findingId: Type.String({ format: 'uuid' }) }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.repair');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await integrity.previewIntegrityRepair(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            findingId: (request.params as { findingId: string }).findingId,
          }),
        };
      } catch (error) {
        return integrityError(reply, error);
      }
    },
  );
  app.post(
    '/admin/integrity/findings/:findingId/repairs',
    {
      schema: {
        params: Type.Object({ findingId: Type.String({ format: 'uuid' }) }),
        headers: Type.Object(
          { 'idempotency-key': Type.String({ minLength: 8, maxLength: 200 }) },
          { additionalProperties: true },
        ),
        body: Type.Object({
          findingVersion: Type.Integer({ minimum: 1 }),
          repairKey: Type.Union([Type.Literal('ANALYTICS'), Type.Literal('REVIEW_RATINGS')]),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.repair');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      try {
        return {
          data: await integrity.executeIntegrityRepair(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            findingId: (request.params as { findingId: string }).findingId,
            idempotencyKey: String(request.headers['idempotency-key']),
            ...(request.body as {
              findingVersion: number;
              repairKey: 'ANALYTICS' | 'REVIEW_RATINGS';
            }),
          }),
        };
      } catch (error) {
        return integrityError(reply, error);
      }
    },
  );
  app.post(
    '/admin/imports/catalog-products',
    {
      schema: {
        body: Type.Object({
          filename: Type.String({ minLength: 1, maxLength: 255 }),
          rows: Type.Array(
            Type.Object({
              productTypeId: Type.Optional(Type.String()),
              title: Type.Optional(Type.String()),
              handle: Type.Optional(Type.String()),
              description: Type.Optional(Type.String()),
            }),
            { minItems: 1, maxItems: 500 },
          ),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.imports.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return reply.code(201).send({
          data: await operations.createCatalogImport(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as {
              filename: string;
              rows: readonly {
                productTypeId?: string;
                title?: string;
                handle?: string;
                description?: string;
              }[];
            }),
          }),
        });
      } catch (error) {
        return reply
          .code(422)
          .send({ error: error instanceof Error ? error.message : 'IMPORT_REJECTED' });
      }
    },
  );
  app.get('/admin/imports', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.imports.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await operations.listImportJobs(database.db, active.organizationId) };
  });
  app.post(
    '/admin/imports/:importJobId/confirm',
    { schema: { params: Type.Object({ importJobId: Type.String() }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.imports.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        await operations.confirmCatalogImport(
          database.db,
          active.organizationId,
          (request.params as { importJobId: string }).importJobId,
        );
        return reply.code(204).send();
      } catch (error) {
        return reply
          .code(422)
          .send({ error: error instanceof Error ? error.message : 'IMPORT_CONFIRM_REJECTED' });
      }
    },
  );
  app.post(
    '/admin/exports',
    {
      schema: {
        body: Type.Object({
          exportType: Type.Union([
            Type.Literal('ORDERS'),
            Type.Literal('CUSTOMERS'),
            Type.Literal('INVENTORY'),
          ]),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.exports.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return reply.code(201).send({
        data: await operations.createExport(database.db, {
          organizationId: active.organizationId,
          actorId: active.actorId,
          ...(request.body as { exportType: 'ORDERS' | 'CUSTOMERS' | 'INVENTORY' }),
        }),
      });
    },
  );
  app.get('/admin/exports', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.exports.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: await operations.listExportJobs(database.db, active.organizationId, active.actorId),
    };
  });
  app.get('/admin/settings/organization', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'settings.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await operations.getOrganizationProfile(database.db, active.organizationId) };
  });
  app.put(
    '/admin/settings/organization',
    {
      schema: {
        body: Type.Object({
          businessProfile: Type.Record(Type.String(), Type.Unknown()),
          storefrontProfile: Type.Record(Type.String(), Type.Unknown()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'settings.organization.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await operations.updateOrganizationProfile(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as Omit<
              Parameters<typeof operations.updateOrganizationProfile>[1],
              'organizationId' | 'actorId'
            >),
          }),
        };
      } catch (error) {
        return reply
          .code(422)
          .send({ error: error instanceof Error ? error.message : 'INVALID_SETTINGS' });
      }
    },
  );
}
