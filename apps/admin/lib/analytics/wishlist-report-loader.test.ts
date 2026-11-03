import { expect, it, vi } from 'vitest';
import { loadWishlistReports } from './wishlist-report-loader';
import * as api from './wishlist-api';
vi.mock('./wishlist-api', () => ({
  fetchWishlistSummary: vi.fn(),
  fetchWishlistActivity: vi.fn(),
  fetchWishlistProducts: vi.fn(),
  fetchWishlistCategories: vi.fn(),
  fetchWishlistSharing: vi.fn(),
  fetchWishlistOperations: vi.fn(),
}));
const fetchers = [
  api.fetchWishlistSummary,
  api.fetchWishlistActivity,
  api.fetchWishlistProducts,
  api.fetchWishlistCategories,
  api.fetchWishlistSharing,
  api.fetchWishlistOperations,
];
const query = {
  from: '2026-10-04',
  to: '2026-11-02',
  productPage: 1,
  productPageSize: 25,
  categoryPage: 1,
  categoryPageSize: 25,
};
it('discards a superseded report even when the transport ignores cancellation', async () => {
  let finish!: (value: never) => void;
  const slow = new Promise<never>((resolve) => {
    finish = resolve;
  });
  for (const fn of fetchers) vi.mocked(fn).mockReturnValue(slow);
  const controller = new AbortController();
  const pending = loadWishlistReports(query, controller.signal);
  controller.abort();
  finish({ result: 'stale' } as never);
  expect(await pending).toBeUndefined();
  for (const fn of fetchers)
    expect(fn).toHaveBeenLastCalledWith(expect.any(Object), { signal: controller.signal });
});
