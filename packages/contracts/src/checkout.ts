/** IDs/revisions are preconditions, never credentials. Phase 01A has no payable quote. */
export type CheckoutSourceDto =
  | { readonly kind: 'CART'; readonly cartId: string; readonly cartRevision: string }
  | { readonly kind: 'BUY_NOW'; readonly variantId: string; readonly quantity: string };

export interface CreateCheckoutDraftDto {
  readonly source: CheckoutSourceDto;
}
export interface UpdateCheckoutDraftDto {
  readonly revision: string;
  /** Source kind cannot change. CART refreshes must name the same Cart. */
  readonly source?: CheckoutSourceDto;
  readonly action?: 'ABANDON';
}
export interface AdoptCheckoutDraftDto {
  readonly revision: string;
}
export interface CheckoutDraftDto {
  readonly id: string;
  readonly implementationVersion: 2;
  readonly revision: string;
  readonly ownerKind: 'GUEST' | 'ACCOUNT';
  readonly status: 'ACTIVE' | 'ABANDONED' | 'EXPIRED';
  readonly expiresAt: string;
  readonly currency: string;
  readonly source:
    | { readonly kind: 'CART'; readonly cartId: string; readonly cartRevision: string }
    | { readonly kind: 'BUY_NOW' };
  readonly lines: readonly {
    readonly id: string;
    readonly variantId: string;
    readonly quantity: string;
    readonly sourceCartLineId: string | null;
  }[];
  readonly sourceReviewRequired: boolean;
  readonly purchaseAvailable: false;
}
export interface CheckoutGuestSessionDto {
  readonly id: string;
  readonly expiresAt: string;
}
