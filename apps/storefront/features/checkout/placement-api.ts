import type {
  CheckoutCommittedOrderDto,
  CheckoutFinalTermsDto,
  CheckoutPlacementReceiptDto,
  CheckoutPlacementResultDto,
  PlaceCheckoutDto,
} from '@maevelle/contracts';
import { requestWithDeadline } from '@/lib/api/client/deadline';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { ownerHeaders } from './foundation-api';
import type { ReviewOwner } from './foundation-types';
import { checkoutPlacementMethods } from './placement-labels';

export type FinalTermsInput = Omit<PlaceCheckoutDto, 'finalTermsFingerprint'>;
export interface PlacementIntent {
  readonly draftId: string;
  readonly owner: ReviewOwner;
  readonly key: string;
  readonly body: string;
  readonly accepted: PlaceCheckoutDto;
}

const orderStates = ['PENDING', 'CONFIRMED', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const paymentStates = [
  'UNPAID',
  'PAYMENT_PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'EXPIRED',
  'CANCELLED',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = /^[A-Za-z0-9_-]{43}$/;
const money = /^\d{1,16}\.\d{4}$/;
const signed = /^-?\d{1,16}\.\d{4}$/;
const matches = (value: unknown, re: RegExp) => typeof value === 'string' && re.test(value);
function invalid(): never {
  throw new StorefrontClientApiError(
    502,
    'INVALID_RESPONSE',
    'Checkout returned an unexpected response.',
  );
}
export function sameTerms(value: CheckoutFinalTermsDto, input: FinalTermsInput) {
  return (
    value.quoteId === input.quoteId &&
    value.quoteFingerprint === input.quoteFingerprint &&
    value.revision === input.revision &&
    value.method === input.method
  );
}
function terms(value: CheckoutFinalTermsDto, expected?: FinalTermsInput): CheckoutFinalTermsDto {
  if (
    !value ||
    value.currency !== 'BDT' ||
    !checkoutPlacementMethods.includes(value.method) ||
    !matches(value.quoteId, uuid) ||
    !matches(value.quoteFingerprint, digest) ||
    !matches(value.fingerprint, digest) ||
    !matches(value.revision, /^[1-9][0-9]{0,18}$/) ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    ![
      value.merchandiseSubtotal,
      value.discountTotal,
      value.shipping,
      value.tax,
      value.paymentFees,
      value.payable,
    ].every((v) => matches(v, money)) ||
    !matches(value.roundingAdjustment, signed) ||
    value.merchantWalletSurcharge !== '0.0000' ||
    typeof value.taxTreatment !== 'string' ||
    !value.taxTreatment.trim() ||
    value.taxTreatment.length > 160 ||
    (expected && !sameTerms(value, expected))
  )
    invalid();
  const {
    quoteId,
    quoteFingerprint,
    revision,
    expiresAt,
    currency,
    method,
    merchandiseSubtotal,
    discountTotal,
    shipping,
    tax,
    taxTreatment,
    paymentFees,
    merchantWalletSurcharge,
    roundingAdjustment,
    payable,
    fingerprint,
  } = value;
  return {
    quoteId,
    quoteFingerprint,
    revision,
    expiresAt,
    currency,
    method,
    merchandiseSubtotal,
    discountTotal,
    shipping,
    tax,
    taxTreatment,
    paymentFees,
    merchantWalletSurcharge,
    roundingAdjustment,
    payable,
    fingerprint,
  };
}
function receipt(
  value: CheckoutPlacementReceiptDto,
  accepted?: PlaceCheckoutDto,
): CheckoutPlacementReceiptDto {
  if (
    !value ||
    !matches(value.orderId, uuid) ||
    !matches(value.orderNumber, /^[A-Za-z0-9-]{1,64}$/)
  )
    invalid();
  const final = terms(value.terms, accepted);
  if (accepted && final.fingerprint !== accepted.finalTermsFingerprint) invalid();
  return { orderId: value.orderId, orderNumber: value.orderNumber, terms: final };
}
const path = (id: string) => `/api/storefront/v1/checkouts/${encodeURIComponent(id)}`;
const json = (owner: ReviewOwner) => ({
  ...ownerHeaders(owner),
  'content-type': 'application/json',
});

export const placementApi = {
  async finalTerms(id: string, owner: ReviewOwner, input: FinalTermsInput, signal: AbortSignal) {
    return terms(
      await requestWithDeadline<CheckoutFinalTermsDto>(`${path(id)}/final-terms`, {
        signal,
        method: 'POST',
        cache: 'no-store',
        headers: json(owner),
        body: JSON.stringify(input),
      }),
      input,
    );
  },
  async place(intent: PlacementIntent, signal: AbortSignal): Promise<CheckoutPlacementResultDto> {
    const value = await requestWithDeadline<CheckoutPlacementResultDto>(
      `${path(intent.draftId)}/placement`,
      {
        signal,
        method: 'POST',
        cache: 'no-store',
        headers: { ...json(intent.owner), 'idempotency-key': intent.key },
        body: intent.body,
      },
      (status, data) =>
        status === 409 &&
        !!data &&
        typeof data === 'object' &&
        'kind' in data &&
        data.kind === 'REVIEW_REQUIRED',
    );
    if (value?.kind === 'REVIEW_REQUIRED' && matches(value.reason, /^[A-Z_]{1,64}$/))
      return { kind: value.kind, reason: value.reason };
    if (value?.kind === 'COMMITTED')
      return { kind: value.kind, receipt: receipt(value.receipt, intent.accepted) };
    return invalid();
  },
  async status(
    id: string,
    owner: ReviewOwner,
    signal: AbortSignal,
  ): Promise<CheckoutCommittedOrderDto> {
    const value = await requestWithDeadline<CheckoutCommittedOrderDto>(`${path(id)}/placement`, {
      signal,
      cache: 'no-store',
      headers: ownerHeaders(owner),
    });
    if (
      !value ||
      !orderStates.includes(value.status) ||
      !value.payment ||
      !paymentStates.includes(value.payment.status) ||
      !matches(value.payment.outstanding, money)
    )
      invalid();
    return {
      receipt: receipt(value.receipt),
      status: value.status,
      payment: { status: value.payment.status, outstanding: value.payment.outstanding },
    };
  },
};
