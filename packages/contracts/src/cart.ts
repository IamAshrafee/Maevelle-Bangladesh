/** Public contexts are preconditions, never authentication credentials. */
export type CartOwnerDto =
  | {
      readonly kind: 'GUEST';
      readonly organizationId: string;
      readonly cartId: string;
      readonly ownerContext: string;
      readonly currency: string;
    }
  | {
      readonly kind: 'ACCOUNT';
      readonly organizationId: string;
      readonly accountId: string;
      readonly customerId: string;
      readonly currency: string;
    };

export interface CartMutationOutcomeDto {
  readonly receiptId: string;
  readonly operation: string;
  readonly committedVersion: string;
  readonly eventIds: readonly string[];
  readonly replayed: boolean;
  readonly changes: readonly {
    readonly lineId: string;
    readonly variantId: string;
    readonly previousVariantId?: string;
    readonly previousQuantity: string;
    readonly quantity: string;
  }[];
}

export type CartCommerceIssueDto =
  | { readonly code: 'EMPTY_CART'; readonly action: 'ADD_ITEM' }
  | {
      readonly code:
        'UNAVAILABLE' | 'UNPRICED' | 'INSUFFICIENT_CURRENT_STOCK' | 'INVALID_CONFIGURATION';
      readonly lineId: string;
      readonly action: 'REPLACE_OR_REMOVE' | 'REDUCE_OR_REPLACE_OR_REMOVE';
    };

export interface GuestCartViewDto {
  readonly id: string;
  readonly ownerContext: string;
  readonly intentRevision: string;
  readonly evaluatedAt: string;
  readonly outcome?: CartMutationOutcomeDto;
  readonly currency: string;
  readonly version: number;
  readonly expiresAt: string;
  readonly calculationVersion: number;
  readonly calculationFingerprint: string;
  readonly lines: readonly {
    id: string;
    variantId: string;
    sku: string;
    productTitle: string;
    productHandle: string;
    mediaAssetId: string | null;
    options: readonly { name: string; value: string }[];
    quantity: string;
    unitPrice: string | null;
    compareAtUnitPrice: string | null;
    gross: string;
    discount: string;
    net: string;
    availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNPRICED' | 'INSUFFICIENT_CURRENT_STOCK';
  }[];
  /** Cart merchandise review only. Checkout must revalidate and resolve delivery and payment. */
  readonly commerceReview?: {
    readonly merchandiseReady: boolean;
    readonly deliveryEligibility: 'NOT_EVALUATED';
    readonly issues: readonly CartCommerceIssueDto[];
    readonly coupons: readonly {
      readonly code: string;
      readonly status: 'EFFECTIVE' | 'NO_CURRENT_BENEFIT';
      readonly discount: string;
    }[];
  };
  readonly appliedCoupons: readonly string[];
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly merchandiseNet: string;
}

/** Reuse unchanged for every retry of one public command. The UUID key is a header. */
export interface GuestCartMutationPreconditionDto {
  readonly version: number;
  readonly ownerContext: string;
}
/** DELETE current clears both lines and coupons; session recovery never deletes stored intent. */
export type ClearGuestCartRequestDto = GuestCartMutationPreconditionDto;
export interface CartSessionForgottenDto {
  readonly sessionForgotten: true;
}

/** Quantity replaces the source quantity before any exact-variant merge. */
export interface ReplaceGuestCartLineVariantRequestDto extends GuestCartMutationPreconditionDto {
  readonly targetVariantId: string;
  readonly quantity: string;
}
