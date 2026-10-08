import type {
  ApiEnvelope,
  MediaFolderDto,
  MediaLibraryItemDto,
  MediaTagDto,
  ProductMediaPlacementInputDto,
} from '@maevelle/contracts';

import { catalogRequest } from '../catalog/api';

export type MediaProcessingStatus =
  'PENDING_UPLOAD' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | 'QUARANTINED';

interface UploadSessionResponse {
  readonly sessionId: string;
  readonly assetId: string;
  readonly status: 'PENDING_UPLOAD';
  readonly upload: {
    readonly strategy: 'SIGNED_PUT' | 'API_PROXY';
    readonly url: string;
    readonly method: 'PUT';
    readonly headers: Readonly<Record<string, string>>;
  };
}

export async function uploadMediaFile(
  file: File,
  input: {
    readonly visibility: 'PUBLIC' | 'PRIVATE';
    readonly title?: string | null;
    readonly altText?: string | null;
    readonly onProgress?: (progress: number) => void;
  },
): Promise<{ readonly assetId: string; readonly status: MediaProcessingStatus }> {
  const session = await catalogRequest<ApiEnvelope<UploadSessionResponse>>('/admin/media/uploads', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      byteSize: file.size,
      visibility: input.visibility,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.altText !== undefined ? { altText: input.altText } : {}),
    }),
  });
  const upload = session.data.upload;
  await putFile(
    upload.url,
    file,
    upload.headers,
    upload.strategy === 'API_PROXY',
    input.onProgress,
  );
  const completed = await catalogRequest<ApiEnvelope<{ assetId: string; status: 'UPLOADED' }>>(
    `/admin/media/uploads/${session.data.sessionId}/complete`,
    { method: 'POST' },
  );
  return completed.data;
}

function putFile(
  url: string,
  file: File,
  headers: Readonly<Record<string, string>>,
  includeCredentials: boolean,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.timeout = 60_000;
    request.withCredentials = includeCredentials;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        let message = 'Object storage rejected the upload.';
        try {
          const payload = JSON.parse(request.responseText) as {
            error?: { message?: string } | string;
          };
          message =
            typeof payload.error === 'string' ? payload.error : payload.error?.message || message;
        } catch {
          // Keep the safe fallback for non-JSON storage responses.
        }
        reject(new Error(message));
      }
    });
    request.addEventListener('error', () => reject(new Error('Upload connection failed.')));
    request.addEventListener('timeout', () =>
      reject(new Error('Upload timed out. Check the connection and try again.')),
    );
    request.addEventListener('abort', () =>
      reject(new Error('Upload was cancelled before it completed.')),
    );
    request.send(file);
  });
}

export async function waitForMediaReady(
  assetId: string,
  options: { readonly timeoutMs?: number; readonly intervalMs?: number } = {},
): Promise<MediaProcessingStatus> {
  const timeoutAt = Date.now() + (options.timeoutMs ?? 45_000);
  const intervalMs = options.intervalMs ?? 1_000;
  while (Date.now() < timeoutAt) {
    const response = await catalogRequest<ApiEnvelope<{ status: MediaProcessingStatus }>>(
      `/admin/media/${assetId}`,
    );
    if (['READY', 'FAILED', 'QUARANTINED'].includes(response.data.status))
      return response.data.status;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return 'PROCESSING';
}

export interface ListMediaParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly query?: string;
  readonly status?: string;
  readonly assetType?: 'IMAGE' | 'DOCUMENT';
  readonly visibility?: 'PUBLIC' | 'PRIVATE';
  readonly unused?: boolean;
  readonly folderId?: string;
  readonly tagId?: string;
}

export interface MediaLibraryResponse {
  readonly data: readonly MediaLibraryItemDto[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
}

export async function listMediaLibrary(
  params: ListMediaParams = {},
): Promise<MediaLibraryResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.query) query.set('query', params.query);
  if (params.status) query.set('status', params.status);
  if (params.assetType) query.set('assetType', params.assetType);
  if (params.visibility) query.set('visibility', params.visibility);
  if (params.unused !== undefined) query.set('unused', String(params.unused));
  if (params.folderId) query.set('folderId', params.folderId);
  if (params.tagId) query.set('tagId', params.tagId);

  const qs = query.toString();
  return catalogRequest<MediaLibraryResponse>(`/admin/media${qs ? `?${qs}` : ''}`);
}

export async function listMediaFolders(): Promise<readonly MediaFolderDto[]> {
  const response =
    await catalogRequest<ApiEnvelope<readonly MediaFolderDto[]>>('/admin/media/folders');
  return response.data;
}

export async function listMediaTags(): Promise<readonly MediaTagDto[]> {
  const response = await catalogRequest<ApiEnvelope<readonly MediaTagDto[]>>('/admin/media/tags');
  return response.data;
}

export async function syncProductMediaPlacements(
  productId: string,
  placements: readonly ProductMediaPlacementInputDto[],
): Promise<{ readonly synced: boolean; readonly count: number }> {
  const response = await catalogRequest<
    ApiEnvelope<{ readonly synced: boolean; readonly count: number }>
  >(`/admin/catalog/products/${productId}/media`, {
    method: 'PUT',
    body: JSON.stringify({ placements }),
  });
  return response.data;
}

export async function bulkTrashMedia(assetIds: readonly string[]): Promise<{
  readonly trashedCount: number;
  readonly skippedInUseCount: number;
  readonly inUseAssetIds: readonly string[];
}> {
  const response = await catalogRequest<
    ApiEnvelope<{
      readonly trashedCount: number;
      readonly skippedInUseCount: number;
      readonly inUseAssetIds: readonly string[];
    }>
  >('/admin/media/bulk/trash', {
    method: 'POST',
    body: JSON.stringify({ assetIds }),
  });
  return response.data;
}

export async function bulkOrganizeMedia(payload: {
  readonly assetIds: readonly string[];
  readonly folderId?: string | null;
  readonly addTagIds?: readonly string[];
  readonly removeTagIds?: readonly string[];
}): Promise<{ readonly updatedCount: number }> {
  const response = await catalogRequest<ApiEnvelope<{ readonly updatedCount: number }>>(
    '/admin/media/bulk/organize',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export function getAdminMediaUrl(
  assetId: string,
  options?: {
    readonly rendition?: 'thumbnail' | 'card' | 'pdp' | 'zoom' | 'original';
    readonly download?: boolean;
  },
): string {
  const query = new URLSearchParams();
  if (options?.rendition) query.set('rendition', options.rendition);
  if (options?.download) query.set('download', 'true');
  const qs = query.toString();
  return `/api/admin/media/${encodeURIComponent(assetId)}/content${qs ? `?${qs}` : ''}`;
}
