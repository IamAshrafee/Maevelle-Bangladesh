import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import * as operations from '@maevelle/database/admin-operations';
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
    return { data: await operations.getOperationsOverview(database.db, active.organizationId) };
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
  app.get('/admin/integrity', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.integrity.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await operations.getIntegrityCenter(database.db, active.organizationId) };
  });
  app.post(
    '/admin/integrity/repairs',
    {
      schema: {
        body: Type.Object({
          projection: Type.Union([
            Type.Literal('ANALYTICS'),
            Type.Literal('REVIEW_RATINGS'),
            Type.Literal('SEARCH'),
          ]),
          resourceId: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.integrity.repair');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await operations.repairProjection(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            ...(request.body as {
              projection: 'ANALYTICS' | 'REVIEW_RATINGS' | 'SEARCH';
              resourceId?: string;
            }),
          }),
        };
      } catch (error) {
        return reply
          .code(422)
          .send({ error: error instanceof Error ? error.message : 'REPAIR_REJECTED' });
      }
    },
  );
  app.get('/admin/team', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.team.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await operations.listTeam(database.db, active.organizationId) };
  });
  app.get('/admin/team/capabilities', async (request, reply) => {
    const active = await context(database, auth, request.headers, 'admin.team.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await operations.listCapabilityDefinitions(database.db) };
  });
  app.patch(
    '/admin/team/:membershipId',
    {
      schema: {
        params: Type.Object({ membershipId: Type.String() }),
        body: Type.Object({
          status: Type.Optional(Type.Union([Type.Literal('ACTIVE'), Type.Literal('DISABLED')])),
          grant: Type.Optional(Type.String()),
          revoke: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.team.manage');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      try {
        return {
          data: await operations.updateTeamMember(database.db, {
            organizationId: active.organizationId,
            actorMembershipId: active.membershipId,
            membershipId: (request.params as { membershipId: string }).membershipId,
            ...(request.body as {
              status?: 'ACTIVE' | 'DISABLED';
              grant?: string;
              revoke?: string;
            }),
          }),
        };
      } catch (error) {
        return reply
          .code(422)
          .send({ error: error instanceof Error ? error.message : 'TEAM_CHANGE_REJECTED' });
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
  app.get(
    '/admin/orders/:orderId/timeline',
    { schema: { params: Type.Object({ orderId: Type.String() }) } },
    async (request, reply) => {
      const active = await context(database, auth, request.headers, 'admin.operations.view');
      if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
      return {
        data: await operations.getOrderTimeline(
          database.db,
          active.organizationId,
          (request.params as { orderId: string }).orderId,
        ),
      };
    },
  );
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
