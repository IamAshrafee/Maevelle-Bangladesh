import type { FastifyInstance } from 'fastify';

import type { DatabaseClient } from '@maevelle/database';
import {
  captureInventoryDailySnapshot,
  analyticsDrilldown,
  getAnalyticsDashboards,
  getAnalyticsOverview,
  listInventorySnapshots,
  rebuildAnalyticsProjections,
  verifyAnalyticsIntegrity,
} from '@maevelle/database/analytics';
import { findActiveAdminContext } from '@maevelle/database/platform';

import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;

function headers(source: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

async function admin(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  capability: 'analytics.view' | 'analytics.manage',
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  return findActiveAdminContext(database.db, session.user.id, { requiredCapability: capability });
}

/** Read-only reporting projections; commands only rebuild from source facts. */
export function registerAnalyticsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
): void {
  app.get('/admin/analytics/overview', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await getAnalyticsOverview(database.db, active.organizationId) };
  });
  app.get('/admin/analytics/dashboards', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await getAnalyticsDashboards(database.db, active.organizationId) };
  });
  app.get('/admin/analytics/drilldown/:metric', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    const metric = (request.params as { metric: string }).metric;
    if (
      !['GROSS_SALES', 'NET_SALES', 'REFUNDS', 'GROSS_MARGIN', 'CASH', 'INVENTORY'].includes(metric)
    )
      return reply.code(422).send({ error: 'INVALID_METRIC' });
    return {
      data: await analyticsDrilldown(
        database.db,
        active.organizationId,
        metric as 'GROSS_SALES' | 'NET_SALES' | 'REFUNDS' | 'GROSS_MARGIN' | 'CASH' | 'INVENTORY',
      ),
    };
  });
  app.get('/admin/analytics/inventory-snapshots', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await listInventorySnapshots(database.db, active.organizationId) };
  });
  app.get('/admin/analytics/integrity', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.view');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return { data: await verifyAnalyticsIntegrity(database.db, active.organizationId) };
  });
  app.post('/admin/analytics/rebuild', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.manage');
    if (!active) return reply.code(403).send({ error: 'FORBIDDEN' });
    return {
      data: {
        projections: await rebuildAnalyticsProjections(database.db, active.organizationId),
        inventorySnapshot: await captureInventoryDailySnapshot(database.db, active.organizationId),
      },
    };
  });
}
