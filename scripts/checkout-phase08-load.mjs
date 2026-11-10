/** Local mixed-domain sample; never a production capacity claim. */
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { isolatedCartDatabase } from '../packages/database/dist/src/testing/cart-fixture.js';
import { manualPaymentFixture } from '../packages/database/dist/src/testing/manual-payment-fixture.js';
import { sql } from '../packages/database/dist/src/index.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { verifyManualPayment } from '../packages/database/dist/src/payments/manual-receipts.js';
import {
  processCommerceAnalyticsOutbox,
  getCommerceMeasurementReport,
  privacyBrowserSession,
  readPrivacyPreferences,
  savePrivacyPreferences,
  ingestAuthorizedObservation,
} from '../packages/database/dist/src/analytics.js';
if (
  process.env.TEST_DATABASE_URL !== 'postgresql://postgres@127.0.0.1:5548/maevelle_test' ||
  !process.env.PHASE08_LOAD_OUTPUT
)
  throw new Error('Explicit dedicated target/output required');
const isolated = await isolatedCartDatabase();
try {
  const db = isolated.database.db;
  await runMigrations(db);
  const f = await manualPaymentFixture(db);
  await sql`insert into analytics.commerce_reporting_scopes values(${f.organizationId},'SYNTHETIC')`.execute(
    db,
  );
  const secret = randomBytes(48).toString('base64url'),
    latencies = {},
    errors = {};
  const samples = [];
  let next = 0;
  const started = performance.now(),
    cpu = process.cpuUsage();
  const jobs = Array.from({ length: 120 }, (_, i) => i % 4);
  async function run(kind) {
    if (kind === 0) {
      const claim = await f.order();
      await verifyManualPayment(db, {
        organizationId: f.organizationId,
        actorId: f.reviewer,
        attemptId: claim.attemptId,
        confirmedAmount: '40.0000',
        idempotencyKey: randomUUID(),
        evidence: claim.evidence,
      });
      return;
    }
    if (kind === 1) {
      await processCommerceAnalyticsOutbox(db, 50);
      return;
    }
    if (kind === 2) {
      const date = new Date().toISOString().slice(0, 10);
      await getCommerceMeasurementReport(db, f.organizationId, {
        from: date,
        to: date,
        trafficClass: 'SYNTHETIC',
      });
      return;
    }
    const owner = {
      organizationId: f.organizationId,
      binding: randomBytes(32).toString('base64url'),
      shopper: null,
    };
    const { session, p } = await db.transaction().execute(async (tx) => {
      const { session } = await privacyBrowserSession(tx, owner, undefined, true);
      await savePrivacyPreferences(tx, owner, session, {
        policyVersion: 'privacy-choices-v1',
        choices: {
          ANALYTICS: { decision: 'GRANTED', expectedRevision: '0', expectedBrowserRevision: '0' },
          ADVERTISING: { decision: 'DENIED', expectedRevision: '0', expectedBrowserRevision: '0' },
        },
      });
      return { session, p: await readPrivacyPreferences(tx, owner, session, secret) };
    });
    // Model a subsequent interaction after the confirmed preference commit, not a pre-response event.
    await delay(10);
    await db.transaction().execute(async (tx) => {
      const receipt = await ingestAuthorizedObservation(
        tx,
        owner,
        session,
        secret,
        p.context,
        p.observationToken,
        {
          schemaVersion: 1,
          eventId: randomUUID(),
          name: 'WISHLIST_PAGE_VIEWED',
          origin: 'BROWSER',
          occurredAt: new Date().toISOString(),
          sessionId: randomUUID(),
          consent: {
            necessary: 'GRANTED',
            analytics: 'GRANTED',
            marketing: 'DENIED',
            preferences: 'DENIED',
            recordedAt: p.observationNotBefore,
          },
          data: { mode: 'GUEST' },
        },
      );
      if (!receipt.accepted)
        throw Object.assign(new Error('Observation not accepted'), { code: receipt.reason });
    });
  }
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < jobs.length) {
        const kind = jobs[next++],
          t = performance.now();
        try {
          await run(kind);
        } catch (e) {
          const code = typeof e.code === 'string' ? e.code : 'ERROR';
          errors[code] = (errors[code] ?? 0) + 1;
        }
        (latencies[kind] ??= []).push(performance.now() - t);
        if (next % 10 === 0)
          samples.push(
            (
              await sql`select count(*)::int connections,count(*) filter(where wait_event_type='Lock')::int lock_waits from pg_stat_activity where datname=current_database()`.execute(
                db,
              )
            ).rows[0],
          );
      }
    }),
  );
  await processCommerceAnalyticsOutbox(db, 500);
  const final = (
    await sql`select (select count(*) from orders.orders where organization_id=${f.organizationId}) orders,(select count(*) from payments.payments where organization_id=${f.organizationId}) receipts,(select sum(amount)::text from payments.payments where organization_id=${f.organizationId}) verified,(select count(*) from analytics.storefront_events where organization_id=${f.organizationId}) observations,(select count(*) from platform.event_consumer_receipts where consumer_name='analytics.commerce.v1' and status='PENDING') pending`.execute(
      db,
    )
  ).rows[0];
  const plan = (
    await sql`explain(analyze,buffers,format json) select event_name,count(*),sum(amount) from analytics.commerce_events where organization_id=${f.organizationId} and traffic_class='SYNTHETIC' group by event_name`.execute(
      db,
    )
  ).rows[0]['QUERY PLAN'][0];
  const names = [
    'claim-and-partial-verification',
    'consumer-batch',
    'aggregate-report',
    'preference-and-observation',
  ];
  const summary = {
    environment:
      'Dedicated local PostgreSQL 18; DB application calls, concurrency 6, 120 mixed jobs; not HTTP latency or production capacity',
    elapsedMs: performance.now() - started,
    cpuMicroseconds: process.cpuUsage(cpu),
    rssBytes: process.memoryUsage().rss,
    errors,
    latencies: Object.fromEntries(
      Object.entries(latencies).map(([k, v]) => {
        v.sort((a, b) => a - b);
        const percentile = (p) => v[Math.min(v.length - 1, Math.ceil(v.length * p) - 1)];
        return [
          names[k],
          { n: v.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
        ];
      }),
    ),
    databaseSamples: samples,
    aggregatePlan: {
      node: plan.Plan['Node Type'],
      planningMs: plan['Planning Time'],
      executionMs: plan['Execution Time'],
    },
    final,
    limitations: [
      'No representative hardware/network',
      'No full PDP/maximum Cart/placement mixed HTTP workload',
      'Preference/observation sample includes 10ms post-confirmation interaction delay',
      'No driver pool utilization instrumentation',
      'No production throughput inference',
    ],
  };
  await writeFile(process.env.PHASE08_LOAD_OUTPUT, JSON.stringify(summary, null, 2));
  if (
    Object.keys(errors).length ||
    final.orders !== '30' ||
    final.receipts !== '30' ||
    final.verified !== '1200.0000' ||
    final.observations !== '30' ||
    final.pending !== '0'
  )
    throw new Error('Mixed workload conservation failed; inspect sanitized summary');
  console.log(
    'Mixed sample PASS: 120 jobs; 30 Orders, 30 partial receipts, 30 authorized observations; no pending commerce receipt.',
  );
} finally {
  await isolated.close();
}
