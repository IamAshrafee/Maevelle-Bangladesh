import type {
  WishlistMergeReceiptDto,
  WishlistMergeRequestDto,
  WishlistPageDto,
  WishlistSavedStateDto,
} from '@maevelle/contracts';

export class WishlistApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/storefront/v1/${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new WishlistApiError(
      0,
      'NETWORK_FAILURE',
      'The wishlist could not connect. Try again.',
      null,
    );
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error: { code?: string; message?: string } }).error
        : null;
    const retry = Number(response.headers.get('retry-after'));
    throw new WishlistApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The wishlist request failed.',
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  if (!body || typeof body !== 'object' || !('data' in body))
    throw new WishlistApiError(
      502,
      'INVALID_RESPONSE',
      'The wishlist returned an invalid response.',
      null,
    );
  return (body as { data: T }).data;
}

const json = { 'content-type': 'application/json' };

export const accountWishlistApi = {
  session: () => request<{ authenticated: true; partition: string }>('shopper/session'),
  page: (cursor?: string) =>
    request<WishlistPageDto>(
      `wishlist?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  savedState: (productIds: readonly string[]) =>
    request<WishlistSavedStateDto>('wishlist/saved-state', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ productIds }),
    }),
  save: (
    productId: string,
    preferredVariantId: string | null | undefined,
    expectedVersion: number,
  ) =>
    request<{ version: number; preferredVariantId: string | null }>(
      `wishlist/items/${encodeURIComponent(productId)}`,
      {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({
          expectedVersion,
          ...(preferredVariantId !== undefined ? { preferredVariantId } : {}),
        }),
      },
    ),
  remove: (productId: string, expectedVersion: number) =>
    request<{ version: number }>(
      `wishlist/items/${encodeURIComponent(productId)}?expectedVersion=${expectedVersion}`,
      { method: 'DELETE', headers: json, body: '{}' },
    ),
  merge: (input: WishlistMergeRequestDto) =>
    request<WishlistMergeReceiptDto>('wishlist/merges', {
      method: 'POST',
      headers: json,
      body: JSON.stringify(input),
    }),
};
