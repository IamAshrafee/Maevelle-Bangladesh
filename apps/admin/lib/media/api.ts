import type { ApiEnvelope } from '@maevelle/contracts';

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
    request.withCredentials = includeCredentials;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
      } else reject(new Error('Object storage rejected the upload.'));
    });
    request.addEventListener('error', () => reject(new Error('Upload connection failed.')));
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
