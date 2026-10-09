import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  captureInventoryDailySnapshot,
  consumeAnalyticsOutbox,
  getAnalyticsDashboards,
  getAnalyticsOverview,
  getAnalyticsReport,
  getAnalyticsExport,
  ingestStorefrontEvent,
  normalizeAnalyticsReportQuery,
  processAnalyticsExports,
  rebuildAnalyticsProjections,
  requestAnalyticsExport,
  verifyAnalyticsIntegrity,
} from './analytics.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});
afterAll(async () => database.close());

async function fixture(label: string) {
  const organization = await createOrganization(database.db, {
    code: `analytics-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: 'Analytics test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const customer = await sql<{
    id: string;
  }>`insert into customers.customers(organization_id,customer_number,display_name) values(${organization.id},${`CUS-${crypto.randomUUID().slice(0, 8)}`},'Analytics customer') returning id::text`.execute(
    database.db,
  );
  const order = await sql<{
    id: string;
  }>`insert into orders.orders(organization_id,order_number,customer_id,currency_code,payment_method,subtotal_amount,discount_amount,total_amount) values(${organization.id},${`AN-${crypto.randomUUID().slice(0, 8)}`},${customer.rows[0]!.id}::uuid,'BDT','COD',1290,129,1161) returning id::text`.execute(
    database.db,
  );
  await sql`insert into orders.order_lines(organization_id,order_id,quantity,sku_snapshot,product_title_snapshot,option_snapshot,unit_price,gross_amount,discount_amount,net_amount) values(${organization.id},${order.rows[0]!.id}::uuid,1,'AN-SKU','Analytics product','[]'::jsonb,1290,1290,129,1161)`.execute(
    database.db,
  );
  return organization.id;
}

describe('rebuildable analytics projections', () => {
  it('rebuilds tenant-scoped order-line metrics without changing source orders', async () => {
    const a = await fixture('a');
    const b = await fixture('b');
    await rebuildAnalyticsProjections(database.db, a);
    const overview = await getAnalyticsOverview(database.db, a);
    expect(overview.metrics).toEqual([
      expect.objectContaining({
        currencyCode: 'BDT',
        grossSales: '1290.0000',
        discounts: '129.0000',
        netSales: '1161.0000',
        orderLines: '1',
      }),
    ]);
    expect((await getAnalyticsOverview(database.db, b)).metrics).toEqual([]);
    expect(await verifyAnalyticsIntegrity(database.db, a)).toEqual([]);
  });

  it('rebuilds every fact family exactly and keeps semantic metrics separated by currency', async () => {
    const organizationId = await fixture('rebuild');
    await rebuildAnalyticsProjections(database.db, organizationId);
    const before = await getAnalyticsDashboards(database.db, organizationId);
    expect(before.metricCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric_key: 'GROSS_SALES', semantic_version: 1 }),
        expect.objectContaining({ metric_key: 'COLLECTED_CASH', semantic_version: 1 }),
        expect.objectContaining({ metric_key: 'REFUNDS_BY_REFUND_DATE', semantic_version: 1 }),
      ]),
    );
    await sql`delete from analytics.order_facts where organization_id=${organizationId}`.execute(
      database.db,
    );
    expect(await verifyAnalyticsIntegrity(database.db, organizationId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'MISSING_ORDER_FACT' })]),
    );
    await rebuildAnalyticsProjections(database.db, organizationId);
    expect(await getAnalyticsDashboards(database.db, organizationId)).toEqual(before);
    expect(await verifyAnalyticsIntegrity(database.db, organizationId)).toEqual([]);
  });

  it('claims duplicate projection events once under concurrent delivery', async () => {
    const organizationId = await fixture('events');
    const event = await sql<{
      id: string;
    }>`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at) select ${organizationId},'analytics.rebuild.requested',1,'platform.organization',id,'{}'::jsonb,now() from platform.organizations where id=${organizationId} returning id::text`.execute(
      database.db,
    );
    const outcomes = await Promise.all([
      consumeAnalyticsOutbox(database.db, Number(event.rows[0]!.id)),
      consumeAnalyticsOutbox(database.db, Number(event.rows[0]!.id)),
    ]);
    expect(outcomes.filter((outcome) => outcome.processed)).toHaveLength(1);
    expect((await getAnalyticsOverview(database.db, organizationId)).metrics).toHaveLength(1);
  });

  it('captures an inventory snapshot only for the requested organization', async () => {
    const organizationId = await fixture('snapshot');
    expect(await captureInventoryDailySnapshot(database.db, organizationId, '2026-08-24')).toEqual({
      rows: 0,
    });
  });

  it('records consented storefront observations idempotently and exposes explicit funnel denominators', async () => {
    const organizationId = await fixture('behavior');
    const eventId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const occurredOn = occurredAt.slice(0, 10);
    const event = {
      schemaVersion: 1 as const,
      name: 'PRODUCT_VIEWED' as const,
      eventId,
      occurredAt,
      origin: 'BROWSER' as const,
      sessionId,
      consent: { analytics: 'GRANTED' as const, marketing: 'DENIED' as const },
      attribution: { source: 'facebook', medium: 'social', campaign: 'eid', touch: 'FIRST' as const },
      data: {
        item: {
          productId: crypto.randomUUID(),
          skuId: crypto.randomUUID(),
        },
      },
    };
    await expect(ingestStorefrontEvent(database.db, organizationId, event)).resolves.toEqual({
      accepted: true,
      duplicate: false,
      reason: 'RECORDED',
    });
    await expect(ingestStorefrontEvent(database.db, organizationId, event)).resolves.toEqual({
      accepted: true,
      duplicate: true,
      reason: 'DUPLICATE',
    });
    await expect(
      ingestStorefrontEvent(database.db, organizationId, {
        ...event,
        eventId: crypto.randomUUID(),
        consent: { analytics: 'UNKNOWN', marketing: 'UNKNOWN' },
      }),
    ).resolves.toEqual({
      accepted: false,
      duplicate: false,
      reason: 'ANALYTICS_CONSENT_REQUIRED',
    });
    const report = await getAnalyticsReport(database.db, organizationId, 'STOREFRONT', {
      from: occurredOn,
      to: occurredOn,
    });
    expect(report.availability.status).toBe('AVAILABLE');
    expect(report.totals).toEqual([
      expect.objectContaining({ eligible_sessions: '1', product_view_sessions: '1' }),
    ]);
  });

  it('bounds report ranges and uses inclusive dates with an exclusive upper boundary', () => {
    expect(normalizeAnalyticsReportQuery({ from: '2026-10-01', to: '2026-10-10' })).toEqual(
      expect.objectContaining({ from: '2026-10-01', toExclusive: '2026-10-11', pageSize: 25 }),
    );
    expect(() =>
      normalizeAnalyticsReportQuery({ from: '2020-01-01', to: '2026-10-10' }),
    ).toThrow('cannot exceed 731 days');
  });

  it('leases, renders, and retrieves tenant-scoped CSV exports', async () => {
    const organizationId = await fixture('export');
    await rebuildAnalyticsProjections(database.db, organizationId);
    const requested = await requestAnalyticsExport(database.db, {
      organizationId,
      actorId: crypto.randomUUID(),
      report: 'ORDERS',
      query: { from: '2026-01-01', to: '2026-12-31' },
    });
    expect(requested.status).toBe('QUEUED');
    await expect(processAnalyticsExports(database.db, 'test-worker')).resolves.toBe(1);
    const exported = await getAnalyticsExport(database.db, organizationId, requested.id);
    expect(exported).toEqual(
      expect.objectContaining({ status: 'READY', content_type: 'text/csv; charset=utf-8' }),
    );
    expect(exported?.payload).toContain('section');
  });
});
