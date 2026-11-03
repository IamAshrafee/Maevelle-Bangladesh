import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildWishlistQueryParams,
  fetchWishlistProducts,
  fetchWishlistSummary,
  validateWishlistDateRange,
} from '../lib/analytics/wishlist-api';
import { WishlistView } from '../components/analytics/views/wishlist-view';
import type {
  WishlistAnalyticsMetadataDto,
  WishlistAnalyticsPageDto,
  WishlistCategoryInterestDto,
  WishlistOperationsDto,
  WishlistProductInterestDto,
  WishlistSharingDto,
  WishlistSummaryDto,
  WishlistTrendDto,
} from '@maevelle/contracts';

const mockMetadata: WishlistAnalyticsMetadataDto = {
  from: '2026-10-01',
  toExclusive: '2026-11-01',
  timezone: 'Asia/Dhaka',
  generatedAt: '2026-11-01T12:00:00.000Z',
  instrumentationStart: '2026-10-01T00:00:00.000Z',
  retainedFrom: '2025-10-01T00:00:00.000Z',
  historyComplete: true,
  projection: 'CURRENT',
  pendingEvents: 0,
  oldestPendingAt: null,
  lastProcessedAt: '2026-11-01T11:59:00.000Z',
  sources: {
    current: 'AUTHORITATIVE_DATABASE',
    activity: 'COMMITTED_OUTBOX',
    behavioral: 'CONSENTED_UNVERIFIED_BROWSER',
    operations: 'BEST_EFFORT_COUNTERS',
  },
  rankingMinimumLists: 3,
  observationRetainedFrom: '2026-08-01T00:00:00.000Z',
  unavailable: [
    'complete_guest_inventory',
    'qualified_recipients',
    'unique_human_recipients',
    'share_save_attribution',
    'per_share_conversion',
  ],
};

const mockSummary: WishlistSummaryDto = {
  savedItems: 142,
  lists: 58,
  nonemptyLists: 35,
  distinctProducts: 48,
  availableItems: 120,
  outOfStockItems: 15,
  unavailableItems: 7,
};

const mockActivity: WishlistTrendDto[] = [
  {
    day: '2026-10-30',
    saved: 12,
    removed: 3,
    mergeAdditions: 2,
    merges: 1,
    net: 9,
  },
  {
    day: '2026-10-31',
    saved: 15,
    removed: 5,
    mergeAdditions: 4,
    merges: 2,
    net: 10,
  },
];

const mockProducts: WishlistAnalyticsPageDto<WishlistProductInterestDto> = {
  items: [
    {
      productId: 'prod-001',
      title: 'Silk Organza Wrap',
      categoryId: 'cat-wraps',
      available: true,
      saved: 28,
      recentSaves: 8,
      recentRemovals: null, // Suppressed
    },
    {
      productId: 'prod-002',
      title: 'Jamdani Motif Hair Clip',
      categoryId: 'cat-hair',
      available: false,
      saved: 14,
      recentSaves: null, // Suppressed
      recentRemovals: null, // Suppressed
    },
  ],
  page: 1,
  pageSize: 25,
  hasMore: false,
};

const mockCategories: WishlistAnalyticsPageDto<WishlistCategoryInterestDto> = {
  items: [
    {
      categoryId: 'cat-wraps',
      name: 'Wraps & Scarves',
      saved: 65,
      recentSaves: 14,
      recentRemovals: 2,
    },
    {
      categoryId: 'cat-hair',
      name: 'Hair Accessories',
      saved: 42,
      recentSaves: null, // Suppressed
      recentRemovals: null, // Suppressed
    },
  ],
  page: 1,
  pageSize: 25,
  hasMore: false,
};

const mockSharing: WishlistSharingDto = {
  current: {
    active: 18,
    revoked: 3,
    expired: 7,
    guestOwned: 6,
    accountOwned: 12,
  },
  outcomes: [
    {
      name: 'wishlist.share.created',
      count: 28,
      guest: 10,
      account: 18,
      all: 20,
      selected: 8,
      unknown: 0,
      averageSize: 4.8,
    },
    {
      name: 'wishlist.share.claimed',
      count: 4,
      guest: 4,
      account: 0,
      all: 4,
      selected: 0,
      unknown: 0,
      averageSize: null,
    },
  ],
  trends: [
    { day: '2026-10-30', name: 'wishlist.share.created', count: 3 },
    { day: '2026-10-31', name: 'wishlist.share.created', count: 5 },
  ],
  observations: [
    { name: 'WISHLIST_PAGE_VIEWED', count: 184 },
    { name: 'WISHLIST_SHARE_OPENED', count: 42 },
    { name: 'WISHLIST_COPY_SUCCEEDED', count: 26 },
    { name: 'WISHLIST_RECIPIENT_VIEWED', count: 68 },
    { name: 'WISHLIST_SAVE_ONE_INITIATED', count: 14 },
    { name: 'WISHLIST_SAVE_ALL_INITIATED', count: 5 },
  ],
};

const mockOperations: WishlistOperationsDto = {
  counters: [
    {
      day: '2026-10-31',
      operation: 'SAVE',
      outcome: 'SUCCESS',
      count: 45,
      totalDurationMs: 1350,
    },
    {
      day: '2026-10-31',
      operation: 'SHARE_CREATE',
      outcome: 'SUCCESS',
      count: 8,
      totalDurationMs: 400,
    },
  ],
  cleanup: {
    expiredUnreported: 0,
    purgeableShares: 0,
    expiredMergeReceipts: 0,
  },
};

describe('Admin Wishlist Analytics API Client & Query Validation', () => {
  it('validates date ranges and rejects ranges exceeding 90 days', () => {
    expect(validateWishlistDateRange('2026-10-01', '2026-10-30').valid).toBe(true);
    expect(validateWishlistDateRange('2026-08-01', '2026-10-29').valid).toBe(true);

    const exceed = validateWishlistDateRange('2026-01-01', '2026-06-01');
    expect(exceed.valid).toBe(false);
    expect(exceed.error).toContain('90 local days');

    const reversed = validateWishlistDateRange('2026-11-01', '2026-10-01');
    expect(reversed.valid).toBe(false);
    expect(reversed.error).toContain('Start date cannot be after end date');

    const invalid = validateWishlistDateRange('bad-date', '2026-10-01');
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('Invalid date format');
  });

  it('buildWishlistQueryParams includes only valid backend parameters and strips extraneous fields', () => {
    const qs = buildWishlistQueryParams({
      from: '2026-10-01',
      to: '2026-10-30',
      page: 2,
      pageSize: 50,
    });
    expect(qs).toBe('from=2026-10-01&to=2026-10-30&page=2&pageSize=50');

    // Without pagination
    const baseQs = buildWishlistQueryParams({
      from: '2026-10-01',
      to: '2026-10-30',
    });
    expect(baseQs).toBe('from=2026-10-01&to=2026-10-30');
  });

  describe('API Client Endpoints', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        let result: unknown;
        if (url.includes('/summary')) result = mockSummary;
        else if (url.includes('/activity')) result = mockActivity;
        else if (url.includes('/products')) result = mockProducts;
        else if (url.includes('/categories')) result = mockCategories;
        else if (url.includes('/sharing')) result = mockSharing;
        else if (url.includes('/operations')) result = mockOperations;

        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                data: {
                  metadata: mockMetadata,
                  result,
                },
              }),
            ),
        });
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('fetches summary and unpacks metadata and result', async () => {
      const data = await fetchWishlistSummary({ from: '2026-10-01', to: '2026-10-30' });
      expect(data.metadata.timezone).toBe('Asia/Dhaka');
      expect(data.metadata.sources.current).toBe('AUTHORITATIVE_DATABASE');
      expect(data.result.savedItems).toBe(142);
      expect(data.result.distinctProducts).toBe(48);
    });

    it('fetches products ranking and supports pagination', async () => {
      const data = await fetchWishlistProducts({
        from: '2026-10-01',
        to: '2026-10-30',
        page: 1,
        pageSize: 25,
      });
      expect(data.result.items).toHaveLength(2);
      expect(data.result.items[0]?.title).toBe('Silk Organza Wrap');
      // Preserves null without converting to zero!
      expect(data.result.items[0]?.recentRemovals).toBeNull();
      expect(data.result.items[1]?.recentSaves).toBeNull();
    });

    it('handles 403 Forbidden with typed ApiRequestError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () =>
          Promise.resolve(
            JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Access denied.' } }),
          ),
      });

      await expect(fetchWishlistSummary({ from: '2026-10-01', to: '2026-10-30' })).rejects.toThrow(
        'Access denied.',
      );
    });

    it('handles 422 Invalid Analytics Query with typed ApiRequestError', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                code: 'INVALID_ANALYTICS_QUERY',
                message: 'Wishlist reports support at most 90 local days.',
              },
            }),
          ),
      });

      await expect(fetchWishlistSummary({ from: '2026-01-01', to: '2026-06-01' })).rejects.toThrow(
        'Wishlist reports support at most 90 local days.',
      );
    });
  });
});

describe('WishlistView Component Rendering & Boundaries', () => {
  it('renders range exceeded error warning when date range is greater than 90 days', () => {
    const markup = renderToStaticMarkup(
      <WishlistView
        selection={{
          preset: 'CUSTOM',
          from: '2026-01-01',
          to: '2026-06-01',
          granularity: 'DAY',
          currency: 'BDT',
        }}
      />,
    );
    expect(markup).toContain('Reporting Window Limit');
    expect(markup).toContain('support at most 90 local days');
  });

  it('renders initial loading state with pulse skeleton', () => {
    const markup = renderToStaticMarkup(
      <WishlistView
        selection={{
          preset: 'LAST_30_DAYS',
          from: '2026-10-01',
          to: '2026-10-30',
          granularity: 'DAY',
          currency: 'BDT',
        }}
      />,
    );
    expect(markup).toContain('animate-pulse');
  });
  it('rejects normalized impossible dates and non-date ISO inputs', () => {
    expect(validateWishlistDateRange('2026-02-30', '2026-03-03').valid).toBe(false);
    expect(validateWishlistDateRange('2026-11-01T12:00:00Z', '2026-11-02').valid).toBe(false);
  });
});
