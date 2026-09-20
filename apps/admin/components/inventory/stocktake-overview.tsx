'use client';

import { useEffect, useState, useMemo, useDeferredValue } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Search,
  ClipboardList,
  CheckCircle2,
  Clock,
  Building2,
  AlertCircle,
  XCircle,
  ArrowRight,
  RotateCcw,
  Calendar,
} from 'lucide-react';

import type {
  PaginatedDto,
  StocktakeSessionDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate } from '@/lib/inventory/api';
import {
  InventoryStatCards,
  InventoryEmptyState,
  InventoryPager,
} from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { OperationalFeedback } from '@/components/operational-worklist';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Status Config ────────────────────────────────────────────────────────────

interface StatusConfig {
  label: string;
  badgeClass: string;
  icon: typeof Clock;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  COUNTING: {
    label: 'In Progress',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 font-medium',
    icon: Clock,
  },
  REVIEW: {
    label: 'Awaiting Review',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 font-medium',
    icon: AlertCircle,
  },
  POSTED: {
    label: 'Reconciled',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-medium',
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeClass: 'bg-muted text-muted-foreground border-border font-medium',
    icon: XCircle,
  },
  DRAFT: {
    label: 'Draft',
    badgeClass: 'bg-secondary text-secondary-foreground border-border font-medium',
    icon: Clock,
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIGS[status] || {
    label: status,
    badgeClass: 'bg-muted text-muted-foreground',
    icon: Clock,
  };
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 ${config.badgeClass}`}>
      <Icon className="size-3 shrink-0" />
      <span>{config.label}</span>
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StocktakeOverview() {
  const router = useRouter();
  const searchParameters = useSearchParams();

  // URL state synchronization
  const queryParam = searchParameters.get('q') ?? '';
  const statusParam = searchParameters.get('status') ?? 'all';
  const locationParam = searchParameters.get('location') ?? 'all';
  const pageParam = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);

  const [search, setSearch] = useState(queryParam);
  const deferredSearch = useDeferredValue(search.trim());

  const [stocktakes, setStocktakes] = useState<readonly StocktakeSessionDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Sync state changes to URL query
  function updateQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'all' || (key === 'page' && value === '1')) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    router.replace(next.size ? `/inventory/stocktakes?${next.toString()}` : '/inventory/stocktakes', {
      scroll: false,
    });
  }

  // Handle live search input
  useEffect(() => {
    if (queryParam !== deferredSearch) {
      updateQuery({ q: deferredSearch || undefined, page: '1' });
    }
  }, [deferredSearch]);

  // Fetch facilities for location filter
  useEffect(() => {
    let active = true;
    inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations')
      .then((res) => {
        if (!active) return;
        setLocations(
          (res.data || []).filter(
            (loc) => loc.status === 'ACTIVE' && loc.capabilities.includes('STOCK_HOLDING'),
          ),
        );
      })
      .catch((err) => {
        if (active) console.error('Failed to load locations for filter:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch stocktake sessions
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    params.set('page', pageParam.toString());
    params.set('limit', '25');
    if (statusParam !== 'all') params.set('status', statusParam);
    if (locationParam !== 'all') params.set('locationId', locationParam);

    inventoryRequest<{ data: PaginatedDto<StocktakeSessionDto> }>(
      `/inventory/stocktakes?${params.toString()}`,
    )
      .then((res) => {
        if (!active) return;
        const items = res.data?.items ?? [];
        setStocktakes(items);
        setTotalCount(res.data?.totalCount ?? items.length);
        setHasNext(items.length === 25);
      })
      .catch((err) => {
        if (active) setErrorMessage(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pageParam, statusParam, locationParam]);

  // Client-side search filtering by stocktake number or location name
  const filteredStocktakes = useMemo(() => {
    if (!deferredSearch) return stocktakes;
    const lower = deferredSearch.toLowerCase();
    return stocktakes.filter(
      (s) =>
        s.stocktakeNumber.toLowerCase().includes(lower) ||
        s.locationName.toLowerCase().includes(lower),
    );
  }, [deferredSearch, stocktakes]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let activeCounts = 0;
    let pendingReview = 0;
    let posted = 0;

    for (const s of stocktakes) {
      if (s.status === 'COUNTING') activeCounts++;
      if (s.status === 'REVIEW') pendingReview++;
      if (s.status === 'POSTED') posted++;
    }

    return { activeCounts, pendingReview, posted };
  }, [stocktakes]);

  const hasActiveFilters = statusParam !== 'all' || locationParam !== 'all' || queryParam !== '';

  const clearFilters = () => {
    setSearch('');
    router.replace('/inventory/stocktakes', { scroll: false });
  };

  return (
    <main className="mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* Header Bar */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Stocktake Sessions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conduct physical counts, reconcile variances against snapshot baselines, and post adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            size="sm"
            render={<Link href="/inventory/stocktakes/new" />}
            className="h-9"
          >
            <Plus className="mr-1.5 size-3.5" /> Start Stocktake
          </Button>
        </div>
      </header>

      {/* Reusable Stats Box */}
      <InventoryStatCards
        stats={[
          {
            label: 'In Progress Counts',
            value: metrics.activeCounts,
            description: 'Physical floor counts underway',
          },
          {
            label: 'Awaiting Review',
            value: metrics.pendingReview,
            description: 'Counts complete, pending sign-off',
          },
          {
            label: 'Reconciled Audits',
            value: metrics.posted,
            description: 'Posted and ledger-reconciled',
          },
          {
            label: 'Total Sessions',
            value: totalCount,
            description: 'All recorded physical stocktakes',
          },
        ]}
      />

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search by stocktake number or facility…"
            className="pl-9 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Facility Location Filter */}
          <Select
            value={locationParam}
            onValueChange={(val) => updateQuery({ location: val || 'all', page: '1' })}
          >
            <SelectTrigger className="h-9 min-w-44 text-xs">
              <SelectValue placeholder="All Warehouses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="All Warehouses">
                All Warehouses
              </SelectItem>
              {locations.map((loc) => (
                <SelectItem
                  key={loc.id}
                  value={loc.id}
                  label={`${loc.name} (${loc.code})`}
                  description={`${loc.locationType.replace('_', ' ')} · Active`}
                >
                  {loc.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">({loc.code})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={statusParam}
            onValueChange={(val) => updateQuery({ status: val || 'all', page: '1' })}
          >
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="COUNTING">In Progress</SelectItem>
              <SelectItem value="REVIEW">Awaiting Review</SelectItem>
              <SelectItem value="POSTED">Reconciled</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Reset Filters */}
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Reset all filters"
            >
              <RotateCcw className="mr-1 size-3.5" /> Clear
            </Button>
          ) : null}
        </div>
      </div>

      {/* Error Feedback */}
      {errorMessage ? (
        <OperationalFeedback tone="danger">{errorMessage}</OperationalFeedback>
      ) : null}

      {/* Content Area */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 w-full animate-pulse bg-muted rounded-lg border" />
          ))}
        </div>
      ) : filteredStocktakes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center text-xs text-muted-foreground">
          <ClipboardList className="size-10 stroke-1 text-muted-foreground/60 mb-2" />
          <p className="font-semibold text-sm text-foreground">
            {hasActiveFilters ? 'No Matching Stocktakes' : 'No Physical Stocktakes Recorded'}
          </p>
          <p className="mt-1 max-w-sm">
            {hasActiveFilters
              ? 'No stocktake sessions match the selected filters. Try clearing or adjusting your criteria.'
              : 'Physical stocktakes allow you to perform cycle counts and reconcile variances across warehouse facilities.'}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <RotateCcw className="mr-1.5 size-3.5" /> Reset Filters
              </Button>
            ) : (
              <Button size="sm" render={<Link href="/inventory/stocktakes/new" />}>
                <Plus className="mr-1.5 size-3.5" /> Start First Stocktake
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-lg border bg-card overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 font-medium text-muted-foreground">
                  <th className="py-3 px-4">Session Number</th>
                  <th className="py-3 px-4">Warehouse Depot</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Counting Progress</th>
                  <th className="py-3 px-4">Snapshot Started</th>
                  <th className="py-3 px-4">Completed</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredStocktakes.map((session) => {
                  const percent =
                    session.totalLines > 0
                      ? Math.round((session.countedLines / session.totalLines) * 100)
                      : 0;

                  return (
                    <tr
                      key={session.id}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      {/* Session ID */}
                      <td className="py-3 px-4 font-medium">
                        <Link
                          href={`/inventory/stocktakes/${session.id}`}
                          className="flex items-center gap-2 font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          <ClipboardList className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span>{session.stocktakeNumber}</span>
                        </Link>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                          <Building2 className="size-3.5 text-muted-foreground" />
                          <span>{session.locationName}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={session.status} />
                      </td>

                      {/* Counting Progress */}
                      <td className="py-3 px-4 min-w-44">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">
                              {session.countedLines} / {session.totalLines} SKUs
                            </span>
                            <span className="font-semibold">{percent}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                session.status === 'POSTED'
                                  ? 'bg-emerald-500'
                                  : session.status === 'REVIEW'
                                    ? 'bg-amber-500'
                                    : 'bg-primary'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Snapshot Time */}
                      <td className="py-3 px-4 text-muted-foreground">
                        {formatInventoryDate(session.snapshotAt)}
                      </td>

                      {/* Completed Time */}
                      <td className="py-3 px-4 text-muted-foreground">
                        {session.postedAt ? formatInventoryDate(session.postedAt) : '—'}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<Link href={`/inventory/stocktakes/${session.id}`} />}
                          className="h-7 text-xs font-medium"
                        >
                          {session.status === 'COUNTING'
                            ? 'Count'
                            : session.status === 'REVIEW'
                              ? 'Review'
                              : 'View'}
                          <ArrowRight className="ml-1 size-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredStocktakes.map((session) => {
              const percent =
                session.totalLines > 0
                  ? Math.round((session.countedLines / session.totalLines) * 100)
                  : 0;

              return (
                <div
                  key={session.id}
                  className="rounded-lg border bg-card p-3.5 space-y-3 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/inventory/stocktakes/${session.id}`}
                      className="font-semibold text-sm text-foreground hover:text-primary hover:underline flex items-center gap-1.5"
                    >
                      <ClipboardList className="size-4 text-muted-foreground" />
                      <span>{session.stocktakeNumber}</span>
                    </Link>
                    <StatusBadge status={session.status} />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="size-3.5 shrink-0" />
                    <span className="font-medium text-foreground">{session.locationName}</span>
                  </div>

                  {/* Progress */}
                  <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        Progress: {session.countedLines} of {session.totalLines} counted
                      </span>
                      <span className="font-semibold">{percent}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          session.status === 'POSTED'
                            ? 'bg-emerald-500'
                            : session.status === 'REVIEW'
                              ? 'bg-amber-500'
                              : 'bg-primary'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                    <div className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      <span>{formatInventoryDate(session.snapshotAt)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/inventory/stocktakes/${session.id}`} />}
                      className="h-7 text-xs"
                    >
                      {session.status === 'COUNTING'
                        ? 'Count Sheet'
                        : session.status === 'REVIEW'
                          ? 'Review Variance'
                          : 'Details'}
                      <ArrowRight className="ml-1 size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {(hasNext || pageParam > 1) && (
            <InventoryPager
              page={pageParam}
              hasNext={hasNext}
              onPageChange={(p) => updateQuery({ page: String(p) })}
            />
          )}
        </div>
      )}
    </main>
  );
}
