import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountWishlistApi, type WishlistApiError } from './account-adapter';

afterEach(() => vi.unstubAllGlobals());

describe('account Wishlist transport', () => {
  it('sends cookie credentials and JSON desired-state mutations', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ data: { version: 2, preferredVariantId: null } }),
    );
    vi.stubGlobal('fetch', fetch);
    await accountWishlistApi.save('11111111-1111-4111-8111-111111111111', null, 1);
    const [path, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toContain('/api/storefront/v1/wishlist/items/');
    expect(options.credentials).toBe('include');
    expect(options.cache).toBe('no-store');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body as string)).toEqual({
      expectedVersion: 1,
      preferredVariantId: null,
    });
    expect(options.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [409, 'VERSION_CONFLICT'],
    [429, 'RATE_LIMITED'],
    [503, 'AUTH_UNAVAILABLE'],
  ])('preserves structured %i errors', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code, message: 'Failed' } },
          { status, headers: { 'retry-after': '61' } },
        ),
      ),
    );
    await expect(accountWishlistApi.page()).rejects.toMatchObject({
      status,
      code,
      retryAfterSeconds: 61,
    } satisfies Partial<WishlistApiError>);
  });
});
