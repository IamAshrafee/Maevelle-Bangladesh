import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { isolatedCartDatabase } from '../testing/cart-fixture.js';
import { manualPaymentFixture } from '../testing/manual-payment-fixture.js';
import { runMigrations } from '../migrate.js';
import { migrationProvider } from '../migrations/index.js';
import {
  createReceivingDestination,
  changeReceivingDestination,
  listReceivingDestinations,
  checkoutPaymentReadiness,
  verifyManualPayment,
  getVerifiedReceipt,
  getOrderPaymentSummary,
  submitManualPayment,
  reviewManualClaim,
  listManualClaimQueue,
  reverseManualReceipt,
  approvePaymentOperatingPolicy,
  proposePaymentOperatingPolicy,
  prepareCheckoutPaymentObligationInTransaction,
  createRefund,
  completeManualRefund,
  processPaymentReviewAging,
  changeRefundProcessingState,
  getPaymentDetail,
  getPayment,
  listPayments,
} from '../payments.js';
import { cancelOrder, processExpiredPaymentOrders } from '../orders.js';
import { dispatchFulfillment } from '../fulfillment.js';
import { createLocation } from '../warehouse.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
const db = () => isolation.database.db;
beforeAll(async () => {
  isolation = await isolatedCartDatabase();
  await runMigrations(db());
});
afterAll(async () => {
  await isolation?.close();
});
const key = () => crypto.randomUUID();
const destination = (
  f: Awaited<ReturnType<typeof manualPaymentFixture>>,
  provider: 'BKASH' | 'NAGAD' = 'BKASH',
) => ({
  organizationId: f.organizationId,
  actorId: f.owner,
  provider,
  accountType: 'PERSONAL_RETAIL_ACCOUNT' as const,
  receivingNumber: '01700000000',
  recipientName: 'Synthetic recipient',
  transferAction: 'MERCHANT_PAYMENT' as const,
  instructions: 'Use the provider-approved payment action. Never share PIN or OTP.',
  financialAccountId: f.accountId,
});
const approve = (
  f: Awaited<ReturnType<typeof manualPaymentFixture>>,
  c: Awaited<ReturnType<typeof f.order>>,
  amount = '100.0000',
  k = key(),
) =>
  verifyManualPayment(db(), {
    organizationId: f.organizationId,
    actorId: f.reviewer,
    attemptId: c.attemptId,
    confirmedAmount: amount,
    idempotencyKey: k,
    evidence: c.evidence,
  });

describe('Phase 04A independent manual receipt integrity', () => {
  it('bounds the review queue and measures a small synthetic verification workload', async () => {
    const f = await manualPaymentFixture(db()),
      durations: number[] = [];
    for (let n = 0; n < 20; n++) {
      const c = await f.order(),
        start = performance.now();
      await approve(f, c);
      durations.push(performance.now() - start);
    }
    for (let n = 0; n < 12; n++) await f.order();
    const page = await listManualClaimQueue(db(), {
      organizationId: f.organizationId,
      actorId: f.reviewer,
      pageSize: 5,
    });
    expect(page.items).toHaveLength(5);
    expect(page.pagination.totalItems).toBe(12);
    const empty = await listManualClaimQueue(db(), {
      organizationId: f.organizationId,
      actorId: f.reviewer,
      page: 100,
      pageSize: 5,
    });
    expect(empty.items).toHaveLength(0);
    expect(empty.pagination.totalItems).toBe(12);
    durations.sort((a, b) => a - b);
    console.info(
      'Synthetic payment verification: 20 receipts, p95 ms',
      durations[18]!.toFixed(2),
      'max ms',
      durations[19]!.toFixed(2),
    );
  }, 30000);
  it('blocks dispatch for unpaid and partially paid prepaid Orders', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order();
    const location = await createLocation(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      code: 'SYN',
      name: 'Synthetic stock',
      locationType: 'WAREHOUSE',
      capabilities: ['STOCK_HOLDING'],
    });
    const fulfillment = (
      await sql<{
        id: string;
      }>`insert into fulfillment.fulfillments(organization_id,fulfillment_number,order_id,location_id,status)
      values(${f.organizationId},${key()},${c.orderId},${location.id},'PACKED') returning id`.execute(
        db(),
      )
    ).rows[0]!;
    const dispatch = () =>
      dispatchFulfillment(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        fulfillmentId: fulfillment.id,
        expectedVersion: 1,
        idempotencyKey: key(),
      });
    await expect(dispatch()).rejects.toMatchObject({ code: 'CONFLICT' });
    await approve(f, c, '40');
    await expect(dispatch()).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('holds unknown refund outcomes for reconciliation and completes only verified original-source refunds', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order(),
      p = await approve(f, c);
    const refund = await createRefund(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      paymentId: p.id,
      amount: '10',
      reasonCode: 'RETURN',
      idempotencyKey: key(),
    });
    const processing = await changeRefundProcessingState(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      refundId: refund.id,
      expectedVersion: refund.version,
      state: 'PROCESSING',
      evidenceReference: 'independent authorized transfer started',
    });
    const unknown = await changeRefundProcessingState(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      refundId: refund.id,
      expectedVersion: processing.version,
      state: 'UNKNOWN_EXTERNAL_OUTCOME',
      evidenceReference: 'connection lost; reconcile original source',
    });
    await expect(
      changeRefundProcessingState(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        refundId: refund.id,
        expectedVersion: unknown.version,
        state: 'PROCESSING',
        evidenceReference: 'unsafe transfer retry',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const complete = await completeManualRefund(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      refundId: refund.id,
      idempotencyKey: key(),
      externalReference: 'SYN-REFUND-REAL',
      originalSourceVerified: true,
      evidenceReference: 'independently checked outgoing transfer',
    });
    expect(complete.status).toBe('COMPLETED');
    expect((await getPaymentDetail(db(), f.organizationId, p.id)).refunds[0]!.status).toBe(
      'COMPLETED',
    );
    const next = await createRefund(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      paymentId: p.id,
      amount: '10',
      reasonCode: 'RETURN',
      idempotencyKey: key(),
    });
    await expect(
      completeManualRefund(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        refundId: next.id,
        idempotencyKey: key(),
        externalReference: 'SYN-REFUND-REAL',
        originalSourceVerified: true,
        evidenceReference: 'reused transfer',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_EXTERNAL_TRANSACTION' });
  });
  it('keeps all methods unavailable, with no merchant surcharge and unresolved provider/tax/payable facts', async () => {
    expect(checkoutPaymentReadiness()).toHaveLength(3);
    for (const r of checkoutPaymentReadiness())
      expect(r).toMatchObject({
        eligible: false,
        merchantAddedFee: '0.0000',
        providerSenderFee: null,
        tax: null,
        payable: null,
        purchaseAvailable: false,
      });
    expect(checkoutPaymentReadiness()[2]!.blockers).toContain('NAGAD_ACCOUNT_TYPE_UNVERIFIED');
    await expect(
      prepareCheckoutPaymentObligationInTransaction(db(), {
        organizationId: key(),
        orderId: key(),
        quoteId: key(),
        quoteFingerprint: 'x',
        expectedRootRevision: '1',
        method: 'COD',
      }),
    ).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
  });
  it('versions independent destination approval, suspends it and preserves immutable history', async () => {
    const f = await manualPaymentFixture(db()),
      d = await createReceivingDestination(db(), destination(f));
    await expect(
      changeReceivingDestination(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        id: d.id,
        expectedRevision: d.revision,
        action: 'APPROVE',
        reason: 'Synthetic owner self-approval',
        providerEvidenceReference: 'synthetic',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const a = await changeReceivingDestination(db(), {
      organizationId: f.organizationId,
      actorId: f.reviewer,
      id: d.id,
      expectedRevision: d.revision,
      action: 'APPROVE',
      reason: 'Synthetic independent check',
      providerEvidenceReference: 'synthetic-onboarding-and-workflow-evidence',
    });
    expect(a).toMatchObject({ state: 'APPROVED', revision: '2', approvedBy: f.reviewer });
    const suspended = await changeReceivingDestination(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      id: d.id,
      expectedRevision: '2',
      action: 'SUSPEND',
      reason: 'Suspected compromise',
    });
    expect(suspended.state).toBe('SUSPENDED');
    await expect(
      changeReceivingDestination(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        id: d.id,
        expectedRevision: '2',
        action: 'RETIRE',
        reason: 'Old version',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      sql`delete from payments.receiving_destination_history where destination_id=${d.id}`.execute(
        db(),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await listReceivingDestinations(db(), {
          organizationId: f.organizationId,
          actorId: f.reviewer,
        })
      ).items,
    ).toHaveLength(1);
  });
  it('blocks Nagad approval, unsupported transfer actions, scoped permissions and foreign destinations', async () => {
    const f = await manualPaymentFixture(db()),
      d = await createReceivingDestination(db(), destination(f, 'NAGAD'));
    await expect(
      changeReceivingDestination(db(), {
        organizationId: f.organizationId,
        actorId: f.reviewer,
        id: d.id,
        expectedRevision: d.revision,
        action: 'APPROVE',
        reason: 'Synthetic',
        providerEvidenceReference: 'synthetic',
      }),
    ).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
    await expect(
      createReceivingDestination(db(), {
        ...destination(f),
        transferAction: 'SEND_MONEY' as never,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createReceivingDestination(db(), { ...destination(f), actorId: f.viewer }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const other = await manualPaymentFixture(db());
    await expect(
      changeReceivingDestination(db(), {
        organizationId: other.organizationId,
        actorId: other.owner,
        id: d.id,
        expectedRevision: '1',
        action: 'SUSPEND',
        reason: 'foreign',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('persists duplicate untrusted claims and reviews without creating money or extending deadlines', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order();
    await submitManualPayment(db(), {
      organizationId: f.organizationId,
      orderId: c.orderId,
      customerReference: c.evidence.transactionId,
      idempotencyKey: key(),
    });
    await reviewManualClaim(db(), {
      organizationId: f.organizationId,
      actorId: f.reviewer,
      attemptId: c.attemptId,
      state: 'UNDER_REVIEW',
      note: 'Independent history check pending',
    });
    expect(
      (
        await listManualClaimQueue(db(), {
          organizationId: f.organizationId,
          actorId: f.reviewer,
          pageSize: 1,
        })
      ).pagination.totalItems,
    ).toBe(2);
    const n = (
      await sql<{
        n: string;
      }>`select count(*)::text n from payments.payments where organization_id=${f.organizationId}`.execute(
        db(),
      )
    ).rows[0]!;
    expect(n.n).toBe('0');
  });
  it('requires independent exact reference, destination, currency, value time and authorization', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order();
    const input = {
      organizationId: f.organizationId,
      actorId: f.reviewer,
      attemptId: c.attemptId,
      confirmedAmount: '100.0000',
      idempotencyKey: key(),
    };
    await expect(verifyManualPayment(db(), input)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    for (const evidence of [
      { ...c.evidence, transactionId: 'OTHER-REFERENCE' },
      { ...c.evidence, receivingNumber: '01800000000' },
      { ...c.evidence, valueTime: '2099-01-01T00:00:00Z' },
      { ...c.evidence, currency: 'USD' as never },
    ])
      await expect(verifyManualPayment(db(), { ...input, evidence })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    await expect(
      verifyManualPayment(db(), { ...input, actorId: f.viewer, evidence: c.evidence }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('atomically records partial then excess funds, caps allocation, posts actual cash and replays the same intent', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order();
    const p = await approve(f, c, '40.0000');
    expect(await getVerifiedReceipt(db(), f.organizationId, p.id)).toMatchObject({
      received: '40.0000',
      allocated: '40.0000',
      unallocated: '0.0000',
    });
    const summary = () =>
      getOrderPaymentSummary(db(), {
        organizationId: f.organizationId,
        orderId: c.orderId,
        paymentMethod: 'BKASH_MANUAL',
        expectedAmount: '100.0000',
      });
    expect(await summary()).toMatchObject({ status: 'PARTIALLY_PAID', outstanding: '60.0000' });
    const ref = `SYN-${key()}`,
      a = await submitManualPayment(db(), {
        organizationId: f.organizationId,
        orderId: c.orderId,
        customerReference: ref,
        idempotencyKey: key(),
      });
    const second = { ...c, attemptId: a.id, evidence: { ...c.evidence, transactionId: ref } },
      k = key();
    const excess = await approve(f, second, '80.0000', k);
    expect((await approve(f, second, '80.0000', k)).id).toBe(excess.id);
    expect(await getVerifiedReceipt(db(), f.organizationId, excess.id)).toMatchObject({
      allocated: '60.0000',
      unallocated: '20.0000',
      disposition: 'EXCESS_LIABILITY',
    });
    expect(await summary()).toMatchObject({ status: 'PAID', outstanding: '0.0000' });
    const cash = (
      await sql<{
        cash: string;
      }>`select sum(amount_delta)::text cash from finance.financial_account_entries where organization_id=${f.organizationId}`.execute(
        db(),
      )
    ).rows[0]!;
    expect(Number(cash.cash)).toBe(120);
    const refund = await createRefund(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      paymentId: excess.id,
      amount: '20',
      reasonCode: 'EXCESS_RETURN',
      idempotencyKey: key(),
    });
    await expect(
      completeManualRefund(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        refundId: refund.id,
        externalReference: 'SYN-REFUND',
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
    await completeManualRefund(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      refundId: refund.id,
      externalReference: 'SYN-REFUND',
      idempotencyKey: key(),
      originalSourceVerified: true,
      evidenceReference: 'synthetic-verified-original-source-transfer',
    });
    expect(await summary()).toMatchObject({ status: 'PAID', refunded: '0.0000' });

    await expect(approve(f, second, '81.0000', k)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
  it('serializes concurrent reviewers and permanently fences receipt reuse even after reversal', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order();
    const results = await Promise.allSettled([approve(f, c), approve(f, c)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(
      new Set(results.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id)).size,
    ).toBe(1);
    const p = (
      results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof approve>>
      >
    ).value;
    await expect(
      reverseManualReceipt(db(), {
        organizationId: f.organizationId,
        actorId: f.reviewer,
        paymentId: p.id,
        reason: 'Provider reversal',
        evidenceReference: 'statement',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await reverseManualReceipt(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      paymentId: p.id,
      reason: 'Provider reversal',
      evidenceReference: 'independent statement reversal',
    });
    const second = await f.order(c.evidence.transactionId);
    await expect(approve(f, second)).rejects.toMatchObject({
      code: 'DUPLICATE_EXTERNAL_TRANSACTION',
    });
    const cash = (
      await sql<{
        cash: string;
      }>`select sum(amount_delta)::text cash from finance.financial_account_entries where organization_id=${f.organizationId}`.execute(
        db(),
      )
    ).rows[0]!;
    expect(Number(cash.cash)).toBe(0);
  });
  it('concurrently verifies one external transfer claimed against different Orders exactly once', async () => {
    const f = await manualPaymentFixture(db()),
      ref = `SYN-${key()}`,
      a = await f.order(ref),
      b = await f.order(ref);
    const r = await Promise.allSettled([approve(f, a), approve(f, b)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason.code).toBe(
      'DUPLICATE_EXTERNAL_TRANSACTION',
    );
  });
  it('retains cancelled-order receipts as unallocated liabilities without resurrecting Orders', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order();
    await sql`update orders.orders set order_status='CANCELLED' where id=${c.orderId}`.execute(
      db(),
    );
    await sql`update payments.payment_intents set status='CANCELLED' where id=${c.intentId}`.execute(
      db(),
    );
    const p = await approve(f, c);
    expect(await getVerifiedReceipt(db(), f.organizationId, p.id)).toMatchObject({
      allocated: '0.0000',
      unallocated: '100.0000',
      disposition: 'LATE_RECEIPT_LIABILITY',
    });
    expect((await getPayment(db(), f.organizationId, p.id)).orderId).toBe(c.orderId);
    expect((await listPayments(db(), f.organizationId)).items).toHaveLength(1);
    const refund = await createRefund(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      paymentId: p.id,
      amount: '100.0000',
      reasonCode: 'LATE_RECEIPT',
      idempotencyKey: key(),
    });
    expect(refund.amount).toBe('100.0000');
  });
  it('rolls back receipt, allocation, Finance, audit and outbox on a verification fault', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order(),
      k = key();
    await expect(
      verifyManualPayment(db(), {
        organizationId: f.organizationId,
        actorId: f.reviewer,
        attemptId: c.attemptId,
        confirmedAmount: '100',
        idempotencyKey: k,
        evidence: c.evidence,
        fault: () => {
          throw new Error('synthetic atomic failure');
        },
      }),
    ).rejects.toThrow('synthetic atomic failure');
    const n = (
      await sql<{
        n: string;
      }>`select count(*)::text n from finance.financial_account_entries where organization_id=${f.organizationId}`.execute(
        db(),
      )
    ).rows[0]!;
    expect(n.n).toBe('0');
    expect((await approve(f, c, '100', k)).amount).toBe('100.0000');
  });
  it('honors approved absolute review deadlines and expires fake claims through Orders semantics', async () => {
    const f = await manualPaymentFixture(db());
    const proposal = await proposePaymentOperatingPolicy(db(), {
      organizationId: f.organizationId,
      actorId: f.owner,
      submissionMinutes: 60,
      reviewMinutes: 30,
    });
    await expect(
      approvePaymentOperatingPolicy(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        proposalId: proposal.id,
        approvalReference: 'self approval',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const policy = await approvePaymentOperatingPolicy(db(), {
      organizationId: f.organizationId,
      actorId: f.reviewer,
      proposalId: proposal.id,
      approvalReference: 'Synthetic approved staffing and deadlines',
    });
    const c = await f.order(undefined, policy.id);
    await sql`update payments.payment_intents set expires_at=now()-interval '2 hours',review_expires_at=now()-interval '1 minute' where id=${c.intentId}`.execute(
      db(),
    );
    expect(await processPaymentReviewAging(db())).toBe(1);
    expect(await processPaymentReviewAging(db())).toBe(0);
    expect(await processExpiredPaymentOrders(db())).toBe(1);
    expect(
      (await listManualClaimQueue(db(), { organizationId: f.organizationId, actorId: f.reviewer }))
        .items[0]!.overdue,
    ).toBe(true);
    const p = await approve(f, c);
    expect((await getVerifiedReceipt(db(), f.organizationId, p.id)).disposition).toBe(
      'LATE_RECEIPT_LIABILITY',
    );
  });
  it('serializes review with cancellation without losing received funds', async () => {
    const f = await manualPaymentFixture(db()),
      c = await f.order();
    const r = await Promise.allSettled([
      approve(f, c),
      cancelOrder(db(), {
        organizationId: f.organizationId,
        actorId: f.owner,
        orderId: c.orderId,
        expectedVersion: 1,
        reasonCode: 'CUSTOMER_CANCELLED',
        idempotencyKey: key(),
      }),
    ]);
    expect(r.every((x) => x.status === 'fulfilled')).toBe(true);
    const p = (r[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof approve>>>).value;
    expect((await getVerifiedReceipt(db(), f.organizationId, p.id)).received).toBe('100.0000');
  });
});

describe('Phase 04A populated forward migration', () => {
  it('preserves legacy duplicate/reversed references and creates permanent collision fences', async () => {
    const upgrade = await isolatedCartDatabase();
    try {
      const d = upgrade.database.db;
      const result = await new Migrator({ db: d, provider: migrationProvider }).migrateTo(
        '3221_checkout_quotes',
      );
      if (result.error) throw result.error;
      const f = await manualPaymentFixture(d);
      const method = (
        await sql<{
          id: string;
        }>`select id from payments.payment_methods where organization_id=${f.organizationId} and code='BKASH_MANUAL'`.execute(
          d,
        )
      ).rows[0]!;
      const order = (
        await sql<{
          id: string;
        }>`insert into orders.orders(organization_id,order_number,payment_method,currency_code,subtotal_amount,discount_amount,total_amount)
        values(${f.organizationId},${key()},'BKASH_MANUAL','BDT',100,0,100) returning id`.execute(d)
      ).rows[0]!;
      const intent = (
        await sql<{
          id: string;
        }>`insert into payments.payment_intents(organization_id,order_id,order_number_snapshot,payment_method_id,currency_code,expected_amount,status)
        values(${f.organizationId},${order.id},'SYNTHETIC-LEGACY',${method.id},'BDT',100,'READY') returning id`.execute(
          d,
        )
      ).rows[0]!;
      const attempts: string[] = [];
      for (let n = 0; n < 3; n++)
        attempts.push(
          (
            await sql<{
              id: string;
            }>`insert into payments.payment_attempts(organization_id,payment_intent_id,customer_reference,normalized_reference)
        values(${f.organizationId},${intent.id},'OLD-REF','OLD-REF') returning id`.execute(d)
          ).rows[0]!.id,
        );
      for (const status of ['REVERSED', 'CONFIRMED'])
        await sql`insert into payments.payments(organization_id,payment_number,payment_method_id,currency_code,
        amount,external_reference,normalized_external_reference,status,source_attempt_id) values(${f.organizationId},${key()},${method.id},'BDT',100,'OLD-REF','OLD-REF',${status},${attempts[status === 'REVERSED' ? 0 : 1]})`.execute(
          d,
        );
      expect((await runMigrations(d)).executed).toEqual([
        '3222_manual_payment_integrity',
        '3223_checkout_placement',
      ]);
      expect(
        (
          await sql<{
            n: number;
          }>`select historical_count n from payments.receipt_reference_fences where organization_id=${f.organizationId}`.execute(
            d,
          )
        ).rows[0]!.n,
      ).toBe(2);
      expect(
        (
          await sql<{
            n: string;
          }>`select count(*)::text n from payments.payments where organization_id=${f.organizationId}`.execute(
            d,
          )
        ).rows[0]!.n,
      ).toBe('2');
      await expect(
        sql`insert into payments.payments(organization_id,payment_number,payment_method_id,currency_code,amount,external_reference,normalized_external_reference,source_attempt_id)
        values(${f.organizationId},${key()},${method.id},'BDT',100,'OLD-REF','OLD-REF',${attempts[2]})`.execute(
          d,
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await upgrade.close();
    }
  }, 30000);
});
