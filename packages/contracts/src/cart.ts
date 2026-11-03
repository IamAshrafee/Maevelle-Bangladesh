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
    readonly previousQuantity: string;
    readonly quantity: string;
  }[];
}

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
