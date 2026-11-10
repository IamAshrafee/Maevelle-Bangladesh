import { beforeAll, afterAll, it, expect } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from '../../index.js';
import { isolatedCartDatabase } from '../../testing/cart-fixture.js';
import { runMigrations } from '../../migrate.js';
import { cashSettlementFixture } from '../../testing/cash-settlement-fixture.js';
import { cashShortfallEngine, settleCashShortfall } from './engine.js';
import { cashSettlement, listCashAdjustments } from './queries.js';
import { approveCashShortfallPolicy } from './policies.js';
import { postgresCommitFault } from '../../testing/postgres-wire-fault.js';
import {
  getOrderPaymentSummary,
  createRefund,
  completeManualRefund,
  listPendingCodCollections,
} from '../../payments.js';
import { reverseUnpostedCodCollection, verifyManualPayment } from '../../payments.js';
import {
  createFinancialAccount,
  postPaymentToFinancialAccount,
  createCodSettlement,
  listOutstandingCodSettlementPayments,
} from '../../finance.js';
import { processCommerceAnalyticsOutbox } from '../../analytics.js';

let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>;
beforeAll(async () => {
  isolated = await isolatedCartDatabase();
  await runMigrations(isolated.database.db);
}, 60000);
afterAll(async () => isolated?.close());
const db = () => isolated.database.db,
  key = () => crypto.randomUUID();
const engine = cashShortfallEngine(async () => 'SYNTHETIC');
const context = (f: Awaited<ReturnType<typeof cashSettlementFixture>>, actorId = f.owner) => ({
  organizationId: f.organizationId,
  actorId,
});

it('settles 81/80/1 without changing original payable, cash, courier custody or creating a money conversion', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect();
  await expect(engine.settle(db(), context(f), c.input, key())).resolves.toMatchObject({
    state: 'APPLIED',
    amount: '1.0000',
  });
  expect(await cashSettlement(db(), f.organizationId, c.orderId)).toMatchObject({
    originalPayable: '81.0000',
    actualCollected: '80.0000',
    authorizedWaiver: '1.0000',
    outstanding: '0.0000',
    settlementStatus: 'SETTLED_WITH_ADJUSTMENT',
  });
  expect(
    await getOrderPaymentSummary(db(), {
      organizationId: f.organizationId,
      orderId: c.orderId,
      paymentMethod: 'COD',
      expectedAmount: '81',
    }),
  ).toMatchObject({
    status: 'PARTIALLY_PAID',
    collected: '80.0000',
    authorizedWaiver: '1.0000',
    outstanding: '0.0000',
  });
  expect(await listPendingCodCollections(db(), f.organizationId)).toEqual([]);
  const totals = (
    await sql`select (select count(*)::int from payments.payments where organization_id=${f.organizationId}) receipts,
    (select coalesce(sum(amount_delta),0)::text from finance.financial_account_entries where organization_id=${f.organizationId}) cash,
    (select total_amount::text from orders.orders where id=${c.orderId}) original`.execute(db())
  ).rows[0];
  expect(totals).toEqual({ receipts: 1, cash: '0', original: '81.0000' }); // COD remains courier custody, not yet Maevelle cash.
  await processCommerceAnalyticsOutbox(db(), 500);
  expect(
    (
      await sql`select event_name,amount::text from analytics.commerce_events where organization_id=${f.organizationId}`.execute(
        db(),
      )
    ).rows,
  ).toEqual([expect.objectContaining({ event_name: 'COD_COLLECTED', amount: '80.0000' })]);
});

it.each(['81', '79'])(
  'rejects waiver for actual collection %s when not the approved residual',
  async (received) => {
    const f = await cashSettlementFixture(db()),
      c = await f.collect(received);
    await expect(engine.settle(db(), context(f), c.input, key())).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  },
);
it('keeps public activation blocked even with stored synthetic approvals', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect();
  await expect(settleCashShortfall(db(), context(f), c.input, key())).rejects.toMatchObject({
    code: 'POLICY_BLOCKED',
  });
});
it('requires capability, tenant authority and genuine receipt bound to this Order', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect(),
    other = await f.collect();
  await expect(engine.settle(db(), context(f, f.viewer), c.input, key())).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(
    engine.settle(db(), context(f), { ...c.input, paymentId: other.paymentId }, key()),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    engine.settle(db(), { ...context(f), organizationId: key() }, c.input, key()),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('rejects an expired policy and self-approval of its proposal', async () => {
  const f = await cashSettlementFixture(db(), {
      effectiveFrom: '2020-01-01T00:00:00Z',
      expiresAt: '2020-01-02T00:00:00Z',
    }),
    c = await f.collect();
  await expect(engine.settle(db(), context(f), c.input, key())).rejects.toMatchObject({
    code: 'POLICY_BLOCKED',
  });
  await expect(
    approveCashShortfallPolicy(db(), {
      ...context(f),
      proposalId: f.proposalId,
      approvalReference: 'Synthetic self approval',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('supports independent approval without trusting an approver ID in the request', async () => {
  const f = await cashSettlementFixture(db(), { selfApprovalLimit: '0' }),
    c = await f.collect();
  const request = await engine.settle(db(), context(f), c.input, key());
  expect(request.state).toBe('REQUIRES_APPROVAL');
  await expect(engine.approve(db(), context(f), request.id, key())).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(
    engine.approve(db(), context(f, f.reviewer), request.id, key()),
  ).resolves.toMatchObject({ state: 'APPLIED', approvedBy: f.reviewer });
});
it('serializes competing operators and same-key retries, rejects changed intent, and preserves one posting', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect(),
    intent = key();
  const results = await Promise.all([
    engine.settle(db(), context(f), c.input, intent),
    engine.settle(db(), context(f), c.input, intent),
  ]);
  expect(results[0]).toEqual(results[1]);
  await expect(
    engine.settle(db(), context(f), { ...c.input, reason: 'Changed intent' }, intent),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(engine.settle(db(), context(f, f.reviewer), c.input, key())).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const rows = await listCashAdjustments(db(), {
    organizationId: f.organizationId,
    orderId: c.orderId,
  });
  expect(rows.total).toBe(1);
  expect(
    (
      await sql`select id from finance.finance_transactions where organization_id=${f.organizationId} and transaction_type='CUSTOMER_BALANCE_WAIVER'`.execute(
        db(),
      )
    ).rows,
  ).toHaveLength(1);
});
it('enforces staff/day limits across separate Orders, including reversed adjustments', async () => {
  const f = await cashSettlementFixture(db(), { maximumPerStaffDay: '1' }),
    a = await f.collect(),
    b = await f.collect();
  const applied = await engine.settle(db(), context(f), a.input, key());
  await engine.reverse(
    db(),
    context(f),
    applied.id,
    { reason: 'Synthetic correction', evidenceReference: 'Synthetic approved correction' },
    key(),
  );
  await expect(engine.settle(db(), context(f), b.input, key())).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it('reverses a mistaken waiver append-only and safely reopens the residual', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect(),
    a = await engine.settle(db(), context(f), c.input, key()),
    intent = key();
  await engine.reverse(
    db(),
    context(f),
    a.id,
    { reason: 'Synthetic correction', evidenceReference: 'Synthetic correction log' },
    intent,
  );
  await engine.reverse(
    db(),
    context(f),
    a.id,
    { reason: 'Synthetic correction', evidenceReference: 'Synthetic correction log' },
    intent,
  );
  expect(await cashSettlement(db(), f.organizationId, c.orderId)).toMatchObject({
    authorizedWaiver: '0.0000',
    outstanding: '1.0000',
    actualCollected: '80.0000',
  });
  expect(
    (await listCashAdjustments(db(), { organizationId: f.organizationId, orderId: c.orderId }))
      .items[0]!.state,
  ).toBe('REVERSED');
});
it('retains immutable adjustment evidence after Order closure', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect();
  const applied = await engine.settle(db(), context(f), c.input, key());
  await sql`update orders.orders set order_status='COMPLETED' where id=${c.orderId}`.execute(db());
  const history = await listCashAdjustments(db(), {
    organizationId: f.organizationId,
    orderId: c.orderId,
  });
  expect(history.items).toContainEqual(
    expect.objectContaining({
      id: applied.id,
      state: 'APPLIED',
      amount: '1.0000',
      reason: c.input.reason,
    }),
  );
  await expect(
    sql`update payments.cash_shortfall_requests set amount=2 where id=${applied.id}`.execute(db()),
  ).rejects.toThrow();
  expect(await cashSettlement(db(), f.organizationId, c.orderId)).toMatchObject({
    originalPayable: '81.0000',
    actualCollected: '80.0000',
    outstanding: '0.0000',
  });
});

it('limits refunds to genuine collected cash, never the waived amount', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect();
  await engine.settle(db(), context(f), c.input, key());
  await expect(
    createRefund(db(), {
      ...context(f),
      paymentId: c.paymentId,
      amount: '81',
      reasonCode: 'RETURN',
      idempotencyKey: key(),
    }),
  ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_REFUNDABLE' });
  const refund = await createRefund(db(), {
    ...context(f),
    paymentId: c.paymentId,
    amount: '80',
    reasonCode: 'RETURN',
    idempotencyKey: key(),
  });
  await completeManualRefund(db(), {
    ...context(f),
    refundId: refund.id,
    externalReference: 'SYN-' + key(),
    idempotencyKey: key(),
  });
  expect(await cashSettlement(db(), f.organizationId, c.orderId)).toMatchObject({
    actualCollected: '80.0000',
    refunded: '80.0000',
    authorizedWaiver: '1.0000',
  });
});
it('rolls the request, adjustment, memorandum, audit and outbox back when Finance posting fails', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect();
  await sql`create function public.reject_09a1_memorandum() returns trigger language plpgsql as $$begin
    if new.transaction_type='CUSTOMER_BALANCE_WAIVER' then raise exception 'Synthetic Finance failure' using errcode='23514';end if;return new;end $$`.execute(
    db(),
  );
  await sql`create trigger reject_09a1_memorandum before insert on finance.finance_transactions for each row execute function public.reject_09a1_memorandum()`.execute(
    db(),
  );
  try {
    await expect(engine.settle(db(), context(f), c.input, key())).rejects.toMatchObject({
      code: '23514',
    });
    expect(
      (await listCashAdjustments(db(), { organizationId: f.organizationId, orderId: c.orderId }))
        .total,
    ).toBe(0);
    expect(await cashSettlement(db(), f.organizationId, c.orderId)).toMatchObject({
      outstanding: '1.0000',
      authorizedWaiver: '0.0000',
    });
  } finally {
    await sql`drop trigger reject_09a1_memorandum on finance.finance_transactions`.execute(db());
    await sql`drop function public.reject_09a1_memorandum()`.execute(db());
  }
});
it('allows only one different-key winner across two authorized operators', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect(),
    other = await f.actor(['payments.cash_adjustments.manage']);
  const r = await Promise.allSettled([
    engine.settle(db(), context(f), c.input, key()),
    engine.settle(db(), context(f, other), c.input, key()),
  ]);
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await listCashAdjustments(db(), { organizationId: f.organizationId, orderId: c.orderId }))
      .total,
  ).toBe(1);
});
it('rejects cancelled Orders, wallet shortfalls and excess COD collection', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect();
  await sql`update orders.orders set order_status='CANCELLED' where id=${c.orderId}`.execute(db());
  await expect(engine.settle(db(), context(f), c.input, key())).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  const wallet = await f.order(),
    p = await verifyManualPayment(db(), {
      ...context(f, f.reviewer),
      actorId: f.owner,
      attemptId: wallet.attemptId,
      confirmedAmount: '80',
      evidence: wallet.evidence,
      idempotencyKey: key(),
    });
  await expect(
    engine.settle(
      db(),
      context(f),
      { ...c.input, orderId: wallet.orderId, paymentId: p.id },
      key(),
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(f.collect('82')).rejects.toMatchObject({
    code: 'COD_COLLECTION_EXCEEDS_OUTSTANDING',
  });
});
it('reverses unposted collection and its waiver together without touching original payable', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect(),
    a = await engine.settle(db(), context(f), c.input, key());
  await reverseUnpostedCodCollection(db(), {
    ...context(f, f.reviewer),
    paymentId: c.paymentId,
    reason: 'Synthetic erroneous collection',
    evidenceReference: 'Synthetic independently verified reversal',
  });
  expect(await cashSettlement(db(), f.organizationId, c.orderId)).toMatchObject({
    originalPayable: '81.0000',
    actualCollected: '0.0000',
    authorizedWaiver: '0.0000',
    outstanding: '81.0000',
  });
  expect(
    (await listCashAdjustments(db(), { organizationId: f.organizationId, orderId: c.orderId }))
      .items[0],
  ).toMatchObject({ id: a.id, state: 'REVERSED' });
});
it('keeps a courier remittance shortage separate from an already fulfilled customer obligation', async () => {
  const f = await cashSettlementFixture(db()),
    c = await f.collect('81');
  const holding = await createFinancialAccount(db(), {
    ...context(f),
    accountNumber: 'SYN-HOLDING',
    name: 'Synthetic courier custody',
    accountType: 'OTHER',
    currencyCode: 'BDT',
    openingBalance: '0',
    idempotencyKey: key(),
  });
  await postPaymentToFinancialAccount(db(), {
    ...context(f),
    paymentId: c.paymentId,
    accountId: holding.id,
    idempotencyKey: key(),
  });
  await createCodSettlement(db(), {
    ...context(f),
    destinationAccountId: f.accountId,
    remittanceReference: 'SYN-REMIT-' + key(),
    allocations: [{ paymentId: c.paymentId, amount: '80' }],
    idempotencyKey: key(),
  });
  expect(await cashSettlement(db(), f.organizationId, c.orderId)).toMatchObject({
    actualCollected: '81.0000',
    authorizedWaiver: '0.0000',
    outstanding: '0.0000',
    settlementStatus: 'SETTLED_BY_RECEIPTS',
  });
  expect(await listOutstandingCodSettlementPayments(db(), f.organizationId)).toEqual([
    expect.objectContaining({ paymentId: c.paymentId, outstandingAmount: '1.0000' }),
  ]);
  await expect(engine.settle(db(), context(f), c.input, key())).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it.each(['BEFORE_COMMIT', 'AFTER_COMMIT'] as const)(
  'recovers one waiver identity after physical %s',
  async (mode) => {
    const f = await cashSettlementFixture(db()),
      c = await f.collect(),
      intent = key(),
      fault = await postgresCommitFault(isolated.url, mode),
      broken = createDatabase({ connectionString: fault.url, maxConnections: 1 });
    try {
      await expect(engine.settle(broken.db, context(f), c.input, intent)).rejects.toThrow();
      expect(fault.evidence).toEqual({
        intercepted: true,
        serverCommitSeen: mode === 'AFTER_COMMIT',
      });
      const result = await engine.settle(db(), context(f), c.input, intent);
      expect(await engine.settle(db(), context(f), c.input, intent)).toEqual(result);
      expect(
        (await listCashAdjustments(db(), { organizationId: f.organizationId, orderId: c.orderId }))
          .total,
      ).toBe(1);
    } finally {
      await broken.close();
      await fault.close();
    }
  },
  15000,
);
