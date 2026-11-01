import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WishlistItem } from './types';

const productId = '11111111-1111-4111-8111-111111111111';
const product: WishlistItem = {
  id: productId,
  title: 'Current product',
  handle: 'current',
  subtitle: '',
  category: 'all',
  categoryLabel: 'Saved',
  price: 100,
  imageUrl: '',
  alt: '',
  inStock: true,
};

class MemoryStorage implements Storage {
  private rows = new Map<string, string>();
  get length() {
    return this.rows.size;
  }
  key(index: number) {
    return [...this.rows.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.rows.set(key, value);
  }
  removeItem(key: string) {
    this.rows.delete(key);
  }
  clear() {
    this.rows.clear();
  }
}

const ok = (data: unknown) => Response.json({ data });
const noSession = () => Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.stubGlobal(
    'CustomEvent',
    class extends Event {
      constructor(
        name: string,
        public detail: unknown,
      ) {
        super(name);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('shared Wishlist controller', () => {
  it('keeps an account-list outage retryable without calling the shopper signed out', async () => {
    let online = false;
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path.endsWith('/shopper/session')) return ok({ authenticated: true, partition: 'account-a' });
      if (path.includes('/wishlist?')) return online
        ? ok({ items: [], count: 0, version: 1, nextCursor: null })
        : Response.json({ error: { code: 'UNAVAILABLE' } }, { status: 503 });
      throw new Error(`Unexpected request: ${path}`);
    }));
    const { wishlistStore } = await import('./wishlist-store');
    const stop = wishlistStore.subscribe(() => {});
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().sync).toBe('error'));
    expect(wishlistStore.getSnapshot().mode).toBe('resolving');
    expect(wishlistStore.getSnapshot().message).toContain('could not load');
    online = true;
    wishlistStore.retry();
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('account'));
    stop();
  });

  it('loads account pages progressively and keeps the server count authoritative', async () => {
    const olderId = '22222222-2222-4222-8222-222222222222';
    const pageItem = (id: string, savedAt: string) => ({
      productId: id, preferredVariantId: null, preferredVariantAvailable: false,
      savedAt, version: 1,
      product: { handle: id, title: id, minimumPrice: '100', available: true, primaryMediaAssetId: null },
    });
    const fetch = vi.fn(async (path: string) => {
      if (path.endsWith('/shopper/session')) return ok({ authenticated: true, partition: 'account-a' });
      if (path.includes('/wishlist?')) return path.includes('cursor=older')
        ? ok({ items: [pageItem(olderId, '2026-01-01T00:00:00.000Z')], count: 2, version: 1, nextCursor: null })
        : ok({ items: [pageItem(productId, '2026-02-01T00:00:00.000Z')], count: 2, version: 1, nextCursor: 'older' });
      if (path.endsWith('/wishlist/saved-state'))
        return ok({ savedProductIds: [olderId], count: 2, version: 1 });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetch);
    const { wishlistStore } = await import('./wishlist-store');
    const stop = wishlistStore.subscribe(() => {});
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('account'));
    expect(wishlistStore.getSnapshot().count).toBe(2);
    expect(wishlistStore.getSnapshot().items).toHaveLength(1);
    expect(wishlistStore.membership(olderId)).toBeNull();
    await wishlistStore.hydrateSavedState([olderId]);
    expect(wishlistStore.membership(olderId)).toBe(true);
    await wishlistStore.loadMore();
    expect(wishlistStore.getSnapshot().items.map((item) => item.id)).toEqual([productId, olderId]);
    expect(wishlistStore.getSnapshot().nextCursor).toBeNull();
    expect(fetch.mock.calls.filter(([path]) => path.includes('cursor=older'))).toHaveLength(1);
    stop();
  });

  it('keeps guest changes in this tab with a warning when persistent storage rejects writes', async () => {
    const storage = new MemoryStorage();
    const write = storage.setItem.bind(storage);
    let blocked = true;
    storage.setItem = (key, value) => {
      if (blocked) throw new Error('Quota exceeded');
      write(key, value);
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => noSession()),
    );
    const { wishlistStore } = await import('./wishlist-store');
    const unsubscribe = wishlistStore.subscribe(() => {});
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('guest'));
    expect(wishlistStore.save(product)).toBe(true);
    expect(wishlistStore.getSnapshot().items.map((item) => item.id)).toEqual([productId]);
    expect(wishlistStore.getSnapshot().sync).toBe('error');
    expect(wishlistStore.getSnapshot().message).toContain('only in this tab');
    expect(wishlistStore.remove(productId)).toBe(true);
    expect(wishlistStore.getSnapshot().items).toHaveLength(0);
    expect(wishlistStore.save(product)).toBe(true);
    blocked = false;
    wishlistStore.retry();
    expect(wishlistStore.getSnapshot().sync).toBe('synced');
    expect(storage.length).toBeGreaterThan(0);
    unsubscribe();
  });

  it('quarantines a server-unknown mutation result until the shopper retries', async () => {
    let saveCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/shopper/session'))
          return ok({ authenticated: true, partition: 'account-a' });
        if (path.includes('/wishlist?'))
          return ok({ items: [], count: 0, version: 1, nextCursor: null });
        if (path.includes('/wishlist/items/')) {
          saveCalls += 1;
          return saveCalls === 1
            ? Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 503 })
            : ok({ version: 2, preferredVariantId: null });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const { wishlistStore } = await import('./wishlist-store');
    const unsubscribe = wishlistStore.subscribe(() => {});
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('account'));
    wishlistStore.save(product);
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().sync).toBe('conflicted'));
    expect(wishlistStore.getSnapshot().items).toHaveLength(0);
    await wishlistStore.revalidateSession();
    expect(saveCalls).toBe(1);
    wishlistStore.retry();
    await vi.waitFor(() => expect(saveCalls).toBe(2));
    unsubscribe();
  });

  it('quarantines an unknown account mutation after refresh until explicit retry', async () => {
    let saveCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/shopper/session'))
          return ok({ authenticated: true, partition: 'account-a' });
        if (path.includes('/wishlist?'))
          return ok({ items: [], count: 0, version: 1, nextCursor: null });
        if (path.includes('/wishlist/items/')) {
          saveCalls += 1;
          return saveCalls === 1
            ? new Promise<Response>(() => {})
            : ok({ version: 2, preferredVariantId: null });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const first = (await import('./wishlist-store')).wishlistStore;
    const unsubscribe = first.subscribe(() => {});
    await vi.waitFor(() => expect(first.getSnapshot().mode).toBe('account'));
    first.save(product);
    await vi.waitFor(() => expect(saveCalls).toBe(1));
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.key(0)).toBe('maevelle_wishlist_account_pending_v1:account-a');
    expect(JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!)).toEqual([
      [productId, { kind: 'save', attempts: 0 }],
    ]);
    unsubscribe();
    vi.resetModules();
    const refreshed = (await import('./wishlist-store')).wishlistStore;
    expect(refreshed).not.toBe(first);
    const stop = refreshed.subscribe(() => {});
    await refreshed.revalidateSession(true);
    await vi.waitFor(() => expect(refreshed.getSnapshot().mode).toBe('account'));
    expect(sessionStorage.getItem('maevelle_wishlist_account_pending_v1:account-a')).not.toBeNull();
    expect(refreshed.getSnapshot().pendingIds).toEqual([productId]);
    await vi.waitFor(() => expect(refreshed.getSnapshot().sync).toBe('conflicted'));
    expect(refreshed.getSnapshot().items).toHaveLength(0);
    expect(saveCalls).toBe(1);
    refreshed.retry();
    await vi.waitFor(() => expect(saveCalls).toBe(2));
    stop();
  });

  it('requires review before rebasing a version-conflicted guest merge', async () => {
    let signedIn = false;
    let serverVersion = 1;
    let mergeCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/shopper/session'))
          return signedIn ? ok({ authenticated: true, partition: 'account-a' }) : noSession();
        if (path.includes('/wishlist?'))
          return ok({ items: [], count: 0, version: serverVersion, nextCursor: null });
        if (path.endsWith('/wishlist/merges')) {
          mergeCalls += 1;
          if (mergeCalls === 1) {
            serverVersion = 2;
            return Response.json(
              { error: { code: 'VERSION_CONFLICT', message: 'Changed' } },
              { status: 409 },
            );
          }
          return ok({
            mergeId: 'merged',
            previouslyApplied: false,
            acceptedProductIds: [productId],
            alreadyPresentProductIds: [],
            rejectedProductIds: [],
            rejectedItems: [],
            variantResults: [],
            version: 3,
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const { wishlistStore } = await import('./wishlist-store');
    const unsubscribe = wishlistStore.subscribe(() => {});
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('guest'));
    wishlistStore.save(product);
    signedIn = true;
    await wishlistStore.afterSignIn();
    expect(wishlistStore.getSnapshot().sync).toBe('conflicted');
    await wishlistStore.revalidateSession();
    expect(mergeCalls).toBe(1);
    await wishlistStore.reviewMergeConflict();
    expect(wishlistStore.getSnapshot().mergeReviewed).toBe(true);
    await wishlistStore.confirmMergeAfterReview();
    expect(mergeCalls).toBe(2);
    unsubscribe();
  });

  it('keeps guest references until a merge receipt and clears account state on sign-out', async () => {
    let signedIn = false;
    let accountHasProduct = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/shopper/session'))
          return signedIn ? ok({ authenticated: true, partition: 'account-a' }) : noSession();
        if (path.includes('/wishlist?'))
          return ok({
            items: accountHasProduct
              ? [
                  {
                    productId,
                    preferredVariantId: null,
                    savedAt: new Date().toISOString(),
                    version: 1,
                    preferredVariantAvailable: false,
                    product: {
                      handle: 'current',
                      title: 'Current product',
                      minimumPrice: '100',
                      available: true,
                      primaryMediaAssetId: null,
                    },
                  },
                ]
              : [],
            count: accountHasProduct ? 1 : 0,
            version: accountHasProduct ? 2 : 1,
            nextCursor: null,
          });
        if (path.endsWith('/wishlist/merges')) {
          accountHasProduct = true;
          return ok({
            mergeId: 'merge',
            previouslyApplied: false,
            acceptedProductIds: [productId],
            alreadyPresentProductIds: [],
            rejectedProductIds: [],
            rejectedItems: [],
            variantResults: [{ productId, preferredVariantId: null }],
            version: 2,
          });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const { wishlistStore } = await import('./wishlist-store');
    const unsubscribe = wishlistStore.subscribe(() => {});
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('guest'));
    expect(wishlistStore.save(product)).toBe(true);
    const stored = [...Array(localStorage.length)].map((_, index) =>
      localStorage.getItem(localStorage.key(index)!),
    );
    expect(stored.join('')).not.toContain('Current product');
    signedIn = true;
    await wishlistStore.afterSignIn();
    expect(wishlistStore.getSnapshot().mode).toBe('account');
    expect(wishlistStore.getSnapshot().items.map((item) => item.id)).toEqual([productId]);
    expect(wishlistStore.getSnapshot().sync).toBe('synced');
    wishlistStore.signOut();
    expect(wishlistStore.getSnapshot().mode).toBe('guest');
    expect(wishlistStore.getSnapshot().items).toHaveLength(0);
    unsubscribe();
  });

  it('ignores an account mutation response after switching accounts', async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    let activePartition = 'account-a';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/shopper/session'))
          return ok({ authenticated: true, partition: activePartition });
        if (path.includes('/wishlist?'))
          return ok({ items: [], count: 0, version: 1, nextCursor: null });
        if (path.includes('/wishlist/items/'))
          return new Promise<Response>((resolve) => {
            resolveSave = resolve;
          });
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const { wishlistStore } = await import('./wishlist-store');
    const unsubscribe = wishlistStore.subscribe(() => {});
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('account'));
    wishlistStore.save(product);
    await vi.waitFor(() => expect(resolveSave).toBeDefined());
    wishlistStore.signOut();
    activePartition = 'account-b';
    await wishlistStore.afterSignIn();
    resolveSave!(ok({ version: 2, preferredVariantId: null }));
    await vi.waitFor(() => expect(wishlistStore.getSnapshot().mode).toBe('account'));
    expect(wishlistStore.getSnapshot().items).toHaveLength(0);
    unsubscribe();
  });
});
