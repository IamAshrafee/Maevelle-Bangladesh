import type { ApiEnvelope, ApiErrorDto } from '@maevelle/contracts';

export class CatalogRequestError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CatalogRequestError';
  }
}

export async function catalogRequest<T>(path: string, init?: RequestInit): Promise<T> {
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
    const payload = (await response.json().catch(() => undefined)) as
      ApiErrorDto | { error?: string } | undefined;
    const structured = payload && typeof payload.error === 'object' ? payload.error : undefined;
    throw new CatalogRequestError(
      structured?.message ?? 'The catalog operation could not be completed. Try again.',
      structured?.code ?? (typeof payload?.error === 'string' ? payload.error : 'REQUEST_FAILED'),
      response.status,
      undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function catalogData<T>(path: string, init?: RequestInit): Promise<T> {
  const envelope = await catalogRequest<ApiEnvelope<T> | undefined>(path, init);
  return envelope?.data as T;
}

export function productMediaUrl(assetId: string, visibility: 'PUBLIC' | 'PRIVATE'): string {
  return visibility === 'PUBLIC'
    ? `/api/media/public/${encodeURIComponent(assetId)}`
    : `/api/admin/media/${encodeURIComponent(assetId)}`;
}

export function formatCatalogMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
