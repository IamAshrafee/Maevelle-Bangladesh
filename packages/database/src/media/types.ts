export type MediaAssetType = 'IMAGE' | 'DOCUMENT';
export type MediaVisibility = 'PUBLIC' | 'PRIVATE';
export type MediaStatus =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'QUARANTINED'
  | 'ARCHIVED'
  | 'TRASHED'
  | 'PURGING';
export type SupportedMediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export type MediaRenditionKey = 'thumbnail' | 'card' | 'pdp' | 'zoom';

export class MediaDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
      | 'CONFLICT'
      | 'UPLOAD_EXPIRED'
      | 'UPLOAD_INCOMPLETE'
      | 'MEDIA_IN_USE'
      | 'MEDIA_NOT_READY',
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'MediaDomainError';
  }
}

export interface MediaObjectLocation {
  readonly provider: string;
  readonly bucket: string;
  readonly objectKey: string;
}

export interface MediaAssetDelivery extends MediaObjectLocation {
  /** Stable Media asset identity retained for callers of the original domain API. */
  readonly id: string;
  readonly assetId: string;
  readonly visibility: MediaVisibility;
  readonly status: MediaStatus;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly originalFilename: string;
  readonly altText: string | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly renditionKey: MediaRenditionKey | 'original';
}

export interface MediaUsage {
  readonly id: string;
  readonly domain: string;
  readonly usageType: string;
  readonly entityId: string;
  readonly label: string | null;
  readonly productId?: string;
  readonly productTitle?: string;
  readonly variantId?: string | null;
  readonly variantSku?: string | null;
  readonly optionValueId?: string | null;
  readonly optionValueLabel?: string | null;
  readonly role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly isPrimary?: boolean;
  readonly position?: number;
}

export interface MediaLibraryAsset {
  readonly id: string;
  readonly assetType: MediaAssetType;
  readonly visibility: MediaVisibility;
  readonly status: MediaStatus;
  readonly mimeType: string | null;
  readonly byteSize: number | null;
  readonly originalFilename: string;
  readonly uploadSource: string;
  readonly uploadedBy: { id: string; name: string } | null;
  readonly folderId: string | null;
  readonly tags: readonly { id: string; name: string }[];
  readonly altText: string | null;
  readonly title: string | null;
  readonly caption: string | null;
  readonly internalDescription: string | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly processingErrorCode: string | null;
  readonly processingErrorMessage: string | null;
  readonly usages: readonly MediaUsage[];
}
