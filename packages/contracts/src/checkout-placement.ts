import type { OrderPaymentSummaryDto, OrderStatusDto } from './index.js';
import type { WholeTakaPolicyDto } from './retail-money.js';

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
  readonly precisePayable?: string;
  readonly payableUnit?: 'BDT_1';
  readonly wholeTakaPolicy?: Omit<WholeTakaPolicyDto, 'approval' | 'invoiceTreatmentReference'>;
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
  readonly payment: Pick<OrderPaymentSummaryDto, 'status' | 'outstanding'> &
    Partial<
      Pick<
        OrderPaymentSummaryDto,
        'collected' | 'refunded' | 'authorizedWaiver' | 'settlementStatus'
      >
    >;
}

export interface SubmitCheckoutPaymentClaimDto {
  readonly transactionId: string;
  readonly sendingMobile?: string;
}

export interface CheckoutPaymentClaimDto {
  readonly id: string;
  readonly submittedAt: string;
  readonly status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  readonly reviewState:
    'PENDING' | 'UNDER_REVIEW' | 'CORRECTION_REQUESTED' | 'ESCALATED' | 'RESOLVED';
}

export type CheckoutWalletAvailability =
  | 'AVAILABLE'
  | 'COD'
  | 'POLICY_BLOCKED'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'DESTINATION_UNAVAILABLE'
  | 'PAYMENT_WINDOW_EXPIRED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_ALREADY_SETTLED'
  | 'PAYMENT_SUPPORT_REQUIRED'
  | 'CLAIM_UNDER_REVIEW';

export interface CheckoutWalletInstructionsDto {
  readonly provider: 'BKASH' | 'NAGAD';
  readonly accountType: 'PERSONAL_RETAIL_ACCOUNT';
  readonly transferAction: 'MERCHANT_PAYMENT';
  readonly accountNumber: string;
  readonly accountName: string;
  readonly text: string;
}

export interface CheckoutOrderPaymentDto {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly orderStatus: OrderStatusDto;
  readonly method: CheckoutPlacementMethod;
  readonly currency: 'BDT';
  readonly originalPayable: string;
  readonly outstanding: string;
  readonly authorizedWaiver?: string;
  readonly settlementStatus?: 'OPEN' | 'SETTLED_BY_RECEIPTS' | 'SETTLED_WITH_ADJUSTMENT';
  readonly allocated: string;
  readonly refundedFromAllocation: string;
  readonly verifiedWalletReceipts: string;
  readonly unallocatedAtVerification: string;
  readonly hasLateReceipt: boolean;
  readonly hasReceiptReversal: boolean;
  readonly refundStates: readonly string[];
  readonly paymentStatus: OrderPaymentSummaryDto['status'];
  readonly obligationStatus: 'READY' | 'SATISFIED' | 'EXPIRED' | 'CANCELLED';
  readonly submissionDeadline: string | null;
  readonly reviewDeadline: string | null;
  readonly transferAvailability: CheckoutWalletAvailability;
  readonly claimAvailability: Exclude<CheckoutWalletAvailability, 'CLAIM_UNDER_REVIEW'>;
  readonly instructions: CheckoutWalletInstructionsDto | null;
  readonly latestClaim: CheckoutPaymentClaimDto | null;
  readonly openClaims: readonly CheckoutPaymentClaimDto[];
}
