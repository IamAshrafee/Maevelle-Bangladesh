import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { isolatedCartDatabase } from '../../testing/cart-fixture.js';
import { manualPaymentFixture } from '../../testing/manual-payment-fixture.js';
import { migrationProvider } from '../../migrations/index.js';
import { runMigrations } from '../../migrate.js';
import { processCommerceAnalyticsOutbox } from './processing.js';

// A local event-capture microbenchmark, never a production capacity assertion.
const isolated = await isolatedCartDatabase();
try {
  const db = isolated.database.db;
  const prior = await new Migrator({ db, provider: migrationProvider }).migrateTo(
    '3223_checkout_placement',
  );
  if (prior.error) throw prior.error;
  const fixture = await manualPaymentFixture(db);
  const order = await fixture.order();
  async function capture(count: number) {
    const start = performance.now();
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
      select ${fixture.organizationId},'orders.order.placed',1,'orders.order',${order.orderId}::uuid,'{}',clock_timestamp()
      from generate_series(1,${count})`.execute(db);
    return performance.now() - start;
  }
  const baseline = [];
  for (let i = 0; i < 5; i++) baseline.push(await capture(100));
  await runMigrations(db);
  await sql`insert into analytics.commerce_reporting_scopes values(${fixture.organizationId},'SYNTHETIC')`.execute(
    db,
  );
  const instrumented = [];
  for (let i = 0; i < 5; i++) instrumented.push(await capture(100));
  const start = performance.now();
  const results = await Promise.all([
    processCommerceAnalyticsOutbox(db, 500),
    processCommerceAnalyticsOutbox(db, 500),
  ]);
  const drainMs = performance.now() - start;
  const storage = (
    await sql`select count(*)::text facts,pg_total_relation_size('analytics.commerce_events')::text fact_bytes,
    (select count(*)::text from platform.event_consumer_receipts where consumer_name='analytics.commerce.v1' and status='PENDING') pending
    from analytics.commerce_events`.execute(db)
  ).rows[0];
  console.log(
    JSON.stringify(
      {
        environment: 'Windows local PostgreSQL 18, loopback, disposable synthetic DB',
        scenario:
          'Five batches of 100 duplicate Order event identities before/after 3224; two concurrent 500-event consumers',
        baselineBatchMs: baseline,
        instrumentedBatchMs: instrumented,
        drainMs,
        results,
        storage,
        limits:
          'Not placement transaction overhead, representative load, query-count instrumentation, Checkout p95/p99 or production capacity.',
      },
      null,
      2,
    ),
  );
} finally {
  await isolated.close();
}
