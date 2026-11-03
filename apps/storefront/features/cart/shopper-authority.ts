import { StorefrontClientApiError } from '@/lib/api/client/http';
import { requestCart } from './api';

export async function resolveCartShopper(signal: AbortSignal): Promise<string | null> {
  try {
    const result = await requestCart<{ authenticated: true; partition: string }>(
      '/api/storefront/v1/shopper/session',
      { signal, cache: 'no-store' },
    );
    if (result?.authenticated !== true || !/^[A-Za-z0-9_-]{43}$/.test(result.partition))
      throw new Error('Your account could not be checked.');
    return result.partition;
  } catch (error) {
    if (
      error instanceof StorefrontClientApiError &&
      error.status === 401 &&
      error.code === 'UNAUTHENTICATED'
    )
      return null;
    throw error;
  }
}
