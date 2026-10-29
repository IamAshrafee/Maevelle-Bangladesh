export type MediaUsage = {
  readonly id: string;
  readonly domain: string;
  readonly label: string | null;
  readonly productId?: string;
  readonly productTitle?: string;
  readonly conversationId?: string;
  readonly variantId?: string | null;
  readonly variantSku?: string | null;
  readonly role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly position?: number;
};

export type MediaAsset = {
  readonly id: string;
  readonly assetType: 'IMAGE' | 'DOCUMENT';
  readonly originalFilename: string;
  readonly uploadSource: string;
  readonly uploadedBy: { id: string; name: string } | null;
  readonly folderId: string | null;
  readonly tags: readonly { id: string; name: string }[];
  readonly title: string | null;
  readonly altText: string | null;
  readonly caption: string | null;
  readonly internalDescription: string | null;
  readonly mimeType: string | null;
  readonly byteSize: number | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly status:
    | 'PENDING_UPLOAD'
    | 'UPLOADED'
    | 'PROCESSING'
    | 'READY'
    | 'FAILED'
    | 'QUARANTINED'
    | 'ARCHIVED'
    | 'TRASHED'
    | 'PURGING';
  readonly createdAt: string;
  readonly version: number;
  readonly processingErrorCode: string | null;
  readonly processingErrorMessage: string | null;
  readonly missingPublicRenditions: boolean;
  readonly externalImport: {
    readonly status: 'PENDING' | 'PROCESSING' | 'RETRY_WAIT' | 'COMPLETE' | 'FAILED';
    readonly attempts: number;
    readonly nextAttemptAt: string | null;
  } | null;
  readonly purgeAttempts: number;
  readonly purgeRetryAfter: string | null;
  readonly purgeLeaseUntil: string | null;
  readonly purgeLastError: string | null;
  readonly usages: readonly MediaUsage[];
};

export type ProductSummary = {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
};

export type MediaFolder = {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly version: number;
  readonly assetCount?: number;
};

export type MediaTag = { readonly id: string; readonly name: string; readonly assetCount?: number };
export type Pagination = { page: number; pageSize: number; totalItems: number; totalPages: number };
export type ProductWorkspace = ProductSummary & {
  readonly variants: readonly { id: string; sku: string; status: string }[];
  readonly options: readonly {
    id: string;
    name: string;
    values: readonly { id: string; label: string; status: string }[];
  }[];
};
export type PlacementScope = 'PRODUCT' | 'VARIANT' | 'OPTION';
export type AssetTypeFilter = '' | 'IMAGE' | 'DOCUMENT';
export type UsageFilter = 'ALL' | 'USED' | 'UNUSED';
export type SortOption = 'NEWEST' | 'OLDEST' | 'NAME' | 'SIZE';
export type RenditionChoice = 'pdp' | 'card' | 'thumbnail' | 'zoom' | 'original';
