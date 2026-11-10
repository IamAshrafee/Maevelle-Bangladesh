import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import { createDatabase } from '../index.js';
import { runMigrations } from '../migrate.js';
import { isolatedCartDatabase } from '../testing/cart-fixture.js';
import { manualPaymentFixture } from '../testing/manual-payment-fixture.js';
import { postgresCommitFault } from '../testing/postgres-wire-fault.js';
import { nextFinanceNumber } from '../finance/document-numbers.js';
import {
  privacyBrowserSession,
  readPrivacyPreferences,
  savePrivacyPreferences,
} from '../analytics.js';
import {
  verifyManualPayment,
  submitManualPayment,
  createRefund,
  completeManualRefund,
  changeRefundProcessingState,
  getRefund,
} from '../payments.js';

let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>;
beforeAll(async () => {
  isolated = await isolatedCartDatabase();
  await runMigrations(isolated.database.db);
});
afterAll(async () => isolated?.close());
const db = () => isolated.database.db;
const key = () => crypto.randomUUID();

it('boots above legacy Finance suffix gaps, retains seven digits and rolls sequence allocation back atomically', async () => {
  const f = await manualPaymentFixture(db());
  await sql`insert into finance.finance_transactions(organization_id,transaction_number,transaction_type,description,created_by)
    values(${f.organizationId},'FIN-999999','EXTERNAL_ADJUSTMENT','Synthetic legacy gap',${f.owner})`.execute(
    db(),
  );
  await expect(
    db()
      .transaction()
      .execute(async (tx) => {
        expect(await nextFinanceNumber(tx, f.organizationId, 'FIN')).toBe('FIN-1000000');
        throw new Error('synthetic rollback');
      }),
  ).rejects.toThrow('synthetic rollback');
  expect(
    await db()
      .transaction()
      .execute((tx) => nextFinanceNumber(tx, f.organizationId, 'FIN')),
  ).toBe('FIN-1000000');
  expect(
    await db()
      .transaction()
      .execute((tx) => nextFinanceNumber(tx, f.organizationId, 'FIN')),
  ).toBe('FIN-1000001');
});

it('conserves eight concurrent independent-account receipts and their shared Finance numbering', async () => {
  const f = await manualPaymentFixture(db());
  const claims = [];
  for (let i = 0; i < 8; i++) {
    const claim = await f.order();
    const account = (
      await sql<{ id: string }>`insert into finance.financial_accounts
      (organization_id,account_number,name,account_type,currency_code)
      values(${f.organizationId},${`SYN-${i}`},'Synthetic separate wallet','MOBILE_WALLET','BDT') returning id`.execute(
        db(),
      )
    ).rows[0]!;
    claims.push({ ...claim, evidence: { ...claim.evidence, financialAccountId: account.id } });
  }
  // Widen the actual INSERT race, without changing business queries or outcomes.
  await sql`create function public.phase09_slow_finance() returns trigger language plpgsql as $$
    begin perform pg_sleep(0.05); return NEW; end $$`.execute(db());
  await sql`create trigger phase09_slow_finance before insert on finance.finance_transactions
    for each row execute function public.phase09_slow_finance()`.execute(db());
  try {
    const results = await Promise.allSettled(
      claims.map((c) =>
        verifyManualPayment(db(), {
          organizationId: f.organizationId,
          actorId: f.reviewer,
          attemptId: c.attemptId,
          confirmedAmount: '40.0000',
          evidence: c.evidence,
          idempotencyKey: key(),
        }),
      ),
    );
    expect(
      results.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'OK')),
    ).toEqual(Array(8).fill('OK'));
    const totals = (
      await sql`select count(*)::int receipts,sum(p.amount)::text received,
      count(distinct t.transaction_number)::int documents,
      sum(e.amount_delta)::text posted
      from payments.payments p join finance.finance_transactions t on t.source_id=p.id
        and t.organization_id=p.organization_id and t.source_domain='payments.payment'
      join finance.financial_account_entries e on e.finance_transaction_id=t.id
      where p.organization_id=${f.organizationId}`.execute(db())
    ).rows[0];
    expect(totals).toMatchObject({
      receipts: 8,
      documents: 8,
      received: '320.0000',
      posted: '320.0000',
    });
  } finally {
    await sql`drop trigger phase09_slow_finance on finance.finance_transactions`.execute(db());
    await sql`drop function public.phase09_slow_finance()`.execute(db());
  }
}, 20000);

it.each(['BEFORE_COMMIT', 'AFTER_COMMIT'] as const)(
  'recovers claims, verification, refund request and completion after physical %s',
  async (mode) => {
    const f = await manualPaymentFixture(db());
    const c = await f.order();
    async function fault<T>(operation: (d: typeof isolated.database.db) => Promise<T>) {
      const proxy = await postgresCommitFault(isolated.url, mode);
      const broken = createDatabase({ connectionString: proxy.url, maxConnections: 1 });
      try {
        await expect(operation(broken.db)).rejects.toThrow();
        expect(proxy.evidence).toEqual({
          intercepted: true,
          serverCommitSeen: mode === 'AFTER_COMMIT',
        });
      } finally {
        await broken.close();
        await proxy.close();
      }
    }
    const claim = {
      organizationId: f.organizationId,
      orderId: c.orderId,
      customerReference: `SYN-${key()}`,
      idempotencyKey: key(),
    };
    await fault((d) => submitManualPayment(d, claim));
    const a = await submitManualPayment(db(), claim);
    expect((await submitManualPayment(db(), claim)).id).toBe(a.id);
    const verification = {
      organizationId: f.organizationId,
      actorId: f.reviewer,
      attemptId: c.attemptId,
      confirmedAmount: '100.0000',
      evidence: c.evidence,
      idempotencyKey: key(),
    };
    await fault((d) => verifyManualPayment(d, verification));
    const payment = await verifyManualPayment(db(), verification);
    expect((await verifyManualPayment(db(), verification)).id).toBe(payment.id);
    const request = {
      organizationId: f.organizationId,
      actorId: f.owner,
      paymentId: payment.id,
      amount: '10',
      reasonCode: 'RETURN',
      idempotencyKey: key(),
    };
    await fault((d) => createRefund(d, request));
    const refund = await createRefund(db(), request);
    expect((await createRefund(db(), request)).id).toBe(refund.id);
    const processing = {
      organizationId: f.organizationId,
      actorId: f.owner,
      refundId: refund.id,
      expectedVersion: refund.version,
      state: 'PROCESSING' as const,
      evidenceReference: 'synthetic independent reconciliation',
    };
    await fault((d) => changeRefundProcessingState(d, processing));
    // A CAS operation is recovered by reading durable authority, never by another payout.
    const observed = await getRefund(db(), f.organizationId, refund.id);
    expect(observed.status).toBe(mode === 'AFTER_COMMIT' ? 'PROCESSING' : 'REQUESTED');
    if (observed.status === 'REQUESTED') await changeRefundProcessingState(db(), processing);
    const completion = {
      organizationId: f.organizationId,
      actorId: f.owner,
      refundId: refund.id,
      idempotencyKey: key(),
      externalReference: `SYN-${key()}`,
      originalSourceVerified: true,
      evidenceReference: 'synthetic independently reconciled outgoing transfer',
    };
    await fault((d) => completeManualRefund(d, completion));
    const completed = await completeManualRefund(db(), completion);
    expect(completed.status).toBe('COMPLETED');
    expect((await completeManualRefund(db(), completion)).id).toBe(refund.id);
    const totals = (
      await sql`select
      (select count(*)::int from payments.payments where organization_id=${f.organizationId}) receipts,
      (select sum(amount)::text from payments.refunds where organization_id=${f.organizationId} and status='COMPLETED') refunded,
      (select sum(amount_delta)::text from finance.financial_account_entries where organization_id=${f.organizationId}) balance`.execute(
        db(),
      )
    ).rows[0];
    expect(totals).toMatchObject({ receipts: 1, refunded: '10.0000', balance: '90.0000' });
  },
  30000,
);

it.each(['BEFORE_COMMIT', 'AFTER_COMMIT'] as const)(
  'recovers consent withdrawal from durable revisions after physical %s without regrant',
  async (mode) => {
    const f = await manualPaymentFixture(db());
    const owner = {
      organizationId: f.organizationId,
      binding: randomBytes(32).toString('base64url'),
      shopper: null,
    };
    const secret = key() + key();
    const { session } = await db()
      .transaction()
      .execute((tx) => privacyBrowserSession(tx, owner, undefined, true));
    const initial = await readPrivacyPreferences(db(), owner, session, secret);
    const choices = (decision: 'GRANTED' | 'DENIED', revision: string) => ({
      ANALYTICS: { decision, expectedRevision: revision, expectedBrowserRevision: revision },
      ADVERTISING: { decision, expectedRevision: revision, expectedBrowserRevision: revision },
    });
    await db()
      .transaction()
      .execute((tx) =>
        savePrivacyPreferences(tx, owner, session, {
          policyVersion: initial.policyVersion,
          choices: choices('GRANTED', '0'),
        }),
      );
    const withdrawal = { policyVersion: initial.policyVersion, choices: choices('DENIED', '1') };
    const proxy = await postgresCommitFault(isolated.url, mode);
    const broken = createDatabase({ connectionString: proxy.url, maxConnections: 1 });
    try {
      await expect(
        broken.db
          .transaction()
          .execute((tx) => savePrivacyPreferences(tx, owner, session, withdrawal)),
      ).rejects.toThrow();
      expect(proxy.evidence).toEqual({
        intercepted: true,
        serverCommitSeen: mode === 'AFTER_COMMIT',
      });
      const observed = await readPrivacyPreferences(db(), owner, session, secret);
      expect(observed.purposes.ANALYTICS.effectiveDecision).toBe(
        mode === 'AFTER_COMMIT' ? 'DENIED' : 'GRANTED',
      );
      if (mode === 'BEFORE_COMMIT')
        await db()
          .transaction()
          .execute((tx) => savePrivacyPreferences(tx, owner, session, withdrawal));
      else
        await expect(
          db()
            .transaction()
            .execute((tx) => savePrivacyPreferences(tx, owner, session, withdrawal)),
        ).rejects.toMatchObject({ code: 'CONSENT_REVISION_CONFLICT' });
      const reconciled = await readPrivacyPreferences(db(), owner, session, secret);
      expect(reconciled.observationToken).toBeNull();
      expect(reconciled.externalDispatchEnabled).toBe(false);
      expect(reconciled.purposes.ANALYTICS).toMatchObject({
        effectiveDecision: 'DENIED',
        revision: '2',
      });
    } finally {
      await broken.close();
      await proxy.close();
    }
  },
  15000,
);
