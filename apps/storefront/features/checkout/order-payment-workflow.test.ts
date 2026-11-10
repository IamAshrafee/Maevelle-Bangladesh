import { describe, expect, it, vi } from 'vitest';
import type {
  CheckoutDraftDto,
  CheckoutOrderPaymentDto,
  CheckoutPaymentClaimDto,
} from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { createOrderPaymentWorkflow } from './order-payment-workflow';
import { EMPTY_ORDER_PAYMENT, type OrderPaymentProjection } from './order-payment-types';
import { EMPTY_REVIEW, type ReviewOwner, type ReviewSnapshot } from './foundation-types';
import type { QuoteScope } from './quote-types';

const id = () => crypto.randomUUID();

const sampleClaim: CheckoutPaymentClaimDto = {
  id: id(),
  submittedAt: new Date().toISOString(),
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
  instructions: {
    provider: 'BKASH',
    accountType: 'PERSONAL_RETAIL_ACCOUNT',
    transferAction: 'MERCHANT_PAYMENT',
    accountNumber: '01700000000',
    accountName: 'Maevelle BD',
    text: 'Follow steps',
  },
  latestClaim: null,
  openClaims: [],
};

function setup(initialDraftStatus: CheckoutDraftDto['status'] = 'COMMITTED') {
  const draftId = id();
  let clock = 1000000;
  const owner: ReviewOwner = { kind: 'GUEST', context: id() };

  let state: ReviewSnapshot = {
    ...EMPTY_REVIEW,
    phase: 'ready',
    draft: {
      id: draftId,
      status: initialDraftStatus,
      ownerKind: 'GUEST',
      revision: '1',
      expiresAt: new Date(clock + 3600000).toISOString(),
      implementationVersion: 2,
      purchaseAvailable: false,
      currency: 'BDT',
      source: { kind: 'BUY_NOW' },
      sourceReviewRequired: false,
      lines: [{ id: id(), variantId: id(), quantity: '1', sourceCartLineId: null }],
    },
    orderPayment: { ...EMPTY_ORDER_PAYMENT },
  };

  const publishPatches: Array<Partial<OrderPaymentProjection>> = [];
  function publish(patch: Partial<OrderPaymentProjection>) {
    publishPatches.push(patch);
    state = {
      ...state,
      orderPayment: { ...state.orderPayment, ...patch },
    };
  }

  let viewRevoked = false;
  const scope: QuoteScope = {
    draft: state.draft!,
    owner,
    signal: new AbortController().signal,
    current: () => !viewRevoked,
    verify: vi.fn(async () => undefined),
    revokeView: vi.fn(() => {
      viewRevoked = true;
    }),
    restoreDraft: vi.fn(async () => state.draft!),
  };

  const mockApi = {
    getPayment: vi.fn(async () => samplePayment),
    submitClaim: vi.fn(async () => sampleClaim),
    recoverClaim: vi.fn(async () => sampleClaim),
  };

  const generatedUuids = [id(), id(), id(), id(), id()];
  let uuidIndex = 0;

  const workflow = createOrderPaymentWorkflow({
    api: mockApi,
    get: () => state,
    publish,
    run: async (action) => action(scope),
    now: () => clock,
    uuid: () => generatedUuids[uuidIndex++] ?? id(),
  });

  return {
    draftId,
    owner,
    scope,
    mockApi,
    workflow,
    getState: () => state,
    getPatches: () => publishPatches,
    advanceTime: (ms: number) => {
      clock += ms;
    },
  };
}

describe('Phase 06B order-payment workflow', () => {
  it('reads order payment and transitions to ready state', async () => {
    const s = setup();
    await s.workflow.read();

    expect(s.mockApi.getPayment).toHaveBeenCalledWith(s.draftId, s.owner, expect.anything());
    expect(s.scope.verify).toHaveBeenCalled();
    const state = s.getState().orderPayment;
    expect(state.phase).toBe('ready');
    expect(state.data).toEqual(samplePayment);
    expect(state.issue).toBeNull();
  });

  it('revokes view on unauthorized 401/403 during read', async () => {
    const s = setup();
    s.mockApi.getPayment.mockRejectedValueOnce(
      new StorefrontClientApiError(401, 'UNAUTHORIZED', 'Session expired.'),
    );

    await s.workflow.read();
    expect(s.scope.revokeView).toHaveBeenCalled();
  });

  it('sets non-retryable issue when guest order grant is expired (410)', async () => {
    const s = setup();
    s.mockApi.getPayment.mockRejectedValueOnce(
      new StorefrontClientApiError(410, 'ORDER_GRANT_EXPIRED', 'Grant expired.'),
    );

    await s.workflow.read();
    const state = s.getState().orderPayment;
    expect(state.phase).toBe('error');
    expect(state.issue).toMatchObject({
      code: 'ORDER_GRANT_EXPIRED',
      retryable: false,
    });
  });

  it('validates Transaction ID and phone before network dispatch in submit', async () => {
    const s = setup();

    // Empty Transaction ID
    await s.workflow.submit({ transactionId: '' });
    expect(s.mockApi.submitClaim).not.toHaveBeenCalled();
    expect(s.getState().orderPayment.issue).toMatchObject({
      code: 'INVALID_REQUEST',
    });

    // Too short Transaction ID
    await s.workflow.submit({ transactionId: 'ABC' });
    expect(s.mockApi.submitClaim).not.toHaveBeenCalled();

    // Invalid Bangladesh phone
    await s.workflow.submit({ transactionId: 'VALID-TRX', sendingMobile: '123456' });
    expect(s.mockApi.submitClaim).not.toHaveBeenCalled();
  });

  it('submits valid claim and refreshes order payment view on success', async () => {
    const s = setup();
    const updatedPayment: CheckoutOrderPaymentDto = {
      ...samplePayment,
      latestClaim: sampleClaim,
      openClaims: [sampleClaim],
      transferAvailability: 'CLAIM_UNDER_REVIEW',
    };
    s.mockApi.getPayment.mockResolvedValueOnce(updatedPayment);

    await s.workflow.submit({
      transactionId: '  BL9A2K9Z81  ',
      sendingMobile: '01712345678',
    });

    expect(s.mockApi.submitClaim).toHaveBeenCalledWith(
      s.draftId,
      s.owner,
      { transactionId: 'BL9A2K9Z81', sendingMobile: '01712345678' },
      expect.any(String),
      expect.anything(),
    );

    const state = s.getState().orderPayment;
    expect(state.phase).toBe('ready');
    expect(state.submittedClaim).toEqual(sampleClaim);
    expect(state.pendingClaim).toBeNull();
    expect(state.data?.transferAvailability).toBe('CLAIM_UNDER_REVIEW');
  });

  it('handles CLAIM_ALREADY_SUBMITTED by clearing intent and refreshing base view', async () => {
    const s = setup();
    s.mockApi.submitClaim.mockRejectedValueOnce(
      new StorefrontClientApiError(409, 'CLAIM_ALREADY_SUBMITTED', 'Already submitted.'),
    );

    await s.workflow.submit({ transactionId: 'BL9A2K9Z81' });

    const state = s.getState().orderPayment;
    expect(state.pendingClaim).toBeNull();
    expect(state.issue).toMatchObject({
      code: 'CLAIM_ALREADY_SUBMITTED',
      retryable: false,
    });
    // Verifies it triggered getPayment to show existing claim
    expect(s.mockApi.getPayment).toHaveBeenCalled();
  });

  it('handles IDEMPOTENCY_CONFLICT by clearing intent and refreshing view', async () => {
    const s = setup();
    s.mockApi.submitClaim.mockRejectedValueOnce(
      new StorefrontClientApiError(409, 'IDEMPOTENCY_CONFLICT', 'Conflict.'),
    );

    await s.workflow.submit({ transactionId: 'BL9A2K9Z81' });

    const state = s.getState().orderPayment;
    expect(state.pendingClaim).toBeNull();
    expect(state.issue).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      retryable: false,
    });
    expect(s.mockApi.getPayment).toHaveBeenCalled();
  });

  it('handles CLAIM_LIMIT_REACHED (5 unresolved claims) gracefully', async () => {
    const s = setup();
    s.mockApi.submitClaim.mockRejectedValueOnce(
      new StorefrontClientApiError(409, 'CLAIM_LIMIT_REACHED', 'Limit reached.'),
    );

    await s.workflow.submit({ transactionId: 'BL9A2K9Z81' });

    const state = s.getState().orderPayment;
    expect(state.pendingClaim).toBeNull();
    expect(state.issue).toMatchObject({
      code: 'CLAIM_LIMIT_REACHED',
      retryable: false,
    });
  });

  it('retains pendingClaim on ambiguous 503 or network failure so user can retry same key', async () => {
    const s = setup();
    s.mockApi.submitClaim.mockRejectedValueOnce(
      new StorefrontClientApiError(503, 'POLICY_BLOCKED', 'Service unavailable.'),
    );

    await s.workflow.submit({ transactionId: 'BL9A2K9Z81' });

    const state = s.getState().orderPayment;
    expect(state.phase).toBe('error');
    expect(state.pendingClaim).not.toBeNull();
    expect(state.pendingClaim?.body.transactionId).toBe('BL9A2K9Z81');
    expect(state.issue).toMatchObject({
      retryable: true,
    });

    // Now test retry() uses the exact same key!
    const originalKey = state.pendingClaim!.key;
    s.mockApi.submitClaim.mockResolvedValueOnce(sampleClaim);

    await s.workflow.retry();

    expect(s.mockApi.submitClaim).toHaveBeenLastCalledWith(
      s.draftId,
      s.owner,
      { transactionId: 'BL9A2K9Z81' },
      originalKey,
      expect.anything(),
    );
    expect(s.getState().orderPayment.pendingClaim).toBeNull();
  });

  it('recovers claim with original UUID key via GET', async () => {
    const s = setup();
    const recoveryKey = id();

    await s.workflow.recover(recoveryKey);

    expect(s.mockApi.recoverClaim).toHaveBeenCalledWith(
      s.draftId,
      s.owner,
      recoveryKey,
      expect.anything(),
    );
    const state = s.getState().orderPayment;
    expect(state.submittedClaim).toEqual(sampleClaim);
    expect(state.activeRecoveryKey).toBeNull();
  });

  it('handles recovery 404 gracefully by refreshing base view', async () => {
    const s = setup();
    const recoveryKey = id();
    s.mockApi.recoverClaim.mockRejectedValueOnce(
      new StorefrontClientApiError(404, 'NOT_FOUND', 'Not found yet.'),
    );

    await s.workflow.recover(recoveryKey);

    expect(s.mockApi.getPayment).toHaveBeenCalled();
    const state = s.getState().orderPayment;
    expect(state.activeRecoveryKey).toBeNull();
    expect(state.issue).toBeNull();
  });

  it('respects rate limit cooldown (Retry-After)', async () => {
    const s = setup();
    s.mockApi.submitClaim.mockRejectedValueOnce(
      new StorefrontClientApiError(429, 'RATE_LIMITED', 'Rate limited', 15),
    );

    await s.workflow.submit({ transactionId: 'BL9A2K9Z81' });

    const state = s.getState().orderPayment;
    expect(state.issue).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
      retryAt: 1000000 + 15000,
    });

    // Calling submit again immediately during cooldown should be blocked
    s.mockApi.submitClaim.mockClear();
    await s.workflow.submit({ transactionId: 'ANOTHER-TRX' });
    expect(s.mockApi.submitClaim).not.toHaveBeenCalled();

    // Advance past cooldown
    s.advanceTime(16000);
    s.mockApi.submitClaim.mockResolvedValueOnce(sampleClaim);
    await s.workflow.submit({ transactionId: 'BL9A2K9Z81' });
    expect(s.mockApi.submitClaim).toHaveBeenCalled();
  });
});
