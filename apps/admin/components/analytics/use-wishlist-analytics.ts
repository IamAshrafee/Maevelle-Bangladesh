'use client';

import * as React from 'react';
import { validateWishlistDateRange, ApiRequestError } from '@/lib/analytics/wishlist-api';
import { loadWishlistReports } from '@/lib/analytics/wishlist-report-loader';
import type {
  DateRangeSelection,
  WishlistAnalyticsMetadataDto,
  WishlistSummaryDto,
  WishlistTrendDto,
  WishlistAnalyticsPageDto,
  WishlistProductInterestDto,
  WishlistCategoryInterestDto,
  WishlistSharingDto,
  WishlistOperationsDto,
} from '@/lib/analytics/types';

export function useWishlistAnalytics(selection: DateRangeSelection, refreshVersion: number) {
  // 1. Local State
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<{ code?: string; message: string } | null>(null);

  // Endpoint datasets
  const [metadata, setMetadata] = React.useState<WishlistAnalyticsMetadataDto | null>(null);
  const [summary, setSummary] = React.useState<WishlistSummaryDto | null>(null);
  const [activity, setActivity] = React.useState<readonly WishlistTrendDto[] | null>(null);
  const [productsPage, setProductsPage] =
    React.useState<WishlistAnalyticsPageDto<WishlistProductInterestDto> | null>(null);
  const [categoriesPage, setCategoriesPage] =
    React.useState<WishlistAnalyticsPageDto<WishlistCategoryInterestDto> | null>(null);
  const [sharing, setSharing] = React.useState<WishlistSharingDto | null>(null);
  const [operations, setOperations] = React.useState<WishlistOperationsDto | null>(null);

  // Pagination states
  const [productPage, setProductPage] = React.useState(1);
  const [productPageSize, setProductPageSize] = React.useState(25);
  const [categoryPage, setCategoryPage] = React.useState(1);
  const [categoryPageSize, setCategoryPageSize] = React.useState(25);

  const [refreshIndex, setRefreshIndex] = React.useState(0);

  // Check 90-day limit
  const dateValidation = React.useMemo(
    () => validateWishlistDateRange(selection.from, selection.to),
    [selection.from, selection.to],
  );

  // 2. Data Fetching
  const loadDashboardData = React.useCallback(
    async (signal: AbortSignal) => {
      if (!dateValidation.valid) {
        setError({
          code: 'RANGE_EXCEEDED',
          message: dateValidation.error ?? 'Wishlist reports support at most 90 local days.',
        });
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const baseQuery = { from: selection.from, to: selection.to };

      try {
        const results = await loadWishlistReports(
          {
            ...baseQuery,
            productPage,
            productPageSize,
            categoryPage,
            categoryPageSize,
          },
          signal,
        );
        if (!results) return;
        const [summaryRes, activityRes, productsRes, categoriesRes, sharingRes, operationsRes] =
          results;
        setMetadata(summaryRes.metadata);
        setSummary(summaryRes.result);
        setActivity(activityRes.result);
        setProductsPage(productsRes.result);
        setCategoriesPage(categoriesRes.result);
        setSharing(sharingRes.result);
        setOperations(operationsRes.result);
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof ApiRequestError) {
          setError({ code: err.code, message: err.message });
        } else {
          setError({
            code: 'NETWORK_ERROR',
            message: err instanceof Error ? err.message : 'Unable to load Wishlist analytics.',
          });
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [
      selection.from,
      selection.to,
      dateValidation.valid,
      dateValidation.error,
      productPage,
      productPageSize,
      categoryPage,
      categoryPageSize,
      refreshIndex,
      refreshVersion,
    ],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void loadDashboardData(controller.signal);
    return () => controller.abort();
  }, [loadDashboardData]);

  // Keep the two pagination controls independent.
  const handleProductPageChange = (newPage: number) => {
    setProductPage(newPage);
  };

  const handleProductPageSizeChange = (newSize: number) => {
    setProductPageSize(newSize);
    setProductPage(1);
  };

  const handleCategoryPageChange = (newPage: number) => {
    setCategoryPage(newPage);
  };

  const handleCategoryPageSizeChange = (newSize: number) => {
    setCategoryPageSize(newSize);
    setCategoryPage(1);
  };

  return {
    loading,
    error,
    metadata,
    summary,
    activity,
    productsPage,
    categoriesPage,
    sharing,
    operations,
    dateValidation,
    setRefreshIndex,
    productPageSize,
    categoryPageSize,
    handleProductPageChange,
    handleProductPageSizeChange,
    handleCategoryPageChange,
    handleCategoryPageSizeChange,
  };
}
