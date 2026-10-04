'use client';

import React, { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminPage, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { ReviewsStatsStrip, type ReviewQueueCounts } from './reviews-stats-strip';
import { ReviewsTable, type AdminReviewListItem } from './reviews-table';
import { ReviewDetailDrawer } from './review-detail-drawer';
import { RebuildSummaryDialog } from './rebuild-summary-dialog';

export function ReviewsWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL state
  const queueParam = searchParams.get('queue') || 'PENDING';
  const searchParam = searchParams.get('search') || '';
  const ratingParam = searchParams.get('rating') || '';
  const sortParam = searchParams.get('sort') || 'NEWEST';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const selectedIdParam = searchParams.get('id');

  // Local state for debounced search and active filters
  const [searchTerm, setSearchTerm] = useState(searchParam);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  // Query results
  const [reviews, setReviews] = useState<readonly AdminReviewListItem[]>([]);
  const [counts, setCounts] = useState<ReviewQueueCounts | undefined>(undefined);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync search input with URL param changes
  useEffect(() => {
    setSearchTerm(searchParam);
  }, [searchParam]);

  // Update URL helper
  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, val]) => {
        if (val === null || val === '') {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      });
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Fetch reviews based on active URL parameters
  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (queueParam) q.set('queue', queueParam);
      if (searchParam) q.set('search', searchParam);
      if (ratingParam) q.set('rating', ratingParam);
      if (sortParam) q.set('sort', sortParam);
      if (pageParam > 1) q.set('page', String(pageParam));
      q.set('pageSize', '20');

      const res = await fetch(`/api/admin/reviews?${q.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to load reviews from admin moderation queue.');
      }
      const json = await res.json();
      setReviews(json.data ?? []);
      setCounts(json.counts);
      if (json.pagination) {
        setPagination(json.pagination);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching reviews');
    } finally {
      setLoading(false);
    }
  }, [queueParam, searchParam, ratingParam, sortParam, pageParam]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  // Debounced search submit
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateUrl({ search: searchTerm.trim() || null, page: '1' });
  }

  return (
    <AdminPage className="space-y-6">
      {/* Top Header */}
      <PageHeader
        eyebrow="Customer Trust & Reputation"
        title="Reviews Management"
        description="Monitor authentic customer product reviews, inspect verified orders, moderate policy compliance, and publish official Maevelle responses."
        actions={
          <>
            <RebuildSummaryDialog />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadReviews()}
              disabled={loading}
              className="h-9 gap-1.5 text-xs"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </>
        }
      />

      {/* Operational Queue KPI Strip */}
      <ReviewsStatsStrip
        counts={counts}
        activeQueue={queueParam}
        onSelectQueue={(q) => updateUrl({ queue: q, page: '1' })}
      />

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card shadow-2xs">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Search reviews by product, customer, or keyword..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </form>

        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Rating Filter */}
          <div className="w-36">
            <NativeSelect
              value={ratingParam}
              onChange={(e) => updateUrl({ rating: e.target.value || null, page: '1' })}
              className="h-9 text-xs"
            >
              <option value="">All Ratings</option>
              <option value="5">5 Stars only</option>
              <option value="4">4 Stars only</option>
              <option value="3">3 Stars only</option>
              <option value="2">2 Stars only</option>
              <option value="1">1 Star only</option>
            </NativeSelect>
          </div>

          {/* Sort Order */}
          <div className="w-36">
            <NativeSelect
              value={sortParam}
              onChange={(e) => updateUrl({ sort: e.target.value, page: '1' })}
              className="h-9 text-xs"
            >
              <option value="NEWEST">Newest first</option>
              <option value="OLDEST">Oldest first</option>
              <option value="RATING_DESC">Highest rating</option>
              <option value="RATING_ASC">Lowest rating</option>
            </NativeSelect>
          </div>

          {/* Density Toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-2.5 text-xs gap-1.5"
            onClick={() => setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))}
            title={`Toggle density (currently ${density})`}
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden md:inline capitalize">{density}</span>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadReviews()}>
            Try again
          </Button>
        </div>
      ) : null}

      {/* Reviews Table */}
      <ReviewsTable
        reviews={reviews}
        selectedId={selectedIdParam ?? undefined}
        onSelectReview={(id) => updateUrl({ id })}
        density={density}
        loading={loading}
      />

      {/* Pagination Footer */}
      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4 px-2 py-3 text-xs text-muted-foreground border-t border-border">
          <div className="font-mono">
            Showing Page <span className="font-bold text-foreground">{pagination.page}</span> of{' '}
            <span className="font-bold text-foreground">{pagination.totalPages}</span> ({pagination.totalItems} total reviews)
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={pagination.page <= 1 || loading}
              onClick={() => updateUrl({ page: String(pagination.page - 1) })}
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => updateUrl({ page: String(pagination.page + 1) })}
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Detailed Inspection Drawer */}
      <ReviewDetailDrawer
        reviewId={selectedIdParam}
        onClose={() => updateUrl({ id: null })}
        onModified={() => void loadReviews()}
      />
    </AdminPage>
  );
}
