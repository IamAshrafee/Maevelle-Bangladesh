'use client';

import type { ApiEnvelope } from '@maevelle/contracts';

export class StorefrontClientApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'StorefrontClientApiError';
  }
}

export async function requestStorefrontClient<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => undefined)) as
    | ApiEnvelope<T>
    | { readonly error?: { readonly code?: string; readonly message?: string } | string }
    | undefined;
  if (!response.ok) {
    const error = body && 'error' in body ? body.error : undefined;
    const code = typeof error === 'string' ? error : (error?.code ?? 'REQUEST_FAILED');
    const message =
      typeof error === 'object' && error?.message
        ? error.message
        : 'The request could not be completed.';
    const retryAfter = response.headers.get('retry-after');
    const retryAfterSeconds = retryAfter
      ? /^\d+$/.test(retryAfter) ? Number(retryAfter) : Math.max(0, Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000))
      : null;
    throw new StorefrontClientApiError(response.status, code, message,
      retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null);
  }
  if (!body || !('data' in body))
    throw new StorefrontClientApiError(
      502,
      'INVALID_RESPONSE',
      'The server returned an invalid response.',
    );
  return body.data;
}
