import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CheckoutOrderPaymentDto,
  CheckoutPaymentClaimDto,
  CheckoutWalletInstructionsDto,
} from '@maevelle/contracts';
import { orderPaymentApi } from './order-payment-api';

afterEach(() => vi.unstubAllGlobals());

const id = () => crypto.randomUUID();
const signal = new AbortController().signal;

const sampleInstructions: CheckoutWalletInstructionsDto = {
  provider: 'BKASH',
  accountType: 'PERSONAL_RETAIL_ACCOUNT',
  transferAction: 'MERCHANT_PAYMENT',
  accountNumber: '01700000000',
  accountName: 'Maevelle BD Retail',
  text: '1. Open bKash app\n2. Select Make Payment\n3. Enter receiving number',
};

const sampleClaim: CheckoutPaymentClaimDto = {
  id: id(),
  submittedAt: new Date(Date.now() - 60000).toISOString(),
  status: 'PENDING_VERIFICATION',
  reviewState: 'PENDING',
};

const samplePayment: CheckoutOrderPaymentDto = {
  orderId: id(),
  orderNumber: 'ORD-2026-001',
  orderStatus: 'PENDING',
  method: 'BKASH_MANUAL',
  currency: 'BDT',
  originalPayable: '100.0000',
  outstanding: '60.0000',
  allocated: '40.0000',
  refundedFromAllocation: '0.0000',
  verifiedWalletReceipts: '40.0000',
  unallocatedAtVerification: '0.0000',
  hasLateReceipt: false,
  hasReceiptReversal: false,
  refundStates: [],
  paymentStatus: 'PARTIALLY_PAID',
  obligationStatus: 'READY',
  submissionDeadline: new Date(Date.now() + 3600000).toISOString(),
  reviewDeadline: new Date(Date.now() + 7200000).toISOString(),
  transferAvailability: 'AVAILABLE',
  claimAvailability: 'AVAILABLE',
  instructions: sampleInstructions,
  latestClaim: sampleClaim,
  openClaims: [sampleClaim],
};

function fixture() {
  const draftId = id();
  const owner = { kind: 'GUEST' as const, context: id() };
  const account = { kind: 'ACCOUNT' as const, partition: 'a'.repeat(43) };
  const request = vi.fn<(path: string, init: RequestInit) => Promise<Response>>();
  vi.stubGlobal('fetch', request);
  const reply = (data: unknown, status = 200, headers?: Record<string, string>) =>
    request.mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
    );
  return { draftId, owner, account, request, reply };
}

describe('Phase 06A/B order-payment API transport and contract validation', () => {
  it('reads authorized order-payment DTO with guest headers and parses valid data', async () => {
    const f = fixture();
    f.reply({ data: samplePayment });

    const result = await orderPaymentApi.getPayment(f.draftId, f.owner, signal);
    expect(result).toEqual(samplePayment);
    expect(f.request.mock.calls[0]).toMatchObject([
      `/api/storefront/v1/checkouts/${f.draftId}/order-payment`,
      {
        cache: 'no-store',
        credentials: 'include',
        headers: { 'x-checkout-context': f.owner.context },
      },
    ]);
  });

  it('reads authorized order-payment DTO with account headers', async () => {
    const f = fixture();
    f.reply({ data: samplePayment });

    const result = await orderPaymentApi.getPayment(f.draftId, f.account, signal);
    expect(result).toEqual(samplePayment);
    expect(f.request.mock.calls[0]![1]?.headers).toMatchObject({
      'x-shopper-partition': f.account.partition,
    });
  });

  it('rejects malformed response data in order-payment read', async () => {
    const f = fixture();
    // Invalid payable format
    f.reply({ data: { ...samplePayment, originalPayable: '100' } });
    await expect(orderPaymentApi.getPayment(f.draftId, f.owner, signal)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    // Invalid UUID
    f.reply({ data: { ...samplePayment, orderId: 'invalid-uuid' } });
    await expect(orderPaymentApi.getPayment(f.draftId, f.owner, signal)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });

    // Invalid currency
    f.reply({ data: { ...samplePayment, currency: 'USD' } });
    await expect(orderPaymentApi.getPayment(f.draftId, f.owner, signal)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('handles null instructions and null latestClaim safely', async () => {
    const f = fixture();
    const settledPayment: CheckoutOrderPaymentDto = {
      ...samplePayment,
      outstanding: '0.0000',
      allocated: '100.0000',
      paymentStatus: 'PAID',
      obligationStatus: 'SATISFIED',
      transferAvailability: 'PAYMENT_ALREADY_SETTLED',
      instructions: null,
      latestClaim: null,
      openClaims: [],
    };
    f.reply({ data: settledPayment });

    const result = await orderPaymentApi.getPayment(f.draftId, f.owner, signal);
    expect(result.instructions).toBeNull();
    expect(result.latestClaim).toBeNull();
    expect(result.openClaims).toEqual([]);
    expect(result.transferAvailability).toBe('PAYMENT_ALREADY_SETTLED');
  });

  it('submits a manual payment claim with UUID idempotency key, trimmed Transaction ID, and optional phone', async () => {
    const f = fixture();
    const key = id();
    f.reply({ data: sampleClaim });

    const result = await orderPaymentApi.submitClaim(
      f.draftId,
      f.owner,
      { transactionId: '  BL9A2K9Z81  ', sendingMobile: '01712345678' },
      key,
      signal,
    );

    expect(result).toEqual(sampleClaim);
    expect(f.request.mock.calls[0]).toMatchObject([
      `/api/storefront/v1/checkouts/${f.draftId}/order-payment/claims`,
      {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'x-checkout-context': f.owner.context,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({
          transactionId: 'BL9A2K9Z81',
          sendingMobile: '01712345678',
        }),
      },
    ]);
  });

  it('submits claim without optional sendingMobile when omitted', async () => {
    const f = fixture();
    const key = id();
    f.reply({ data: sampleClaim });

    await orderPaymentApi.submitClaim(
      f.draftId,
      f.owner,
      { transactionId: 'TRX-123456' },
      key,
      signal,
    );

    expect(f.request.mock.calls[0]![1]?.body).toBe(JSON.stringify({ transactionId: 'TRX-123456' }));
  });

  it('validates client input before sending claim request', async () => {
    const f = fixture();
    const key = id();

    // Invalid non-UUID idempotency key
    await expect(
      orderPaymentApi.submitClaim(
        f.draftId,
        f.owner,
        { transactionId: 'VALID-123' },
        'not-a-uuid',
        signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    // Too short Transaction ID (<4)
    await expect(
      orderPaymentApi.submitClaim(f.draftId, f.owner, { transactionId: 'AB' }, key, signal),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    // Invalid characters in Transaction ID
    await expect(
      orderPaymentApi.submitClaim(f.draftId, f.owner, { transactionId: 'TRX@#$%' }, key, signal),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    // Invalid phone format
    await expect(
      orderPaymentApi.submitClaim(
        f.draftId,
        f.owner,
        { transactionId: 'TRX-1234', sendingMobile: '12345' },
        key,
        signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    // Ensure no fetch was dispatched for invalid client inputs
    expect(f.request).not.toHaveBeenCalled();
  });

  it('recovers claim using GET with idempotency key', async () => {
    const f = fixture();
    const key = id();
    f.reply({ data: sampleClaim });

    const result = await orderPaymentApi.recoverClaim(f.draftId, f.owner, key, signal);
    expect(result).toEqual(sampleClaim);
    expect(f.request.mock.calls[0]).toMatchObject([
      `/api/storefront/v1/checkouts/${f.draftId}/order-payment/claims`,
      {
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'x-checkout-context': f.owner.context,
          'idempotency-key': key,
        },
      },
    ]);
  });

  it('propagates API error codes with Retry-After when rate limited', async () => {
    const f = fixture();
    const key = id();
    f.reply({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }, 429, {
      'retry-after': '30',
    });

    await expect(
      orderPaymentApi.submitClaim(f.draftId, f.owner, { transactionId: 'VALID-123' }, key, signal),
    ).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 30,
    });
  });

  it('propagates 409 CLAIM_ALREADY_SUBMITTED and IDEMPOTENCY_CONFLICT', async () => {
    const f = fixture();
    const key = id();

    f.reply({ error: { code: 'CLAIM_ALREADY_SUBMITTED', message: 'Already submitted.' } }, 409);
    await expect(
      orderPaymentApi.submitClaim(f.draftId, f.owner, { transactionId: 'VALID-123' }, key, signal),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CLAIM_ALREADY_SUBMITTED',
    });

    f.reply({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Payload conflict.' } }, 409);
    await expect(
      orderPaymentApi.submitClaim(f.draftId, f.owner, { transactionId: 'VALID-456' }, key, signal),
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
});
