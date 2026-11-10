import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  CheckoutCommittedOrderDto,
  CheckoutFinalTermsDto,
  CheckoutPlacementMethod,
} from '@maevelle/contracts';
import { placementApi, type PlacementIntent } from './placement-api';
import { PlacementConfirmation } from './components/placement-confirmation';
import { PlacementPanel } from './components/placement-panel';
import { EMPTY_REVIEW } from './foundation-types';
import { formatExactMoney } from '@/lib/format/exact-money';

vi.mock('./foundation-runtime', () => ({
  reviewActions: { placement: () => ({ status: vi.fn(), retry: vi.fn() }) },
}));
afterEach(() => vi.unstubAllGlobals());
const id = () => crypto.randomUUID();
const signal = new AbortController().signal;
const terms = (method: CheckoutPlacementMethod = 'COD'): CheckoutFinalTermsDto => ({
  quoteId: id(),
  quoteFingerprint: 'a'.repeat(43),
  revision: '9007199254740993',
  method,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  fingerprint: 'b'.repeat(43),
  currency: 'BDT',
  merchandiseSubtotal: '100.0000',
  discountTotal: '0.0000',
  shipping: '0.0000',
  tax: '0.0000',
  taxTreatment: 'Fixture only',
  paymentFees: '0.0000',
  merchantWalletSurcharge: '0.0000',
  roundingAdjustment: '0.0000',
  payable: '100.0000',
});
function order(
  final: CheckoutFinalTermsDto,
  paymentStatus = 'UNPAID',
  status: CheckoutCommittedOrderDto['status'] = 'PENDING',
): CheckoutCommittedOrderDto {
  return {
    receipt: { orderId: id(), orderNumber: 'ORD-2026-001', terms: final },
    status,
    payment: { status: paymentStatus, outstanding: '60.0000' },
  };
}
function fixture() {
  const final = terms(),
    owner = { kind: 'GUEST' as const, context: id() },
    draftId = id();
  const { revision, quoteId, quoteFingerprint, method } = final;
  const accepted = {
    revision,
    quoteId,
    quoteFingerprint,
    method,
    finalTermsFingerprint: final.fingerprint,
  };
  const intent: PlacementIntent = {
    draftId,
    owner,
    key: id(),
    accepted,
    body: JSON.stringify(accepted),
  };
  const request = vi.fn<(path: string, init: RequestInit) => Promise<Response>>();
  vi.stubGlobal('fetch', request);
  const reply = (data: unknown, status = 200) =>
    request.mockResolvedValueOnce(new Response(JSON.stringify(data), { status }));
  return {
    final,
    owner,
    draftId,
    accepted,
    intent,
    reply,
    request,
    review: { revision, quoteId, quoteFingerprint, method },
  };
}
describe('Phase 05A placement protocol and confirmation UI', () => {
  it('sends exact minimal private JSON and accepts only the specific 409 data result', async () => {
    const f = fixture();
    f.reply({ data: f.final });
    expect(await placementApi.finalTerms(f.draftId, f.owner, f.review, signal)).toEqual(f.final);
    expect(f.request.mock.calls[0]).toMatchObject([
      `/api/storefront/v1/checkouts/${f.draftId}/final-terms`,
      {
        cache: 'no-store',
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify(f.review),
        headers: { 'x-checkout-context': f.owner.context, 'content-type': 'application/json' },
      },
    ]);
    f.reply({ data: { kind: 'REVIEW_REQUIRED', reason: 'SOURCE_CHANGED' } }, 409);
    expect(await placementApi.place(f.intent, signal)).toEqual({
      kind: 'REVIEW_REQUIRED',
      reason: 'SOURCE_CHANGED',
    });
    expect(f.request.mock.calls[1]![1]).toMatchObject({
      body: f.intent.body,
      headers: { 'idempotency-key': f.intent.key },
    });
    f.reply({ error: { code: 'IDEMPOTENCY_CONFLICT' } }, 409);
    await expect(placementApi.place(f.intent, signal)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
    });
    f.reply({ data: { kind: 'COMMITTED', receipt: order(f.final).receipt } }, 409);
    await expect(placementApi.place(f.intent, signal)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects mismatched terms and committed receipts, and does not retain extra fields', async () => {
    const f = fixture();
    f.reply({ data: { ...f.final, method: 'NAGAD_MANUAL' } });
    await expect(
      placementApi.finalTerms(f.draftId, f.owner, f.review, signal),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    f.reply({
      data: {
        kind: 'COMMITTED',
        receipt: order({ ...f.final, fingerprint: 'x'.repeat(43) }).receipt,
      },
    });
    await expect(placementApi.place(f.intent, signal)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    const actual = order(f.final);
    f.reply({
      data: { ...actual, receipt: { ...actual.receipt, guestToken: 'must-not-be-retained' } },
    });
    const account = { kind: 'ACCOUNT' as const, partition: 'p'.repeat(43) };
    expect(await placementApi.status(f.draftId, account, signal)).toEqual(actual);
    expect(f.request.mock.calls[2]).toMatchObject([
      `/api/storefront/v1/checkouts/${f.draftId}/placement`,
      {
        cache: 'no-store',
        credentials: 'include',
        headers: { 'x-shopper-partition': account.partition },
      },
    ]);
    f.reply({ error: { code: 'NOT_FOUND' } }, 404);
    await expect(placementApi.status(f.draftId, f.owner, signal)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('shows the blocked review without a place-order button, total due or transfer controls', () => {
    const markup = renderToStaticMarkup(
      <PlacementPanel review={EMPTY_REVIEW} clock={Date.now()} />,
    );
    expect(markup).toContain('No payment is due');
    expect(markup).not.toMatch(/Place order|Final payable|Transaction ID|receiving number/);
  });

  it.each([
    ['COD', 'UNPAID', 'PENDING', 'Due on delivery', 'Unpaid'],
    [
      'BKASH_MANUAL',
      'PAYMENT_PENDING',
      'PENDING',
      'Reported outstanding balance',
      'Awaiting payment verification',
    ],
    [
      'NAGAD_MANUAL',
      'PARTIALLY_PAID',
      'CONFIRMED',
      'Reported outstanding balance',
      'Partially paid',
    ],
    [
      'BKASH_MANUAL',
      'EXPIRED',
      'PENDING',
      'Reported outstanding balance',
      'Payment window expired',
    ],
    ['COD', 'CANCELLED', 'CANCELLED', 'Reported outstanding balance', 'Payment cancelled'],
  ] as const)(
    'renders %s %s separately from the original order total',
    (method, payment, status, label, display) => {
      const live = order(terms(method), payment, status);
      const review = {
        ...EMPTY_REVIEW,
        placement: {
          ...EMPTY_REVIEW.placement,
          phase: 'committed' as const,
          receipt: live.receipt,
          status: live,
        },
      };
      const markup = renderToStaticMarkup(
        <PlacementConfirmation review={review} clock={Date.now()} />,
      );
      expect(markup).toContain('ORD-2026-001');
      expect(markup).toContain('Original order total');
      expect(markup).toContain('৳100');
      expect(markup).toContain('৳60');
      expect(markup).toContain(label);
      expect(markup).toContain(display);
      expect(markup).not.toMatch(/Transaction ID|Send money|receiving number/);
    },
  );

  it('formats signed rounding adjustments without discarding the four decimal places', () => {
    expect(formatExactMoney('-0.0001')).toBe('৳−0.0001');
    expect(formatExactMoney('9999999999999999.1234')).toMatch(/\.1234$/);
  });
});
