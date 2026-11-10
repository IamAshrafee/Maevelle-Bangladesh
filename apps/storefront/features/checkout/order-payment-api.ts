import type {
  CheckoutOrderPaymentDto,
  CheckoutPaymentClaimDto,
  CheckoutWalletAvailability,
  CheckoutWalletInstructionsDto,
  OrderStatusDto,
  OrderPaymentStatusDto,
  SubmitCheckoutPaymentClaimDto,
} from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { ownerHeaders } from './foundation-api';
import type { ReviewOwner } from './foundation-types';
import { checkoutPlacementMethods } from './placement-labels';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moneyRegex = /^\d{1,16}\.\d{4}$/;
const orderNumberRegex = /^[A-Za-z0-9-]{1,64}$/;
const phoneRegex = /^01[3-9][0-9]{8}$/;
const trxIdRegex = /^[A-Za-z0-9-]{4,128}$/;

const orderStatuses: readonly OrderStatusDto[] = [
  'PENDING',
  'CONFIRMED',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
];

const paymentStatuses: readonly OrderPaymentStatusDto[] = [
  'UNPAID',
  'PAYMENT_PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'EXPIRED',
  'CANCELLED',
];

const obligationStatuses = ['READY', 'SATISFIED', 'EXPIRED', 'CANCELLED'] as const;

const walletAvailabilities: readonly CheckoutWalletAvailability[] = [
  'AVAILABLE',
  'COD',
  'POLICY_BLOCKED',
  'PAYMENT_METHOD_UNAVAILABLE',
  'DESTINATION_UNAVAILABLE',
  'PAYMENT_WINDOW_EXPIRED',
  'ORDER_CANCELLED',
  'PAYMENT_ALREADY_SETTLED',
  'PAYMENT_SUPPORT_REQUIRED',
  'CLAIM_UNDER_REVIEW',
];

const claimStatuses = ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'] as const;
const reviewStates = [
  'PENDING',
  'UNDER_REVIEW',
  'CORRECTION_REQUESTED',
  'ESCALATED',
  'RESOLVED',
] as const;

function invalid(message = 'Payment returned an unexpected response.'): never {
  throw new StorefrontClientApiError(502, 'INVALID_RESPONSE', message);
}

function matches(value: unknown, re: RegExp): value is string {
  return typeof value === 'string' && re.test(value);
}

function isValidClaim(value: unknown): value is CheckoutPaymentClaimDto {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    matches(c.id, uuidRegex) &&
    typeof c.submittedAt === 'string' &&
    Number.isFinite(Date.parse(c.submittedAt)) &&
    claimStatuses.includes(c.status as (typeof claimStatuses)[number]) &&
    reviewStates.includes(c.reviewState as (typeof reviewStates)[number])
  );
}

function sanitizeClaim(value: unknown): CheckoutPaymentClaimDto {
  if (!isValidClaim(value)) invalid();
  return {
    id: value.id,
    submittedAt: value.submittedAt,
    status: value.status,
    reviewState: value.reviewState,
  };
}

function sanitizeInstructions(value: unknown): CheckoutWalletInstructionsDto | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') invalid();
  const i = value as Record<string, unknown>;
  if (
    (i.provider !== 'BKASH' && i.provider !== 'NAGAD') ||
    i.accountType !== 'PERSONAL_RETAIL_ACCOUNT' ||
    i.transferAction !== 'MERCHANT_PAYMENT' ||
    typeof i.accountNumber !== 'string' ||
    !i.accountNumber.trim() ||
    typeof i.accountName !== 'string' ||
    typeof i.text !== 'string'
  ) {
    invalid();
  }
  return {
    provider: i.provider,
    accountType: i.accountType,
    transferAction: i.transferAction,
    accountNumber: i.accountNumber,
    accountName: i.accountName,
    text: i.text,
  };
}

function sanitizePayment(value: unknown): CheckoutOrderPaymentDto {
  if (!value || typeof value !== 'object') invalid();
  const p = value as Record<string, unknown>;

  if (
    !matches(p.orderId, uuidRegex) ||
    !matches(p.orderNumber, orderNumberRegex) ||
    !orderStatuses.includes(p.orderStatus as OrderStatusDto) ||
    !checkoutPlacementMethods.includes(p.method as (typeof checkoutPlacementMethods)[number]) ||
    p.currency !== 'BDT' ||
    !matches(p.originalPayable, moneyRegex) ||
    !matches(p.outstanding, moneyRegex) ||
    !matches(p.allocated, moneyRegex) ||
    !matches(p.refundedFromAllocation, moneyRegex) ||
    !matches(p.verifiedWalletReceipts, moneyRegex) ||
    !matches(p.unallocatedAtVerification, moneyRegex) ||
    typeof p.hasLateReceipt !== 'boolean' ||
    typeof p.hasReceiptReversal !== 'boolean' ||
    !Array.isArray(p.refundStates) ||
    p.refundStates.some((s) => typeof s !== 'string') ||
    !paymentStatuses.includes(p.paymentStatus as OrderPaymentStatusDto) ||
    !obligationStatuses.includes(p.obligationStatus as (typeof obligationStatuses)[number]) ||
    (p.submissionDeadline !== null &&
      (typeof p.submissionDeadline !== 'string' ||
        !Number.isFinite(Date.parse(p.submissionDeadline)))) ||
    (p.reviewDeadline !== null &&
      (typeof p.reviewDeadline !== 'string' || !Number.isFinite(Date.parse(p.reviewDeadline)))) ||
    !walletAvailabilities.includes(p.transferAvailability as CheckoutWalletAvailability) ||
    !walletAvailabilities.includes(p.claimAvailability as unknown as CheckoutWalletAvailability) ||
    p.claimAvailability === 'CLAIM_UNDER_REVIEW' ||
    !Array.isArray(p.openClaims) ||
    !p.openClaims.every(isValidClaim) ||
    (p.latestClaim !== null && !isValidClaim(p.latestClaim))
  ) {
    invalid();
  }

  const instructions = sanitizeInstructions(p.instructions);

  return {
    orderId: p.orderId,
    orderNumber: p.orderNumber,
    orderStatus: p.orderStatus as OrderStatusDto,
    method: p.method as (typeof checkoutPlacementMethods)[number],
    currency: 'BDT',
    originalPayable: p.originalPayable,
    outstanding: p.outstanding,
    allocated: p.allocated,
    refundedFromAllocation: p.refundedFromAllocation,
    verifiedWalletReceipts: p.verifiedWalletReceipts,
    unallocatedAtVerification: p.unallocatedAtVerification,
    hasLateReceipt: p.hasLateReceipt,
    hasReceiptReversal: p.hasReceiptReversal,
    refundStates: Object.freeze([...(p.refundStates as string[])]),
    paymentStatus: p.paymentStatus as OrderPaymentStatusDto,
    obligationStatus: p.obligationStatus as (typeof obligationStatuses)[number],
    submissionDeadline: p.submissionDeadline as string | null,
    reviewDeadline: p.reviewDeadline as string | null,
    transferAvailability: p.transferAvailability as CheckoutWalletAvailability,
    claimAvailability: p.claimAvailability as Exclude<
      CheckoutWalletAvailability,
      'CLAIM_UNDER_REVIEW'
    >,
    instructions,
    latestClaim: p.latestClaim ? sanitizeClaim(p.latestClaim) : null,
    openClaims: Object.freeze((p.openClaims as unknown[]).map(sanitizeClaim)),
  };
}

const basePath = (id: string) =>
  `/api/storefront/v1/checkouts/${encodeURIComponent(id)}/order-payment`;

export const orderPaymentApi = {
  async getPayment(
    id: string,
    owner: ReviewOwner,
    signal: AbortSignal,
  ): Promise<CheckoutOrderPaymentDto> {
    const value = await requestWithDeadline<CheckoutOrderPaymentDto>(basePath(id), {
      signal,
      cache: 'no-store',
      headers: ownerHeaders(owner),
    });
    return sanitizePayment(value);
  },

  async submitClaim(
    id: string,
    owner: ReviewOwner,
    input: SubmitCheckoutPaymentClaimDto,
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<CheckoutPaymentClaimDto> {
    if (!matches(idempotencyKey, uuidRegex)) {
      throw new StorefrontClientApiError(400, 'INVALID_REQUEST', 'Idempotency key must be a UUID.');
    }
    const trimmedTrx = input.transactionId.trim();
    if (!matches(trimmedTrx, trxIdRegex)) {
      throw new StorefrontClientApiError(
        400,
        'INVALID_REQUEST',
        'Transaction ID must be 4 to 128 ASCII letters, numbers, or hyphens.',
      );
    }
    if (input.sendingMobile !== undefined && !matches(input.sendingMobile, phoneRegex)) {
      throw new StorefrontClientApiError(
        400,
        'INVALID_REQUEST',
        'Sending mobile must be in Bangladesh format (e.g. 01712345678).',
      );
    }

    const payload: SubmitCheckoutPaymentClaimDto = {
      transactionId: trimmedTrx,
      ...(input.sendingMobile ? { sendingMobile: input.sendingMobile } : {}),
    };

    const value = await requestWithDeadline<CheckoutPaymentClaimDto>(`${basePath(id)}/claims`, {
      signal,
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...ownerHeaders(owner),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    return sanitizeClaim(value);
  },

  async recoverClaim(
    id: string,
    owner: ReviewOwner,
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<CheckoutPaymentClaimDto> {
    if (!matches(idempotencyKey, uuidRegex)) {
      throw new StorefrontClientApiError(400, 'INVALID_REQUEST', 'Idempotency key must be a UUID.');
    }
    const value = await requestWithDeadline<CheckoutPaymentClaimDto>(`${basePath(id)}/claims`, {
      signal,
      cache: 'no-store',
      headers: {
        ...ownerHeaders(owner),
        'idempotency-key': idempotencyKey,
      },
    });
    return sanitizeClaim(value);
  },
};
