import { reviseOpenPaymentIntentForOrder } from '../../payments.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrationProvider } from '../../migrations/index.js';
import { runMigrations } from '../../migrate.js';
import { isolatedCartDatabase } from '../../testing/cart-fixture.js';
import { manualPaymentFixture } from '../../testing/manual-payment-fixture.js';
import { verifyManualPayment } from '../../payments/manual-receipts.js';
import { reverseManualReceipt } from '../../payments/receipt-corrections.js';
import { reviewManualClaim } from '../../payments/review-claims.js';
import {
  createRefund,
  completeManualRefund,
  submitManualPayment,
  rejectManualPayment,
} from '../../payments.js';
import { ingestStorefrontEvent } from '../behavioral.js';
import { processCommerceAnalyticsOutbox } from './processing.js';
import { getCommerceMeasurementReport } from './reporting.js';
import { setCommerceConsent, getCommerceConsent, type CommerceConsentSubject } from './consent.js';
import {
  queueCommerceTestDelivery,
  dispatchCommerceTestDeliveries,
  cleanupCommerceMeasurement,
  commerceConversionPolicy,
  type CommerceTestDestination,
  type CommerceTestPayload,
} from './delivery.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let fixture: Awaited<ReturnType<typeof manualPaymentFixture>>;
const db = () => isolation.database.db;
const key = () => crypto.randomUUID();
const tomorrow = () => new Date(Date.now() + 86_400_000);
const subject = (): CommerceConsentSubject => ({
  organizationId: fixture.organizationId,
  subjectId: key(),
  scope: 'SESSION',
});
const preference = (decision: 'GRANTED' | 'DENIED', expectedRevision = '0') => ({
  purpose: 'ANALYTICS' as const,
  decision,
  policyVersion: 'test-v1',
  expectedRevision,
  expiresAt: tomorrow(),
});
const context = () => ({ organizationId: fixture.organizationId, actorId: fixture.reviewer });
const period = () => ({
  from: new Date().toISOString().slice(0, 10),
  to: new Date().toISOString().slice(0, 10),
});

beforeAll(async () => {
  isolation = await isolatedCartDatabase();
  const prior = await new Migrator({ db: db(), provider: migrationProvider }).migrateTo(
    '3223_checkout_placement',
  );
  if (prior.error) throw prior.error;
  fixture = await manualPaymentFixture(db());
  await fixture.order(); // populated prior-schema Order, intent, claim and outbox history.
  expect((await runMigrations(db())).executed).toEqual([
    '3224_commerce_measurement',
    '3225_privacy_preferences',
    '3226_retail_money_settlement',
  ]);
  expect((await runMigrations(db())).executed).toEqual([]);
  expect((await sql`select * from analytics.commerce_events`.execute(db())).rows).toEqual([]);
  await sql`insert into analytics.commerce_reporting_scopes values(${fixture.organizationId},'SYNTHETIC')`.execute(
    db(),
  );
}, 30_000);
afterAll(async () => {
  await isolation?.close();
});

async function rows() {
  return (
    await sql<{
      id: string;
      event_name: string;
      business_id: string;
      amount: string | null;
      allocated: string | null;
    }>`select id,event_name,business_id,amount::text,allocated_amount::text allocated
    from analytics.commerce_events where organization_id=${fixture.organizationId} order by occurred_at,id`.execute(
      db(),
    )
  ).rows;
}
async function sourceEvent(
  type: string,
  aggregateType: string,
  id: string,
  payload: object = {},
  org = fixture.organizationId,
  version = 1,
) {
  return (
    await sql<{
      id: string;
    }>`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
    values(${org},${type},${version},${aggregateType},${id},${JSON.stringify(payload)}::jsonb,clock_timestamp()) returning id::text`.execute(
      db(),
    )
  ).rows[0]!.id;
}
async function observeSyntheticEvent(s = subject()) {
  await setCommerceConsent(db(), s, preference('GRANTED'));
  const order = await fixture.order();
  await processCommerceAnalyticsOutbox(db());
  const event = (await rows()).find((r) => r.business_id === order.attemptId)!;
  return { s, event, order };
}

it('migrates fresh PostgreSQL 18 and preserves populated upgrade history without retroactive capture', async () => {
  const fresh = await isolatedCartDatabase();
  try {
    const result = await runMigrations(fresh.database.db);
    expect(result.executed.at(-1)).toBe('3226_retail_money_settlement');
    expect(
      (await sql<{ v: string }>`select version() v`.execute(fresh.database.db)).rows[0]!.v,
    ).toContain('PostgreSQL 18');
  } finally {
    await fresh.close();
  }
}, 30_000);

it('claims and correction requests are distinct from receipt and obligation satisfaction', async () => {
  const order = await fixture.order();
  await reviewManualClaim(db(), {
    ...context(),
    attemptId: order.attemptId,
    state: 'CORRECTION_REQUESTED',
    note: 'PII-CANARY@example.test',
  });
  await processCommerceAnalyticsOutbox(db());
  const facts = (await rows()).filter((r) => r.business_id === order.attemptId);
  expect(facts.map((r) => r.event_name).sort()).toEqual([
    'CLAIM_CORRECTION_REQUESTED',
    'PAYMENT_CLAIM_SUBMITTED',
  ]);
  expect(facts.every((r) => r.amount === null)).toBe(true);
  expect(JSON.stringify(facts)).not.toContain('PII-CANARY');
});

it('rejected claims never become funds', async () => {
  const order = await fixture.order();
  await rejectManualPayment(db(), {
    ...context(),
    attemptId: order.attemptId,
    reasonCode: 'SYNTHETIC',
  });
  await processCommerceAnalyticsOutbox(db());
  expect(
    (await rows())
      .filter((r) => r.business_id === order.attemptId)
      .map((r) => r.event_name)
      .sort(),
  ).toEqual(['CLAIM_REJECTED', 'PAYMENT_CLAIM_SUBMITTED']);
});

it('captures partial independent funds exactly, full obligation once, and retries without financial side effects', async () => {
  const order = await fixture.order();
  const input = {
    ...context(),
    attemptId: order.attemptId,
    confirmedAmount: '40.0000',
    idempotencyKey: key(),
    evidence: order.evidence,
  };
  const paid = await verifyManualPayment(db(), input);
  await verifyManualPayment(db(), input);
  await processCommerceAnalyticsOutbox(db());
  expect((await rows()).find((r) => r.business_id === paid.id)).toMatchObject({
    event_name: 'PAYMENT_VERIFIED',
    amount: '40.0000',
    allocated: '40.0000',
  });
  expect((await rows()).filter((r) => r.business_id === order.intentId)).toHaveLength(0);
  const reference = `SYN-${key()}`;
  const claim = await submitManualPayment(db(), {
    ...context(),
    orderId: order.orderId,
    customerReference: reference,
    idempotencyKey: key(),
  });
  const second = await verifyManualPayment(db(), {
    ...context(),
    attemptId: claim.id,
    confirmedAmount: '75.0000',
    idempotencyKey: key(),
    evidence: { ...order.evidence, transactionId: reference },
  });
  await Promise.all([processCommerceAnalyticsOutbox(db()), processCommerceAnalyticsOutbox(db())]);
  expect((await rows()).find((r) => r.business_id === second.id)).toMatchObject({
    amount: '75.0000',
    allocated: '60.0000',
  });
  expect((await rows()).filter((r) => r.business_id === order.intentId)).toEqual([
    expect.objectContaining({ event_name: 'OBLIGATION_SATISFIED', amount: '100.0000' }),
  ]);
  const before = (
    await sql`select (select count(*) from orders.orders) orders,(select count(*) from payments.payments) payments,
    (select count(*) from payments.payment_allocations) allocations,(select count(*) from inventory.inventory_reservations) reservations,
    (select count(*) from promotions.promotion_usage) promotions,(select count(*) from finance.finance_transactions) finance,
    (select count(*) from cart.carts where status='CONVERTED') converted,(select count(*) from payments.payment_intents) obligations,
    (select count(*) from payments.refunds) refunds`.execute(db())
  ).rows;
  await sql`update platform.event_consumer_receipts set status='PENDING' where consumer_name='analytics.commerce.v1'`.execute(
    db(),
  );
  await processCommerceAnalyticsOutbox(db());
  const after = (
    await sql`select (select count(*) from orders.orders) orders,(select count(*) from payments.payments) payments,
    (select count(*) from payments.payment_allocations) allocations,(select count(*) from inventory.inventory_reservations) reservations,
    (select count(*) from promotions.promotion_usage) promotions,(select count(*) from finance.finance_transactions) finance,
    (select count(*) from cart.carts where status='CONVERTED') converted,(select count(*) from payments.payment_intents) obligations,
    (select count(*) from payments.refunds) refunds`.execute(db())
  ).rows;
  expect(after).toEqual(before);
  expect((await rows()).filter((r) => r.business_id === order.intentId)).toHaveLength(1);
});

it('retains verified history when reversal arrives before projection; records a separate reversal once', async () => {
  const order = await fixture.order();
  const payment = await verifyManualPayment(db(), {
    ...context(),
    attemptId: order.attemptId,
    confirmedAmount: '100',
    idempotencyKey: key(),
    evidence: order.evidence,
  });
  await reverseManualReceipt(db(), {
    ...context(),
    actorId: fixture.owner,
    paymentId: payment.id,
    reason: 'Synthetic correction',
    evidenceReference: 'PII-CANARY-private',
  });
  await reverseManualReceipt(db(), {
    ...context(),
    actorId: fixture.owner,
    paymentId: payment.id,
    reason: 'Synthetic correction',
    evidenceReference: 'PII-CANARY-private',
  });
  await reviseOpenPaymentIntentForOrder(db(), {
    organizationId: fixture.organizationId,
    orderId: order.orderId,
    expectedAmount: '200.0000',
  });
  await processCommerceAnalyticsOutbox(db());
  expect((await rows()).find((r) => r.business_id === order.intentId)).toMatchObject({
    event_name: 'OBLIGATION_SATISFIED',
    amount: '100.0000',
  });
  expect(
    (await rows())
      .filter((r) => r.business_id === payment.id)
      .map((r) => r.event_name)
      .sort(),
  ).toEqual(['PAYMENT_REVERSED', 'PAYMENT_VERIFIED']);
});

it('refund requests do not become completed refunds; partial completion and replay keep the actual amount', async () => {
  const order = await fixture.order();
  const payment = await verifyManualPayment(db(), {
    ...context(),
    attemptId: order.attemptId,
    confirmedAmount: '100',
    idempotencyKey: key(),
    evidence: order.evidence,
  });
  const refund = await createRefund(db(), {
    organizationId: fixture.organizationId,
    actorId: fixture.owner,
    paymentId: payment.id,
    amount: '12.34',
    reasonCode: 'SYNTHETIC',
    idempotencyKey: key(),
  });
  await processCommerceAnalyticsOutbox(db());
  expect((await rows()).filter((r) => r.business_id === refund.id)).toHaveLength(0);
  const input = {
    organizationId: fixture.organizationId,
    actorId: fixture.owner,
    refundId: refund.id,
    externalReference: `SYN-${key()}`,
    idempotencyKey: key(),
    evidenceReference: 'Synthetic original source',
    originalSourceVerified: true,
  };
  await completeManualRefund(db(), input);
  await completeManualRefund(db(), input);
  await processCommerceAnalyticsOutbox(db());
  expect((await rows()).filter((r) => r.business_id === refund.id)).toEqual([
    expect.objectContaining({ event_name: 'REFUND_COMPLETED', amount: '12.3400' }),
  ]);
});

it('isolates cross-tenant, unsupported-version and malformed poison sources', async () => {
  const order = await fixture.order();
  const other = await manualPaymentFixture(db());
  await sourceEvent('orders.order.placed', 'orders.order', order.orderId, {}, other.organizationId);
  await sourceEvent('payments.payment.verified', 'payments.payment', key(), {
    phone: 'PII-CANARY',
  });
  await sourceEvent(
    'orders.order.placed',
    'orders.order',
    order.orderId,
    {},
    fixture.organizationId,
    99,
  );
  await sourceEvent('orders.order.placed', 'orders.order', order.orderId);
  const result = await processCommerceAnalyticsOutbox(db());
  expect(result.rejected).toBeGreaterThanOrEqual(3);
  expect((await rows()).find((r) => r.business_id === order.orderId)).toMatchObject({
    event_name: 'ORDER_COMMITTED',
    amount: null,
  });
  expect((await getCommerceMeasurementReport(db(), other.organizationId, period())).facts).toEqual(
    [],
  );
});

it('rolls back receipt and projection together on worker interruption before commit', async () => {
  const order = await fixture.order();
  await expect(
    processCommerceAnalyticsOutbox(db(), 100, () => {
      throw new Error('simulated crash');
    }),
  ).rejects.toThrow();
  expect((await rows()).find((r) => r.business_id === order.attemptId)).toBeUndefined();
  await processCommerceAnalyticsOutbox(db());
  expect((await rows()).find((r) => r.business_id === order.attemptId)).toBeDefined();
});

it('rejects forged purchases regardless of advertised origin and strips canaries and client amounts', async () => {
  const base = {
    schemaVersion: 1 as const,
    eventId: key(),
    occurredAt: new Date().toISOString(),
    origin: 'BROWSER' as const,
    sessionId: key(),
    consent: { analytics: 'GRANTED' as const, marketing: 'DENIED' as const },
  };
  for (const name of [
    'ORDER_PLACED',
    'PAYMENT_CONFIRMED',
    'REFUND_COMPLETED',
    'ORDER_CANCELLED',
  ] as const)
    await expect(
      ingestStorefrontEvent(db(), fixture.organizationId, {
        ...base,
        name,
        data: { orderId: key(), value: '999999', email: 'PII-CANARY' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ANALYTICS_EVENT' });
  await expect(
    ingestStorefrontEvent(db(), fixture.organizationId, {
      ...base,
      origin: 'SERVER',
      name: 'ORDER_PLACED',
      data: { orderId: key() },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_ANALYTICS_EVENT' });
  await ingestStorefrontEvent(db(), fixture.organizationId, {
    ...base,
    name: 'PRODUCT_VIEWED',
    attribution: { source: 'PII-CANARY', touch: 'FIRST' },
    data: {
      item: {
        productId: key(),
        skuId: key(),
        itemName: 'PII-CANARY',
        phone: 'PII-CANARY',
        price: '999',
      },
      email: 'PII-CANARY',
      value: '999',
    },
  });
  const saved = (
    await sql`select payload,source,monetary_value from analytics.storefront_events where event_id=${base.eventId}`.execute(
      db(),
    )
  ).rows[0];
  expect(JSON.stringify(saved)).not.toContain('PII-CANARY');
  expect(saved).toMatchObject({ source: null, monetary_value: null });
});

it('denied/absent consent fails closed and a later grant never retroactively exports', async () => {
  const s = subject();
  expect(await getCommerceConsent(db(), s)).toMatchObject({
    purposes: [],
    missingDecision: 'UNKNOWN',
    externalDispatchEnabled: false,
  });
  await setCommerceConsent(db(), s, preference('DENIED'));
  const order = await fixture.order();
  await processCommerceAnalyticsOutbox(db());
  const event = (await rows()).find((r) => r.business_id === order.attemptId)!;
  expect(await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS')).toEqual({
    queued: false,
  });
  await setCommerceConsent(db(), s, preference('GRANTED', '1'));
  expect(await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS')).toEqual({
    queued: false,
  });
});

it('withdrawal and regrant invalidate the event-time revision and advertising remains distinct', async () => {
  const { s, event } = await observeSyntheticEvent();
  expect(await queueCommerceTestDelivery(db(), s, event.id, 'ADVERTISING')).toEqual({
    queued: false,
  });
  expect((await getCommerceConsent(db(), { ...s, scope: 'ACCOUNT' })).purposes).toEqual([]);
  expect(
    await queueCommerceTestDelivery(db(), { ...s, organizationId: key() }, event.id, 'ANALYTICS'),
  ).toEqual({ queued: false });
  expect(await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS')).toEqual({ queued: true });
  await setCommerceConsent(db(), s, preference('DENIED', '1'));
  await setCommerceConsent(db(), s, preference('GRANTED', '2'));
  const sends: CommerceTestPayload[] = [];
  expect(
    await dispatchCommerceTestDeliveries(db(), {
      enabled: true,
      destination: {
        kind: 'TEST',
        send: async (p) => {
          sends.push(p);
          return 'ACCEPTED';
        },
      },
    }),
  ).toMatchObject({ suppressed: 1 });
  expect(sends).toEqual([]);
  await expect(setCommerceConsent(db(), s, preference('DENIED', '1'))).rejects.toThrow(
    'CONSENT_REVISION_CONFLICT',
  );
});

it('retries unknown acknowledgements using the identical opaque ID and a strict payload allowlist', async () => {
  const { s, event } = await observeSyntheticEvent();
  await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS');
  const payloads: CommerceTestPayload[] = [];
  let fail = true;
  const destination: CommerceTestDestination = {
    kind: 'TEST',
    send: async (p) => {
      payloads.push(p);
      if (fail) throw new Error('PII-CANARY-provider-secret');
      return 'ACCEPTED';
    },
  };
  await dispatchCommerceTestDeliveries(db(), { enabled: true, destination });
  await sql`update analytics.commerce_deliveries set next_attempt_at=clock_timestamp() where event_id=${event.id}`.execute(
    db(),
  );
  fail = false;
  await Promise.all([
    dispatchCommerceTestDeliveries(db(), { enabled: true, destination }),
    dispatchCommerceTestDeliveries(db(), { enabled: true, destination }),
  ]);
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
  expect(Object.keys(payloads[0]!).sort()).toEqual([
    'amount',
    'currency',
    'eventId',
    'name',
    'occurredAt',
    'schemaVersion',
  ]);
  expect(payloads[0]!.eventId).toBe(event.id);
  expect(
    JSON.stringify(
      (
        await sql`select * from analytics.commerce_deliveries where event_id=${event.id}`.execute(
          db(),
        )
      ).rows,
    ),
  ).not.toContain('PII-CANARY');
  expect(commerceConversionPolicy).toMatchObject({
    ga4: false,
    meta: false,
    purchaseQualification: 'UNAPPROVED',
  });
});

it('destination disabling, malformed rejection and bounded rate-limit retries are terminal or recoverable as specified', async () => {
  for (const outcome of ['DISABLED', 'INVALID_PAYLOAD', 'RATE_LIMIT'] as const) {
    const { s, event } = await observeSyntheticEvent();
    await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS');
    for (let attempt = 0; attempt < (outcome === 'RATE_LIMIT' ? 5 : 1); attempt++) {
      await dispatchCommerceTestDeliveries(db(), {
        enabled: outcome !== 'DISABLED',
        destination: {
          kind: 'TEST',
          send: async () => (outcome === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'INVALID_PAYLOAD'),
        },
      });
      await sql`update analytics.commerce_deliveries set next_attempt_at=clock_timestamp() where event_id=${event.id}`.execute(
        db(),
      );
    }
    const row = (
      await sql<{
        status: string;
        attempt_count: number;
      }>`select status,attempt_count from analytics.commerce_deliveries where event_id=${event.id}`.execute(
        db(),
      )
    ).rows[0]!;
    expect(row.status).toBe(outcome === 'DISABLED' ? 'SUPPRESSED' : 'DEAD_LETTER');
    expect(row.attempt_count).toBe(outcome === 'RATE_LIMIT' ? 5 : outcome === 'DISABLED' ? 0 : 1);
  }
});

it('serializes dispatch with concurrent withdrawal and prevents subsequent delivery', async () => {
  const { s, event } = await observeSyntheticEvent();
  await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS');
  let started!: () => void, release!: () => void;
  const began = new Promise<void>((r) => {
    started = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const dispatch = dispatchCommerceTestDeliveries(db(), {
    enabled: true,
    destination: {
      kind: 'TEST',
      send: async () => {
        started();
        await gate;
        return 'ACCEPTED';
      },
    },
  });
  await began;
  let withdrawn = false;
  const withdrawal = setCommerceConsent(db(), s, preference('DENIED', '1')).then(() => {
    withdrawn = true;
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(withdrawn).toBe(false);
  release();
  await dispatch;
  await withdrawal;
  expect(
    await dispatchCommerceTestDeliveries(db(), {
      enabled: true,
      destination: {
        kind: 'TEST',
        send: async () => {
          throw new Error('Unexpected send');
        },
      },
    }),
  ).toEqual({ attempted: 0, suppressed: 0 });
});

it('excludes synthetic and unclassified activity from business reporting and reports operational categories without a live conversion rate', async () => {
  const report = await getCommerceMeasurementReport(db(), fixture.organizationId, period());
  expect(report.facts).toEqual([]);
  expect(report.conversionRate).toBeNull();
  const synthetic = await getCommerceMeasurementReport(db(), fixture.organizationId, {
    ...period(),
    trafficClass: 'SYNTHETIC',
  });
  expect(synthetic.facts.length).toBeGreaterThan(0);
  await expect(
    getCommerceMeasurementReport(db(), fixture.organizationId, {
      from: '2026-02-31',
      to: '2026-03-01',
    }),
  ).rejects.toThrow();
  await expect(processCommerceAnalyticsOutbox(db(), 501)).rejects.toThrow();
  await expect(cleanupCommerceMeasurement(db(), 1001)).rejects.toThrow();
});

it('measures a bounded synthetic batch with duplicate domain identities and no sensitive payload copying', async () => {
  const order = await fixture.order();
  const started = performance.now();
  await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
    select ${fixture.organizationId},'orders.order.placed',1,'orders.order',${order.orderId}::uuid,'{"email":"PII-CANARY","transactionId":"PII-CANARY"}'::jsonb,clock_timestamp() from generate_series(1,100)`.execute(
    db(),
  );
  const captured = performance.now();
  await Promise.all([
    processCommerceAnalyticsOutbox(db(), 100),
    processCommerceAnalyticsOutbox(db(), 100),
  ]);
  const finished = performance.now();
  expect((await rows()).filter((r) => r.business_id === order.orderId)).toHaveLength(1);
  console.info(
    'commerce synthetic 100 duplicate events ms',
    JSON.stringify({ capture: captured - started, drain: finished - captured }),
  );
});

it('retains independently verified amounts beyond JavaScript safe integer precision', async () => {
  const order = await fixture.order();
  const payment = await verifyManualPayment(db(), {
    ...context(),
    attemptId: order.attemptId,
    confirmedAmount: '9007199254740993.0001',
    idempotencyKey: key(),
    evidence: order.evidence,
  });
  await processCommerceAnalyticsOutbox(db());
  expect((await rows()).find((r) => r.business_id === payment.id)).toMatchObject({
    amount: '9007199254740993.0001',
    allocated: '100.0000',
  });
});

it('expires optional delivery state without deleting essential commerce or financial records', async () => {
  const { s, event } = await observeSyntheticEvent();
  await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS');
  await sql`update analytics.commerce_deliveries set expires_at=clock_timestamp()-interval '1 second' where event_id=${event.id}`.execute(
    db(),
  );
  let sent = false;
  expect(
    await dispatchCommerceTestDeliveries(db(), {
      enabled: true,
      destination: {
        kind: 'TEST',
        send: async () => {
          sent = true;
          return 'ACCEPTED';
        },
      },
    }),
  ).toMatchObject({ suppressed: 1 });
  expect(sent).toBe(false);
  await sql`update analytics.commerce_consent set changed_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day'
    where organization_id=${s.organizationId} and subject_id=${s.subjectId}`.execute(db());
  const cleaned = await cleanupCommerceMeasurement(db());
  expect(cleaned.deliveries).toBeGreaterThanOrEqual(1);
  expect(cleaned.consent).toBeGreaterThanOrEqual(1);
  expect((await rows()).find((r) => r.id === event.id)).toBeDefined();
  expect(
    (await sql`select 1 from payments.payment_attempts where id=${event.business_id}`.execute(db()))
      .rows,
  ).toHaveLength(1);
});

it('bounded transport timeout remains retryable without retaining error messages', async () => {
  const { s, event } = await observeSyntheticEvent();
  await queueCommerceTestDelivery(db(), s, event.id, 'ANALYTICS');
  await dispatchCommerceTestDeliveries(db(), {
    enabled: true,
    destination: {
      kind: 'TEST',
      send: async (_payload, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('PII-CANARY')), { once: true }),
        ),
    },
  });
  const row = (
    await sql`select status,error_code,attempt_count from analytics.commerce_deliveries where event_id=${event.id}`.execute(
      db(),
    )
  ).rows[0];
  expect(row).toEqual({ status: 'RETRY_WAIT', error_code: 'TIMEOUT', attempt_count: 1 });
});

it('bounds projection retries and isolates an invalid obligation snapshot', async () => {
  const order = await fixture.order();
  const payment = await verifyManualPayment(db(), {
    ...context(),
    attemptId: order.attemptId,
    confirmedAmount: '100',
    idempotencyKey: key(),
    evidence: order.evidence,
  });
  const eventId = await sourceEvent('payments.payment.verified', 'payments.payment', payment.id, {
    obligationSatisfied: true,
    intentId: order.intentId,
    obligationAmount: 'PII-CANARY',
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    await processCommerceAnalyticsOutbox(db());
    await sql`update platform.event_consumer_receipts set next_retry_at=clock_timestamp()
      where consumer_name='analytics.commerce.v1' and outbox_event_id=${eventId}::bigint`.execute(
      db(),
    );
  }
  const receipt = (
    await sql`select status,attempt_count,last_error_code from platform.event_consumer_receipts
    where consumer_name='analytics.commerce.v1' and outbox_event_id=${eventId}::bigint`.execute(
      db(),
    )
  ).rows[0];
  expect(receipt).toEqual({
    status: 'DEAD_LETTER',
    attempt_count: 5,
    last_error_code: 'COMMERCE_PROJECTION_FAILED',
  });
  expect((await rows()).filter((r) => r.business_id === payment.id)).toHaveLength(1);
});
