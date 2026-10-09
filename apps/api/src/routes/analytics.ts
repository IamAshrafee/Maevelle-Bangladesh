import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  AnalyticsQueryError,
  AnalyticsIngestionError,
  analyticsDrilldown,
  analyticsReportKeys,
  captureInventoryDailySnapshot,
  getAnalyticsDashboards,
  getAnalyticsExport,
  getAnalyticsOverview,
  getAnalyticsReport,
  ingestStorefrontEvent,
  listAnalyticsExports,
  listInventorySnapshots,
  listMetricCatalog,
  rebuildAnalyticsProjections,
  requestAnalyticsExport,
  storefrontEventNames,
  verifyAnalyticsIntegrity,
  type AnalyticsGranularity,
  type AnalyticsReportKey,
  type StorefrontEventInput,
} from '@maevelle/database/analytics';
import { appendAuditEvent, findActiveAdminContext } from '@maevelle/database/platform';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
type AnalyticsCapability =
  | 'analytics.view'
  | 'analytics.manage'
  | 'analytics.financial.view'
  | 'analytics.export';

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
  capability: AnalyticsCapability,
) {
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof source['x-organization-id'] === 'string'
      ? { organizationId: source['x-organization-id'] }
      : {}),
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}

const reportQuerySchema = Type.Object({
  from: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  to: Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }),
  granularity: Type.Optional(
    Type.Union([Type.Literal('DAY'), Type.Literal('WEEK'), Type.Literal('MONTH')]),
  ),
  currency: Type.Optional(Type.String({ pattern: '^[A-Za-z]{3}$' })),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});
const consentDecision = Type.Union([
  Type.Literal('GRANTED'),
  Type.Literal('DENIED'),
  Type.Literal('UNKNOWN'),
]);

function reportError(reply: { code(status: number): { send(value: unknown): unknown } }, error: unknown) {
  if (error instanceof AnalyticsQueryError)
    return reply.code(422).send({ error: { code: error.code, message: error.message } });
  throw error;
}

/** Read-only reporting projections; commands only ingest observations or rebuild read models. */
export function registerAnalyticsRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  auth: Auth,
  storefrontOrganizationCode = 'maevelle',
): void {
  app.post(
    '/storefront/v1/analytics/events',
    {
      schema: {
        body: Type.Object({
          schemaVersion: Type.Literal(1),
          name: Type.Union(storefrontEventNames.map((name) => Type.Literal(name))),
          eventId: Type.String({ format: 'uuid' }),
          occurredAt: Type.String({ format: 'date-time' }),
          origin: Type.Literal('BROWSER'),
          sessionId: Type.String({ format: 'uuid' }),
          anonymousId: Type.Optional(Type.String({ format: 'uuid' })),
          consent: Type.Object({
            necessary: Type.Literal('GRANTED'),
            analytics: consentDecision,
            marketing: consentDecision,
            preferences: consentDecision,
            recordedAt: Type.String({ format: 'date-time' }),
          }),
          attribution: Type.Optional(
            Type.Object({
              source: Type.Optional(Type.String({ maxLength: 200 })),
              medium: Type.Optional(Type.String({ maxLength: 200 })),
              campaign: Type.Optional(Type.String({ maxLength: 300 })),
              content: Type.Optional(Type.String({ maxLength: 300 })),
              referrerOrigin: Type.Optional(Type.String({ maxLength: 500 })),
              touch: Type.Union([
                Type.Literal('FIRST'),
                Type.Literal('SESSION'),
                Type.Literal('LAST_NON_DIRECT'),
              ]),
            }),
          ),
          data: Type.Record(Type.String(), Type.Unknown()),
        }),
      },
    },
    async (request, reply) => {
      const storefront = await resolveStorefrontContext(database.db, storefrontOrganizationCode);
      if (!storefront)
        return reply.code(503).send({
          error: { code: 'STOREFRONT_UNAVAILABLE', message: 'Storefront is unavailable.' },
        });
      try {
        const receipt = await ingestStorefrontEvent(
          database.db,
          storefront.organizationId,
          request.body as StorefrontEventInput,
        );
        return reply.code(202).send({ data: receipt });
      } catch (error) {
        if (error instanceof AnalyticsIngestionError)
          return reply.code(422).send({
            error: { code: error.code, message: error.message },
          });
        throw error;
      }
    },
  );

  app.get('/admin/analytics/overview', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.financial.view');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return { data: await getAnalyticsOverview(database.db, active.organizationId) };
  });
  app.get('/admin/analytics/dashboards', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.financial.view');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return { data: await getAnalyticsDashboards(database.db, active.organizationId) };
  });
  app.get('/admin/analytics/metrics', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.view');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return { data: await listMetricCatalog(database.db) };
  });
  app.get(
    '/admin/analytics/reports/:report',
    { schema: { querystring: reportQuerySchema } },
    async (request, reply) => {
      const report = (request.params as { report: string }).report.toUpperCase();
      if (!analyticsReportKeys.includes(report as AnalyticsReportKey))
        return reply.code(404).send({
          error: { code: 'REPORT_NOT_FOUND', message: 'Analytics report was not found.' },
        });
      const capability =
        report === 'FINANCE' || report === 'PRODUCTS'
          ? 'analytics.financial.view'
          : 'analytics.view';
      const active = await admin(database, auth, request.headers, capability);
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const query = request.query as {
        from: string;
        to: string;
        granularity?: AnalyticsGranularity;
        currency?: string;
        page?: number;
        pageSize?: number;
      };
      try {
        return {
          data: await getAnalyticsReport(
            database.db,
            active.organizationId,
            report as AnalyticsReportKey,
            query,
          ),
        };
      } catch (error) {
        return reportError(reply, error);
      }
    },
  );
  app.get('/admin/analytics/drilldown/:metric', async (request, reply) => {
    const metric = (request.params as { metric: string }).metric;
    if (!['GROSS_SALES', 'NET_SALES', 'REFUNDS', 'GROSS_MARGIN', 'CASH', 'INVENTORY'].includes(metric))
      return reply.code(422).send({
        error: { code: 'INVALID_METRIC', message: 'Unsupported drill-down metric.' },
      });
    const active = await admin(
      database,
      auth,
      request.headers,
      metric === 'GROSS_MARGIN' || metric === 'CASH'
        ? 'analytics.financial.view'
        : 'analytics.view',
    );
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
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
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return { data: await listInventorySnapshots(database.db, active.organizationId) };
  });
  app.get('/admin/analytics/integrity', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.view');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return { data: await verifyAnalyticsIntegrity(database.db, active.organizationId) };
  });
  app.post('/admin/analytics/rebuild', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.manage');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    const result = {
      data: {
        projections: await rebuildAnalyticsProjections(database.db, active.organizationId),
        inventorySnapshot: await captureInventoryDailySnapshot(database.db, active.organizationId),
      },
    };
    await appendAuditEvent(database.db, {
      organizationId: active.organizationId,
      actorType: 'USER',
      actorId: active.actorId,
      membershipId: active.membershipId,
      action: 'analytics.projections.rebuilt',
      targetType: 'analytics.projection_set',
      metadata: result.data,
    });
    return result;
  });

  app.post(
    '/admin/analytics/exports',
    {
      schema: {
        body: Type.Object({
          report: Type.Union(analyticsReportKeys.map((key) => Type.Literal(key))),
          query: reportQuerySchema,
        }),
      },
    },
    async (request, reply) => {
      const active = await admin(database, auth, request.headers, 'analytics.export');
      if (!active)
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
      const body = request.body as {
        report: AnalyticsReportKey;
        query: Parameters<typeof requestAnalyticsExport>[1]['query'];
      };
      try {
        if (body.report === 'FINANCE' || body.report === 'PRODUCTS') {
          const financial = await admin(
            database,
            auth,
            request.headers,
            'analytics.financial.view',
          );
          if (!financial)
            return reply.code(403).send({
              error: { code: 'FORBIDDEN', message: 'Financial analytics access denied.' },
            });
        }
        return reply.code(202).send({
          data: await requestAnalyticsExport(database.db, {
            organizationId: active.organizationId,
            actorId: active.actorId,
            membershipId: active.membershipId,
            report: body.report,
            query: body.query,
          }),
        });
      } catch (error) {
        return reportError(reply, error);
      }
    },
  );
  app.get('/admin/analytics/exports', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.export');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    const query = request.query as { page?: number; pageSize?: number };
    return {
      data: await listAnalyticsExports(
        database.db,
        active.organizationId,
        Number(query.page ?? 1),
        Number(query.pageSize ?? 25),
      ),
    };
  });
  app.get('/admin/analytics/exports/:exportId/download', async (request, reply) => {
    const active = await admin(database, auth, request.headers, 'analytics.export');
    if (!active)
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    const exported = await getAnalyticsExport(
      database.db,
      active.organizationId,
      (request.params as { exportId: string }).exportId,
    );
    if (!exported)
      return reply.code(404).send({
        error: { code: 'EXPORT_NOT_FOUND', message: 'Analytics export was not found.' },
      });
    if (exported.report_key === 'FINANCE' || exported.report_key === 'PRODUCTS') {
      const financial = await admin(
        database,
        auth,
        request.headers,
        'analytics.financial.view',
      );
      if (!financial)
        return reply.code(403).send({
          error: { code: 'FORBIDDEN', message: 'Financial analytics access denied.' },
        });
    }
    if (exported.status !== 'READY' || !exported.payload)
      return reply.code(409).send({
        error: {
          code: 'EXPORT_NOT_READY',
          message: 'Analytics export is not ready for download.',
          details: { status: exported.status, errorCode: exported.error_code },
        },
      });
    return reply
      .type(exported.content_type ?? 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${exported.file_name ?? 'analytics.csv'}"`)
      .send(exported.payload);
  });
}
