import { fetchApiData, ApiRequestError } from '@/lib/api';
import type {
  WishlistAnalyticsPageDto,
  WishlistAnalyticsQueryDto,
  WishlistAnalyticsResponseDto,
  WishlistCategoryInterestDto,
  WishlistOperationsDto,
  WishlistProductInterestDto,
  WishlistSharingDto,
  WishlistSummaryDto,
  WishlistTrendDto,
} from '@maevelle/contracts';

export { ApiRequestError };

/**
 * Validates that the requested date range adheres to the 90-day reporting limit
 * mandated by backend storage and projection constraints.
 */
export function validateWishlistDateRange(
  from: string,
  to: string,
): { readonly valid: boolean; readonly error?: string } {
  const canonical = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!canonical(from) || !canonical(to))
    return {
      valid: false,
      error: 'Invalid date format. Enter a real calendar date in YYYY-MM-DD format.',
    };
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { valid: false, error: 'Invalid date format. Expected YYYY-MM-DD.' };
  }
  if (fromMs > toMs) {
    return { valid: false, error: 'Start date cannot be after end date.' };
  }
  const diffDays = Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 90) {
    return { valid: false, error: 'Wishlist reports support at most 90 local days.' };
  }
  return { valid: true };
}

/**
 * Serializes query parameters strictly adhering to Fastify route schema.
 * Rejects or strips any parameter other than from, to, page, pageSize.
 */
export function buildWishlistQueryParams(query: WishlistAnalyticsQueryDto): string {
  const params = new URLSearchParams();
  params.set('from', query.from);
  params.set('to', query.to);
  if (query.page !== undefined && Number.isInteger(query.page)) {
    params.set('page', String(query.page));
  }
  if (query.pageSize !== undefined && Number.isInteger(query.pageSize)) {
    params.set('pageSize', String(query.pageSize));
  }
  return params.toString();
}

/** Fetches high-level current account wishlist metrics */
export async function fetchWishlistSummary(
  query: WishlistAnalyticsQueryDto,
  init?: RequestInit,
): Promise<WishlistAnalyticsResponseDto<WishlistSummaryDto>> {
  const qs = buildWishlistQueryParams(query);
  return fetchApiData<WishlistAnalyticsResponseDto<WishlistSummaryDto>>(
    `/admin/analytics/wishlist/summary?${qs}`,
    init,
  );
}

/** Fetches daily wishlist save, remove, merge, and net activity */
export async function fetchWishlistActivity(
  query: WishlistAnalyticsQueryDto,
  init?: RequestInit,
): Promise<WishlistAnalyticsResponseDto<readonly WishlistTrendDto[]>> {
  const qs = buildWishlistQueryParams(query);
  return fetchApiData<WishlistAnalyticsResponseDto<readonly WishlistTrendDto[]>>(
    `/admin/analytics/wishlist/activity?${qs}`,
    init,
  );
}

/** Fetches ranked product-interest cohorts with server pagination */
export async function fetchWishlistProducts(
  query: WishlistAnalyticsQueryDto,
  init?: RequestInit,
): Promise<WishlistAnalyticsResponseDto<WishlistAnalyticsPageDto<WishlistProductInterestDto>>> {
  const qs = buildWishlistQueryParams(query);
  return fetchApiData<
    WishlistAnalyticsResponseDto<WishlistAnalyticsPageDto<WishlistProductInterestDto>>
  >(`/admin/analytics/wishlist/products?${qs}`, init);
}

/** Fetches category-level wishlist demand with server pagination */
export async function fetchWishlistCategories(
  query: WishlistAnalyticsQueryDto,
  init?: RequestInit,
): Promise<WishlistAnalyticsResponseDto<WishlistAnalyticsPageDto<WishlistCategoryInterestDto>>> {
  const qs = buildWishlistQueryParams(query);
  return fetchApiData<
    WishlistAnalyticsResponseDto<WishlistAnalyticsPageDto<WishlistCategoryInterestDto>>
  >(`/admin/analytics/wishlist/categories?${qs}`, init);
}

/** Fetches wishlist sharing lifecycle outcomes and observations */
export async function fetchWishlistSharing(
  query: WishlistAnalyticsQueryDto,
  init?: RequestInit,
): Promise<WishlistAnalyticsResponseDto<WishlistSharingDto>> {
  const qs = buildWishlistQueryParams(query);
  return fetchApiData<WishlistAnalyticsResponseDto<WishlistSharingDto>>(
    `/admin/analytics/wishlist/sharing?${qs}`,
    init,
  );
}

/** Fetches operational counters, duration, and cleanup backlog */
export async function fetchWishlistOperations(
  query: WishlistAnalyticsQueryDto,
  init?: RequestInit,
): Promise<WishlistAnalyticsResponseDto<WishlistOperationsDto>> {
  const qs = buildWishlistQueryParams(query);
  return fetchApiData<WishlistAnalyticsResponseDto<WishlistOperationsDto>>(
    `/admin/analytics/wishlist/operations?${qs}`,
    init,
  );
}
