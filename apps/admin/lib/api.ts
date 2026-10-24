import type { ApiEnvelope, ApiErrorDto } from '@maevelle/contracts';

export class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !(typeof Blob !== 'undefined' && init.body instanceof Blob) &&
    !headers.has('content-type')
  )
    headers.set('content-type', 'application/json');
  
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let payload: ApiErrorDto | { error?: string } | undefined;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as ApiErrorDto | { error?: string };
      } catch {
        payload = undefined;
      }
    }
    const structured = payload && typeof payload.error === 'object' ? payload.error : undefined;
    throw new ApiRequestError(
      structured?.message ?? (text.trim() ? text.trim().slice(0, 200) : 'The operation could not be completed. Try again.'),
      structured?.code ?? (typeof payload?.error === 'string' ? payload.error : 'REQUEST_FAILED'),
      response.status,
      undefined,
    );
  }
  
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text || !text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiRequestError(
      'The server returned an unparseable response.',
      'INVALID_RESPONSE',
      response.status,
      undefined,
    );
  }
}

export async function fetchApiData<T>(path: string, init?: RequestInit): Promise<T> {
  const envelope = await apiRequest<ApiEnvelope<T> | undefined>(path, init);
  if (envelope && typeof envelope === 'object' && 'data' in envelope) {
    return envelope.data as T;
  }
  return envelope as T;
}
