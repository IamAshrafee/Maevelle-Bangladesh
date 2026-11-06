import type { OrderPaymentSummaryDto, OrderStatusDto } from './index.js';

export type CheckoutPlacementMethod = 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';

export interface CheckoutFinalTermsDto {
  readonly quoteId: string;
  readonly quoteFingerprint: string;
  readonly revision: string;
  readonly expiresAt: string;
  readonly currency: 'BDT';
  readonly method: CheckoutPlacementMethod;
  readonly merchandiseSubtotal: string;
  readonly discountTotal: string;
  readonly shipping: string;
  readonly tax: string;
  readonly taxTreatment: string;
  readonly paymentFees: string;
  readonly merchantWalletSurcharge: '0.0000';
  readonly roundingAdjustment: string;
  readonly payable: string;
  readonly fingerprint: string;
}

export interface PlaceCheckoutDto {
  readonly revision: string;
  readonly quoteId: string;
  readonly quoteFingerprint: string;
  readonly finalTermsFingerprint: string;
  readonly method: CheckoutPlacementMethod;
}

export interface CheckoutPlacementReceiptDto {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly terms: CheckoutFinalTermsDto;
}

export type CheckoutPlacementResultDto =
  | { readonly kind: 'COMMITTED'; readonly receipt: CheckoutPlacementReceiptDto }
  | { readonly kind: 'REVIEW_REQUIRED'; readonly reason: string };

export interface CheckoutCommittedOrderDto {
  readonly receipt: CheckoutPlacementReceiptDto;
  readonly status: OrderStatusDto;
  readonly payment: Pick<OrderPaymentSummaryDto, 'status' | 'outstanding'>;
}
