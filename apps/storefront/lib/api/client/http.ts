'use client';

import type { ApiEnvelope } from '@maevelle/contracts';

export class StorefrontClientApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
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
    throw new StorefrontClientApiError(response.status, code, message);
  }
  if (!body || !('data' in body))
    throw new StorefrontClientApiError(
      502,
      'INVALID_RESPONSE',
      'The server returned an invalid response.',
    );
  return body.data;
}
