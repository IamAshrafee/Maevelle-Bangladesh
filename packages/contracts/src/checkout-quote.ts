/** Evaluated components only. Tax, payment fees, provider compatibility and final rounding are unresolved. */
export interface CreateCheckoutQuoteDto {
  readonly revision: string;
  /** CART uses only the accepted Cart's coupons; BUY_NOW may explicitly supply up to ten. */
  readonly couponCodes?: readonly string[];
}
export interface AcknowledgeCheckoutQuoteDto {
  readonly revision: string;
  readonly fingerprint: string;
}
export interface CheckoutQuoteLineDto {
  readonly id: string;
  readonly variantId: string;
  readonly productId: string;
  readonly title: string;
  readonly sku: string;
  readonly quantity: string;
  readonly priceDefinitionId: string;
  readonly unitPrice: string;
  readonly gross: string;
  readonly discount: string;
  readonly net: string;
}
export interface CheckoutQuoteFactsDto {
  readonly currency: string;
  readonly lines: readonly CheckoutQuoteLineDto[];
  readonly discounts: readonly {
    promotionId: string;
    revisionId: string;
    couponCodeId: string | null;
    discount: string;
    allocations: readonly { lineId: string; amount: string }[];
  }[];
  readonly coupons: readonly { code: string; status: 'EFFECTIVE' | 'NO_CURRENT_BENEFIT' }[];
  readonly merchandiseSubtotal: string;
  readonly discountTotal: string;
  readonly shipping: string;
  readonly evaluatedTotal: string;
  readonly tax: null;
  readonly paymentFees: null;
  readonly payable: null;
  readonly final: false;
}
export type CheckoutQuoteIssue =
  | 'DRAFT_EXPIRED'
  | 'SOURCE_CHANGED'
  | 'DELIVERY_CHANGED'
  | 'ADDRESS_CHANGED'
  | 'CONFIGURATION_CHANGED'
  | 'VARIANT_UNAVAILABLE'
  | 'INSUFFICIENT_STOCK'
  | 'UNSUPPORTED_AREA'
  | 'DELIVERY_UNAVAILABLE'
  | 'QUOTE_EXPIRED'
  | 'SUPERSEDED';
export interface CheckoutQuoteDto {
  readonly id: string;
  readonly draftId: string;
  readonly draftRevision: string;
  readonly source: { kind: 'BUY_NOW' } | { kind: 'CART'; cartId: string; cartRevision: string };
  readonly fingerprint: string;
  readonly evaluatedAt: string;
  readonly expiresAt: string;
  readonly facts: CheckoutQuoteFactsDto;
  /** Current observations never mutate facts. Revalidate again before any future placement. */
  readonly status: 'CURRENT' | 'EXPIRED' | 'SUPERSEDED' | 'INVALIDATED';
  readonly issues: readonly CheckoutQuoteIssue[];
  readonly acknowledged: boolean;
  readonly reviewRequired: boolean;
  readonly changes: readonly (
    'SOURCE' | 'DELIVERY' | 'MERCHANDISE' | 'DISCOUNTS' | 'SHIPPING' | 'CONFIGURATION'
  )[];
  readonly previousQuoteId: string | null;
  readonly blockers: readonly [
    'TAX_POLICY_UNRESOLVED',
    'PAYMENT_POLICY_UNRESOLVED',
    'COURIER_COMPATIBILITY_UNVERIFIED',
  ];
  readonly stockReserved: false;
  readonly purchaseAvailable: false;
}
