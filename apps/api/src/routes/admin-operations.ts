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
    },
  );
}
