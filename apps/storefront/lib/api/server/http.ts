import 'server-only';

import type { ApiEnvelope } from '@maevelle/contracts';

import { storefrontInternalApiUrl } from '@/lib/env/storefront';

interface ApiErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string } | string;
}

export class StorefrontApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StorefrontApiError';
  }
}

function errorDetails(body: unknown): { code: string; message: string } {
  if (!body || typeof body !== 'object')
    return { code: 'UPSTREAM_ERROR', message: 'The Storefront service is unavailable.' };

  const error = (body as ApiErrorBody).error;
  if (typeof error === 'string')
    return { code: error, message: 'The request could not be completed.' };
  return {
    code: error?.code ?? 'UPSTREAM_ERROR',
    message: error?.message ?? 'The Storefront service is unavailable.',
  };
}

export async function requestStorefrontApi<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${storefrontInternalApiUrl}${path}`, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    });
  } catch (error: unknown) {
    const isTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new StorefrontApiError(
      503,
      isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
      isTimeout
        ? 'The request to Storefront API timed out.'
        : 'The Storefront service is unavailable.',
    );
  }
  const body = (await response.json().catch(() => undefined)) as
    ApiEnvelope<T> | ApiErrorBody | undefined;

  if (!response.ok) {
    const details = errorDetails(body);
    throw new StorefrontApiError(response.status, details.code, details.message);
  }
  if (!body || typeof body !== 'object' || !('data' in body))
    throw new StorefrontApiError(
      502,
      'INVALID_UPSTREAM_RESPONSE',
      'The Storefront returned an invalid response.',
    );

  return body.data;
}
