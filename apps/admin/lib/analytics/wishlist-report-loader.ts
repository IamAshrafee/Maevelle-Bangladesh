import {
  fetchWishlistActivity,
  fetchWishlistCategories,
  fetchWishlistOperations,
  fetchWishlistProducts,
  fetchWishlistSharing,
  fetchWishlistSummary,
} from './wishlist-api';

/** One report generation; callers discard it when filters or the owner change. */
export async function loadWishlistReports(
  input: {
    readonly from: string;
    readonly to: string;
    readonly productPage: number;
    readonly productPageSize: number;
    readonly categoryPage: number;
    readonly categoryPageSize: number;
  },
  signal: AbortSignal,
) {
  const query = { from: input.from, to: input.to };
  const results = await Promise.all([
    fetchWishlistSummary(query, { signal }),
    fetchWishlistActivity(query, { signal }),
    fetchWishlistProducts(
      { ...query, page: input.productPage, pageSize: input.productPageSize },
      { signal },
    ),
    fetchWishlistCategories(
      { ...query, page: input.categoryPage, pageSize: input.categoryPageSize },
      { signal },
    ),
    fetchWishlistSharing(query, { signal }),
    fetchWishlistOperations(query, { signal }),
  ]);
  // Some transports finish despite cancellation. Never publish their stale results.
  return signal.aborted ? undefined : results;
}
