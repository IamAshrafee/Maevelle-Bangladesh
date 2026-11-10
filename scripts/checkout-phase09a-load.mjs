/** Bounded mixed local workload. Does not qualify provider policy or production capacity. */
import { randomUUID, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  isolatedCartDatabase,
  cartFixture,
} from '../packages/database/dist/src/testing/cart-fixture.js';
import { manualPaymentFixture } from '../packages/database/dist/src/testing/manual-payment-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';
import { createGuestCart, addGuestCartLine } from '../packages/database/dist/src/cart.js';
import {
  verifyManualPayment,
  createRefund,
  changeRefundProcessingState,
  completeManualRefund,
} from '../packages/database/dist/src/payments.js';
import {
  processCommerceAnalyticsOutbox,
  getCommerceMeasurementReport,
} from '../packages/database/dist/src/analytics.js';
import { parseConfig } from '../packages/config/dist/src/index.js';
import { buildApi } from '../apps/api/dist/src/app.js';

if (
  process.env.TEST_DATABASE_URL !== 'postgresql://postgres@127.0.0.1:5548/maevelle_test' ||
  !process.env.PHASE09A_LOAD_OUTPUT
)
  throw new Error('Dedicated disposable loopback database and explicit evidence output required.');
const isolated = await isolatedCartDatabase();
let app;
try {
  const db = isolated.database.db;
  await runMigrations(db);
  const catalog = await cartFixture(isolated.database),
    f = await manualPaymentFixture(db);
  await sql`insert into analytics.commerce_reporting_scopes values(${f.organizationId},'SYNTHETIC')`.execute(
    db,
  );
  const accounts = [];
  for (let i = 0; i < 8; i++)
    accounts.push(
      (
        await sql`insert into finance.financial_accounts
    (organization_id,account_number,name,account_type,currency_code)
    values(${f.organizationId},${'LOAD-' + i},'Synthetic load wallet','MOBILE_WALLET','BDT') returning id`.execute(
          db,
        )
      ).rows[0].id,
    );
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: isolated.url,
    TEST_DATABASE_URL: isolated.url,
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
    AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: 'http://localhost:3001',
    STOREFRONT_BASE_URL: 'http://localhost:3000',
    STOREFRONT_ORGANIZATION_CODE: catalog.code,
    EMAIL_ENABLED: 'false',
    SMS_ENABLED: 'false',
  });
  app = buildApi({ database: isolated.database, config, logger: false });
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const names = [
    'http-pdp',
    'cart-create-and-add',
    'different-account-receipt',
    'http-privacy-denial',
    'consumer-batch',
    'aggregate-report',
    'refund-reconciliation',
  ];
  const latency = Object.fromEntries(names.map((n) => [n, []])),
    httpLatency = [],
    samples = [],
    errors = {};
  let queries = 0;
  const observed = db.withPlugin({
    transformQuery(args) {
      queries++;
      return args.node;
    },
    async transformResult(args) {
      return args.result;
    },
  });
  const request = async (path, options = {}) => {
    const start = performance.now(),
      r = await fetch(base + path, { ...options, signal: globalThis.AbortSignal.timeout(10000) });
    httpLatency.push(performance.now() - start);
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      const code = /^[A-Z_]{1,64}$/.test(body?.error?.code ?? '') ? body.error.code : 'UNSPECIFIED';
      throw Object.assign(new Error('Synthetic HTTP request failed'), {
        code: 'HTTP_' + r.status + '_' + code,
      });
    }
    return r;
  };
  const privacy = [];
  for (let i = 0; i < 8; i++) {
    const r = await request('/storefront/v1/analytics/consent', {
      headers: { 'x-privacy-request': '1', origin: config.storefrontBaseUrl },
    });
    privacy.push({ cookie: r.headers.get('set-cookie').split(';')[0], p: (await r.json()).data });
  }
  const before = (
    await sql`select deadlocks from pg_stat_database where datname=current_database()`.execute(db)
  ).rows[0];
  const bytesBefore = (
    await sql`select pg_database_size(current_database())::text bytes`.execute(db)
  ).rows[0].bytes;
  const started = performance.now(),
    cpu = process.cpuUsage();
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async (_, runner) => {
      while (next < 168) {
        const kind = next++ % 7,
          t = performance.now();
        try {
          if (kind === 0)
            await (
              await request(
                '/storefront/v1/products/' +
                  catalog.code +
                  '?organizationId=' +
                  catalog.organizationId,
              )
            ).arrayBuffer();
          if (kind === 1) {
            const cart = await createGuestCart(observed, {
              organizationId: catalog.organizationId,
              currency: 'BDT',
            });
            await addGuestCartLine(observed, {
              token: cart.token,
              variantId: catalog.variantId,
              quantity: '1',
              expectedVersion: cart.cart.version,
              idempotencyKey: randomUUID(),
            });
          }
          if (kind === 2 || kind === 6) {
            const c = await f.order();
            const payment = await verifyManualPayment(observed, {
              organizationId: f.organizationId,
              actorId: f.reviewer,
              attemptId: c.attemptId,
              confirmedAmount: '40.0000',
              evidence: { ...c.evidence, financialAccountId: accounts[runner] },
              idempotencyKey: randomUUID(),
            });
            if (kind === 6) {
              const refund = await createRefund(observed, {
                organizationId: f.organizationId,
                actorId: f.owner,
                paymentId: payment.id,
                amount: '5',
                reasonCode: 'RETURN',
                idempotencyKey: randomUUID(),
              });
              const processing = await changeRefundProcessingState(observed, {
                organizationId: f.organizationId,
                actorId: f.owner,
                refundId: refund.id,
                expectedVersion: refund.version,
                state: 'PROCESSING',
                evidenceReference: 'Synthetic independently initiated transfer',
              });
              await changeRefundProcessingState(observed, {
                organizationId: f.organizationId,
                actorId: f.owner,
                refundId: refund.id,
                expectedVersion: processing.version,
                state: 'UNKNOWN_EXTERNAL_OUTCOME',
                evidenceReference: 'Synthetic reconciliation required',
              });
              await completeManualRefund(observed, {
                organizationId: f.organizationId,
                actorId: f.owner,
                refundId: refund.id,
                externalReference: 'SYN-' + randomUUID(),
                idempotencyKey: randomUUID(),
                originalSourceVerified: true,
                evidenceReference: 'Synthetic independent reconciliation',
              });
            }
          }
          if (kind === 3) {
            const state = privacy[runner],
              p = state.p;
            const r = await request('/storefront/v1/analytics/consent', {
              method: 'PUT',
              headers: {
                cookie: state.cookie,
                origin: config.storefrontBaseUrl,
                'x-privacy-request': '1',
                'x-privacy-context': p.context,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                policyVersion: p.policyVersion,
                choices: Object.fromEntries(
                  ['ANALYTICS', 'ADVERTISING'].map((purpose) => [
                    purpose,
                    {
                      decision: 'DENIED',
                      expectedRevision: p.purposes[purpose].revision,
                      expectedBrowserRevision: p.purposes[purpose].browserRevision,
                    },
                  ]),
                ),
              }),
            });
            state.p = (await r.json()).data;
            assert.equal(state.p.observationToken, null);
          }
          if (kind === 4) await processCommerceAnalyticsOutbox(observed, 30);
          if (kind === 5) {
            const date = new Date().toISOString().slice(0, 10);
            await getCommerceMeasurementReport(observed, f.organizationId, {
              from: date,
              to: date,
              trafficClass: 'SYNTHETIC',
            });
          }
        } catch (e) {
          const code =
            names[kind] +
            ':' +
            (typeof e.code === 'string' ? e.code : 'ASSERTION_OR_APPLICATION_FAILURE');
          errors[code] = (errors[code] ?? 0) + 1;
        }
        latency[names[kind]].push(performance.now() - t);
        if (next % 12 === 0)
          samples.push(
            (
              await sql`select count(*)::int connections,
        count(*) filter(where wait_event_type='Lock')::int lockWaits from pg_stat_activity where datname=current_database()`.execute(
                db,
              )
            ).rows[0],
          );
      }
    }),
  );
  await processCommerceAnalyticsOutbox(observed, 500);
  const final = (
    await sql`select
    (select count(*)::int from payments.payments where organization_id=${f.organizationId}) receipts,
    (select sum(amount)::text from payments.payments where organization_id=${f.organizationId}) received,
    (select count(*)::int from payments.refunds where organization_id=${f.organizationId} and status='COMPLETED') refunds,
    (select sum(amount_delta)::text from finance.financial_account_entries where organization_id=${f.organizationId}) balance,
    (select count(*)::int from platform.event_consumer_receipts where consumer_name='analytics.commerce.v1' and status='PENDING') pending`.execute(
      db,
    )
  ).rows[0];
  const stats = (
    await sql`select deadlocks from pg_stat_database where datname=current_database()`.execute(db)
  ).rows[0];
  const bytesAfter = (
    await sql`select pg_database_size(current_database())::text bytes`.execute(db)
  ).rows[0].bytes;
  const quantiles = (v) => {
    v.sort((a, b) => a - b);
    return {
      n: v.length,
      ...Object.fromEntries(
        [0.5, 0.95, 0.99].map((p) => [
          'p' + p * 100,
          v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)],
        ]),
      ),
    };
  };
  const summary = {
    scope:
      '168 synthetic jobs, 8 runners, disposable PostgreSQL 18; actual loopback Fastify HTTP PDP/privacy plus domain commands; no Checkout HTTP success or production capacity claim',
    elapsedMs: performance.now() - started,
    cpuMicroseconds: process.cpuUsage(cpu),
    rssBytes: process.memoryUsage().rss,
    latencyMs: Object.fromEntries(Object.entries(latency).map(([n, v]) => [n, quantiles(v)])),
    httpHeadersLatencyMs: quantiles(httpLatency),
    observedDomainQueries: queries,
    databaseSamples: samples,
    deadlocksDelta: Number(stats.deadlocks) - Number(before.deadlocks),
    databaseGrowthBytes: Number(bytesAfter) - Number(bytesBefore),
    errors,
    final,
    limitations: [
      'PDP/privacy HTTP only; remaining timings are domain-operation elapsed time',
      'No deployed hardware/network, human/device, or production SLO',
      'Query counter covers instrumented domain client, not fixture setup or HTTP queries',
      'Pool pressure sampled via pg_stat_activity; no driver pool queue instrumentation',
      '5/25/100-line Checkout, stock and coupon contention measured separately in placement regression',
    ],
  };
  await writeFile(process.env.PHASE09A_LOAD_OUTPUT, JSON.stringify(summary, null, 2) + '\n');
  assert.deepEqual(errors, {});
  assert.equal(summary.deadlocksDelta, 0);
  assert.deepEqual(final, {
    receipts: 48,
    received: '1920.0000',
    refunds: 24,
    balance: '1800.0000',
    pending: 0,
  });
  console.log(
    'Mixed sample PASS: 168 jobs; 48 receipts, 24 reconciled refunds; BDT 1800.0000 balance; no deadlocks or pending commerce receipts.',
  );
} finally {
  await app?.close();
  await isolated.close();
}
