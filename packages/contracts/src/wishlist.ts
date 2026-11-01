/** Private account Wishlist transport types. Owner identity is never client supplied. */
export type WishlistShareStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export interface WishlistShareSelectionDto {
  readonly productId: string;
  readonly preferredVariantId?: string | null;
}
export interface WishlistShareCreateDto {
  /** Browser-generated, 256-bit recovery capability; reuse for the same intent. */
  readonly operationId: string;
  readonly expiresAt: string;
  readonly selection: 'selected' | 'all';
  readonly items: readonly WishlistShareSelectionDto[];
}
export interface WishlistShareCreatedDto {
  readonly id: string;
  readonly viewToken: string;
  readonly manageToken?: string;
  readonly expiresAt: string;
  readonly itemCount: number;
}
export interface WishlistShareRotateLinkDto {
  /** Optimistic concurrency prevents an unknown-result retry from rotating twice. */
  readonly expectedVersion: number;
}
export interface WishlistShareRotatedLinkDto {
  readonly id: string;
  readonly viewToken: string;
  readonly version: number;
}
export interface WishlistShareMetadataDto {
  readonly id: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
  readonly expired: boolean;
  readonly version: number;
  readonly itemCount?: number;
  readonly createdAt?: string;
}
export interface WishlistSharePageDto {
  readonly items: readonly WishlistShareMetadataDto[];
  readonly nextCursor: string | null;
}
export interface WishlistSharedProductDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly price: string | null;
  readonly available: boolean;
  readonly primaryMediaAssetId: string | null;
  readonly preferredVariantId: string | null;
}
export interface WishlistPublicShareDto {
  readonly id: string;
  readonly expiresAt: string;
  readonly products: readonly WishlistSharedProductDto[];
  readonly unavailableCount: number;
}
export interface WishlistItemDto {
  readonly productId: string;
  readonly preferredVariantId: string | null;
  readonly preferredVariantAvailable: boolean;
  readonly savedAt: string;
  readonly version: number;
  readonly product: {
    readonly handle: string;
    readonly title: string;
    readonly minimumPrice: string | null;
    readonly available: boolean;
    readonly primaryMediaAssetId: string | null;
  } | null;
}

export interface WishlistPageDto {
  readonly items: readonly WishlistItemDto[];
  readonly count: number;
  readonly version: number;
  readonly nextCursor: string | null;
}

export interface WishlistSavedStateDto {
  readonly savedProductIds: readonly string[];
  readonly count: number;
  readonly version: number;
}

/** Omitted means preserve the current preference; null explicitly clears it. */
export interface WishlistSaveInputDto {
  readonly preferredVariantId?: string | null;
  readonly expectedVersion?: number;
}

export interface WishlistMergeItemDto {
  readonly productId: string;
  readonly preferredVariantId: string | null;
  readonly savedAt: string;
}

export interface WishlistMergeRequestDto {
  readonly mergeId: string;
  readonly baseVersion: number;
  readonly items: readonly WishlistMergeItemDto[];
}

export interface WishlistMergeReceiptDto {
  readonly mergeId: string;
  readonly previouslyApplied: boolean;
  readonly acceptedProductIds: readonly string[];
  readonly alreadyPresentProductIds: readonly string[];
  readonly rejectedProductIds: readonly string[];
  readonly rejectedItems: readonly {
    productId: string;
    reason: 'UNAVAILABLE_PRODUCT' | 'UNAVAILABLE_VARIANT';
  }[];
  readonly variantResults: readonly { productId: string; preferredVariantId: string | null }[];
  readonly version: number;
}

export type WishlistErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';
