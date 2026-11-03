'use client';

import * as React from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  Heart,
  Layers,
  Package,
  RefreshCw,
  Share2,
  ShieldCheck,
  Table as TableIcon,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState, ErrorState, PagePanel, PageSection } from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MetricCard } from '../analytics-kpi-card';
import { hasWishlistDayCoverage } from '@/lib/analytics/wishlist-coverage';
import { useWishlistAnalytics } from '../use-wishlist-analytics';
import {
  formatAnalyticsCount,
  type DateRangeSelection,
  type WishlistTrendDto,
} from '@/lib/analytics/types';

interface WishlistViewProps {
  readonly selection: DateRangeSelection;
  readonly refreshVersion?: number;
  readonly onTimezoneChange?: (timezone: string) => void;
  readonly onSwitchPreset?: (preset: 'LAST_30_DAYS' | 'LAST_90_DAYS') => void;
}

export function WishlistView({
  selection,
  onSwitchPreset,
  refreshVersion = 0,
  onTimezoneChange,
}: WishlistViewProps) {
  const reducedMotion = useReducedMotion();
  const [activityViewMode, setActivityViewMode] = React.useState<'chart' | 'table'>('chart');
  const {
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
  } = useWishlistAnalytics(selection, refreshVersion);

  React.useEffect(() => {
    if (metadata) onTimezoneChange?.(metadata.timezone);
  }, [metadata, onTimezoneChange]);

  // 3. Error and Authorization States
  if (!dateValidation.valid || error?.code === 'RANGE_EXCEEDED') {
    return (
      <PagePanel className="border-warning/60 bg-warning/5 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-warning/20 text-warning mx-auto mb-3">
          <AlertTriangle className="size-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Reporting Window Limit</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Wishlist analytics queries support at most 90 local days due to bounded analytical storage
          and outbox projection boundaries.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          {onSwitchPreset ? (
            <Button variant="default" size="sm" onClick={() => onSwitchPreset('LAST_90_DAYS')}>
              Switch to Last 90 Days
            </Button>
          ) : null}
          {onSwitchPreset ? (
            <Button variant="outline" size="sm" onClick={() => onSwitchPreset('LAST_30_DAYS')}>
              Switch to Last 30 Days
            </Button>
          ) : null}
        </div>
      </PagePanel>
    );
  }

  if (error) {
    if (error.code === 'FORBIDDEN' || error.message.includes('Access denied')) {
      return (
        <ErrorState
          title="Access Restricted"
          message="You do not have the required analytics.view capability to access Wishlist analytics."
          onRetry={() => setRefreshIndex((i) => i + 1)}
        />
      );
    }

    return (
      <ErrorState
        title="Failed to Load Wishlist Analytics"
        message={error.message}
        onRetry={() => setRefreshIndex((i) => i + 1)}
      />
    );
  }

  // 4. Loading Skeleton
  if (loading && !summary) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-card border border-border/70 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-card border border-border/70 rounded-xl" />
          <div className="h-28 bg-card border border-border/70 rounded-xl" />
          <div className="h-28 bg-card border border-border/70 rounded-xl" />
          <div className="h-28 bg-card border border-border/70 rounded-xl" />
        </div>
        <div className="h-72 bg-card border border-border/70 rounded-xl" />
        <div className="h-64 bg-card border border-border/70 rounded-xl" />
      </div>
    );
  }

  // 5. Data Calculations
  const isLagging = metadata?.projection === 'LAGGING';
  const isFailed = metadata?.projection === 'FAILED';
  const historyComplete = metadata?.historyComplete ?? true;
  const instrumentationStart = metadata?.instrumentationStart
    ? new Date(metadata.instrumentationStart).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="space-y-8">
      {/* ==================================================================== */}
      {/* 1. Freshness, Completeness & Source Metadata Banner */}
      {/* ==================================================================== */}
      <PagePanel className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border-border/80 bg-muted/20">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-foreground tracking-tight">
              Wishlist Intelligence Pipeline
            </span>
            {isFailed ? (
              <StatusBadge status="FAILED" tone="danger" />
            ) : isLagging ? (
              <StatusBadge status="PENDING" tone="warning" />
            ) : (
              <StatusBadge status="HEALTHY" tone="success" />
            )}
            {!historyComplete ? (
              <StatusBadge status="REVIEW" tone="warning" />
            ) : (
              <StatusBadge status="COMPLETED" tone="success" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Current-state metrics derive from authoritative accounts. Trends and lifecycle events
            reflect transactional outbox projections.
            {instrumentationStart ? ` Activity tracking began on ${instrumentationStart}.` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex items-center gap-1 cursor-help border border-border/70 bg-card px-2.5 py-1 rounded-md" />
              }
            >
              <Database className="size-3.5 text-primary" />
              <span>Multi-Source Integrity</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
              <p className="font-semibold text-foreground">Analytical Sources</p>
              <p>• Account State: Authoritative DB</p>
              <p>• Save/Remove Activity: Committed Outbox</p>
              <p>• Behavioral Signals: Consented Storefront</p>
              <p>• Operational Health: HTTP Counters</p>
            </TooltipContent>
          </Tooltip>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setRefreshIndex((i) => i + 1)}
          >
            <RefreshCw className="size-3" />
            <span>Refresh</span>
          </Button>
        </div>
      </PagePanel>

      {/* ==================================================================== */}
      {/* 2. Section 1: Summary KPIs */}
      {/* ==================================================================== */}
      <PageSection
        title="Wishlist Overview & Demand"
        description="Authoritative current holdings across customer accounts and stock availability health."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Saved Items in Accounts"
            value={formatAnalyticsCount(summary?.savedItems)}
            subtitle="Current active items across all customer wishlists"
            definitionTooltip="Real-time count of wishlist item records persisted in verified customer accounts. Excludes deleted items and unpersisted guest carts."
            icon={Heart}
          />
          <MetricCard
            title="Distinct Products Saved"
            value={formatAnalyticsCount(summary?.distinctProducts)}
            subtitle="Catalog items with at least one active save"
            definitionTooltip="Count of distinct sellable catalog products currently present in at least one customer account wishlist."
            icon={Package}
          />
          <MetricCard
            title="Customer Wishlists"
            value={
              <span className="tabular-nums font-mono">
                {formatAnalyticsCount(summary?.nonemptyLists)}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  / {formatAnalyticsCount(summary?.lists)} total
                </span>
              </span>
            }
            subtitle="Non-empty lists vs total registered lists"
            definitionTooltip="Created account wishlists containing one or more items versus total registered account wishlists."
            icon={Users}
          />
          <MetricCard
            title="Availability Health"
            value={
              <span className="tabular-nums font-mono text-success">
                {formatAnalyticsCount(summary?.availableItems)}
                <span className="text-xs font-normal text-muted-foreground ml-1">available</span>
              </span>
            }
            subtitle={`${formatAnalyticsCount(summary?.outOfStockItems)} out of stock · ${formatAnalyticsCount(summary?.unavailableItems)} unlisted`}
            definitionTooltip="Inventory and catalog publication status of currently wishlisted items. Stock availability reflects latest search index projections."
            icon={CheckCircle2}
          />
        </div>
      </PageSection>

      {/* ==================================================================== */}
      {/* 3. Section 2: Wishlist Activity Trends */}
      {/* ==================================================================== */}
      <PageSection
        title="Wishlist Save & Removal Transitions"
        description="Historical outbox events committed by authenticated customers and merge operations."
        actions={
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/70">
            <Button
              type="button"
              variant={activityViewMode === 'chart' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => setActivityViewMode('chart')}
            >
              <BarChart3 className="size-3.5" />
              <span>Trend Chart</span>
            </Button>
            <Button
              type="button"
              variant={activityViewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => setActivityViewMode('table')}
            >
              <TableIcon className="size-3.5" />
              <span>Data Table</span>
            </Button>
          </div>
        }
      >
        <PagePanel className="p-4 sm:p-5">
          {!activity || activity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No Activity in Period"
              description="No save or removal transitions recorded for the selected date range."
            />
          ) : activityViewMode === 'chart' ? (
            <div className="w-full space-y-3">
              <div style={{ height: 280 }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={activity.map((row) =>
                      hasWishlistDayCoverage(row.day, metadata)
                        ? row
                        : { ...row, saved: null, removed: null },
                    )}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="savesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="removesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickMargin={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(val: number) => `${val}`}
                    />
                    <RechartsTooltip
                      content={({ active: tooltipActive, payload, label }) => {
                        if (!tooltipActive || !payload?.length) return null;
                        const data = payload[0]?.payload as WishlistTrendDto;
                        return (
                          <div className="rounded-lg border border-border bg-card p-3 shadow-md text-xs space-y-1.5 min-w-44">
                            <p className="font-semibold text-foreground">{label}</p>
                            <div className="flex items-center justify-between text-primary">
                              <span>New Saves:</span>
                              <span className="font-mono font-semibold tabular-nums">
                                +{data.saved}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-destructive">
                              <span>Removals:</span>
                              <span className="font-mono font-semibold tabular-nums">
                                -{data.removed}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground border-t border-border/70 pt-1">
                              <span>Merge Additions:</span>
                              <span className="font-mono tabular-nums">{data.mergeAdditions}</span>
                            </div>
                            <div className="flex items-center justify-between text-foreground font-semibold border-t border-border/70 pt-1">
                              <span>Net Transition:</span>
                              <span className="font-mono tabular-nums">
                                {data.net > 0 ? `+${data.net}` : data.net}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      isAnimationActive={!reducedMotion}
                      type="monotone"
                      dataKey="saved"
                      name="Saves"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#savesGrad)"
                    />
                    <Area
                      isAnimationActive={!reducedMotion}
                      type="monotone"
                      dataKey="removed"
                      name="Removals"
                      stroke="var(--destructive)"
                      strokeWidth={2}
                      fill="url(#removesGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-xs text-muted-foreground border-t border-border/60">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-primary" />
                  <span>New Saves (Manual + Merge)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-destructive" />
                  <span>Account Removals</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground/80">
                  <Clock className="size-3" />
                  <span>Bucketed to {metadata?.timezone ?? 'the organization timezone'}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Accessible Table View */
            <div className="rounded-lg border border-border/70 overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Saves</TableHead>
                    <TableHead className="text-right">Removals</TableHead>
                    <TableHead className="text-right">Merge Additions</TableHead>
                    <TableHead className="text-right">Completed Merges</TableHead>
                    <TableHead className="text-right">Net Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((row) => (
                    <TableRow key={row.day}>
                      <TableCell className="font-mono text-xs">{row.day}</TableCell>
                      {hasWishlistDayCoverage(row.day, metadata) ? (
                        <>
                          <TableCell className="text-right font-mono tabular-nums text-primary">
                            +{row.saved}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-destructive">
                            -{row.removed}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                            {row.mergeAdditions}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                            {row.merges}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-semibold">
                            {row.net > 0 ? `+${row.net}` : row.net}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell colSpan={5} className="text-right text-muted-foreground">
                          Not measured
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </PagePanel>
      </PageSection>

      {/* ==================================================================== */}
      {/* 4. Section 3: Product Demand & Interest Rankings */}
      {/* ==================================================================== */}
      <PageSection
        title="Saved Products Ranking"
        description="Ranked by current account wishlist holdings. Recent saves and removals within the reporting period respect suppression thresholds."
      >
        <PagePanel className="p-0 overflow-hidden">
          {!productsPage || productsPage.items.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Package}
                title="No Product Interest Recorded"
                description="Products require saves from at least 3 distinct customer accounts to establish an analytical cohort."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table density="comfortable">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Availability</TableHead>
                      <TableHead className="text-right">Current Saves</TableHead>
                      <TableHead className="text-right">Recent Saves</TableHead>
                      <TableHead className="text-right">Recent Removals</TableHead>
                      <TableHead className="w-16 text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsPage.items.map((prod, idx) => {
                      const rank = (productsPage.page - 1) * productsPage.pageSize + idx + 1;
                      return (
                        <TableRow key={prod.productId}>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {rank}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground text-sm line-clamp-1">
                                {prod.title}
                              </span>
                              <span className="text-[11px] font-mono text-muted-foreground/80">
                                {prod.productId}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {prod.available === true ? (
                              <StatusBadge status="ACTIVE" tone="success" />
                            ) : prod.available === false ? (
                              <StatusBadge status="OUT_OF_STOCK" tone="warning" />
                            ) : (
                              <StatusBadge status="ARCHIVED" tone="neutral" />
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums font-semibold text-foreground">
                            {formatAnalyticsCount(prod.saved)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {prod.recentSaves === null ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="text-muted-foreground/50 cursor-help select-none">
                                      —
                                    </span>
                                  }
                                />
                                <TooltipContent side="top" className="text-xs">
                                  Suppressed: fewer than 3 events in period
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-primary">+{prod.recentSaves}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {prod.recentRemovals === null ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="text-muted-foreground/50 cursor-help select-none">
                                      —
                                    </span>
                                  }
                                />
                                <TooltipContent side="top" className="text-xs">
                                  Suppressed: fewer than 3 events in period
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-destructive">-{prod.recentRemovals}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Link
                              href={`/products/${prod.productId}`}
                              className="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="View product in catalog"
                            >
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Server-Side Pagination Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/70 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Page Size:</span>
                  <NativeSelect
                    value={productPageSize}
                    onChange={(e) => handleProductPageSizeChange(Number(e.target.value))}
                    className="h-8 w-20 text-xs"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </NativeSelect>
                  <span className="text-muted-foreground/80 pl-2">
                    Showing page {productsPage.page}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1"
                    disabled={productsPage.page <= 1 || loading}
                    onClick={() => handleProductPageChange(productsPage.page - 1)}
                  >
                    <ChevronLeft className="size-3.5" />
                    <span>Previous</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1"
                    disabled={!productsPage.hasMore || loading}
                    onClick={() => handleProductPageChange(productsPage.page + 1)}
                  >
                    <span>Next</span>
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </PagePanel>
      </PageSection>

      {/* ==================================================================== */}
      {/* 5. Section 4: Category Interest Breakdown */}
      {/* ==================================================================== */}
      <PageSection
        title="Category Interest Breakdown"
        description="Current account wishlist demand aggregated by primary canonical catalog category."
      >
        <PagePanel className="p-0 overflow-hidden">
          {!categoriesPage || categoriesPage.items.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Layers}
                title="No Category Breakdown Available"
                description="Category interest reflects primary categories of items in customer account wishlists."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <Table density="comfortable">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current Saved Items</TableHead>
                    <TableHead className="text-right">Recent Saves</TableHead>
                    <TableHead className="text-right">Recent Removals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoriesPage.items.map((cat) => (
                    <TableRow key={cat.categoryId ?? 'uncategorized'}>
                      <TableCell className="font-medium text-foreground">
                        {cat.name || 'Uncategorized'}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {formatAnalyticsCount(cat.saved)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {cat.recentSaves === null ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="text-muted-foreground/50 cursor-help select-none">
                                  —
                                </span>
                              }
                            />
                            <TooltipContent side="top" className="text-xs">
                              Suppressed: fewer than 3 events in period
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-primary">+{cat.recentSaves}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {cat.recentRemovals === null ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="text-muted-foreground/50 cursor-help select-none">
                                  —
                                </span>
                              }
                            />
                            <TooltipContent side="top" className="text-xs">
                              Suppressed: fewer than 3 events in period
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-destructive">-{cat.recentRemovals}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Category Server-Side Pagination Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/70 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Page Size:</span>
                  <NativeSelect
                    value={categoryPageSize}
                    onChange={(e) => handleCategoryPageSizeChange(Number(e.target.value))}
                    className="h-8 w-20 text-xs"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </NativeSelect>
                  <span className="text-muted-foreground/80 pl-2">
                    Showing page {categoriesPage.page}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1"
                    disabled={categoriesPage.page <= 1 || loading}
                    onClick={() => handleCategoryPageChange(categoriesPage.page - 1)}
                  >
                    <ChevronLeft className="size-3.5" />
                    <span>Previous</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1"
                    disabled={!categoriesPage.hasMore || loading}
                    onClick={() => handleCategoryPageChange(categoriesPage.page + 1)}
                  >
                    <span>Next</span>
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </PagePanel>
      </PageSection>

      {/* ==================================================================== */}
      {/* 6. Section 5: Sharing Lifecycle & Observed Interactions */}
      {/* ==================================================================== */}
      <PageSection
        title="Sharing Analytics & Lifecycle Outcomes"
        description="Shared collection lifecycles, creator origins, and unverified storefront observation counts."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Active Shared Collections"
            value={formatAnalyticsCount(sharing?.current.active)}
            subtitle="Currently valid unrevoked links"
            definitionTooltip="Shares currently active, unrevoked, and unexpired. Retained according to lifecycle rules."
            icon={Share2}
          />
          <MetricCard
            title="Collection Ownership"
            value={
              <span className="tabular-nums font-mono">
                {formatAnalyticsCount(sharing?.current.accountOwned)}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  Account / {formatAnalyticsCount(sharing?.current.guestOwned)} Guest
                </span>
              </span>
            }
            subtitle="All retained collections by current owner"
            definitionTooltip="Claiming a guest collection transfers ownership to the account without rewriting its immutable creation origin."
            icon={Users}
          />
          <MetricCard
            title="Expired / Revoked Shares"
            value={
              <span className="tabular-nums font-mono">
                {formatAnalyticsCount(sharing?.current.expired)}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  Expired / {formatAnalyticsCount(sharing?.current.revoked)} Revoked
                </span>
              </span>
            }
            subtitle="Past-lifecycle collections"
            definitionTooltip="Collections that reached expiration or were explicitly revoked by the owner before expiration."
            icon={Clock}
          />
          <MetricCard
            title="Avg Shared Collection Size"
            value={
              <span className="tabular-nums font-mono">
                {sharing?.outcomes.find((o) => o.name === 'wishlist.share.created')?.averageSize !==
                  null &&
                sharing?.outcomes.find((o) => o.name === 'wishlist.share.created')?.averageSize !==
                  undefined
                  ? `${sharing.outcomes.find((o) => o.name === 'wishlist.share.created')!.averageSize!.toFixed(1)} items`
                  : '—'}
              </span>
            }
            subtitle="At creation snapshot moment"
            definitionTooltip="Average count of distinct products captured when shared collections were generated in this period."
            icon={Layers}
          />
        </div>

        {/* Lifecycle Transitions & Scope Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Left: Transactional Outcomes */}
          <PagePanel className="p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Lifecycle Transition Outcomes</h3>
            <p className="text-xs text-muted-foreground">
              Committed outbox domain events. A claim transfer or link rotation does not count as a
              new share creation.
            </p>
            <div className="rounded-lg border border-border/70 overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Outcome Event</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Guest / Account</TableHead>
                    <TableHead className="text-right">Scope (All / Sel)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sharing?.outcomes && sharing.outcomes.length > 0 ? (
                    sharing.outcomes.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-mono text-xs">
                          {row.name.replace('wishlist.share.', '')}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {row.count}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                          {row.guest} / {row.account}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                          {row.all} / {row.selected}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-xs text-muted-foreground py-4"
                      >
                        No sharing lifecycle transitions recorded in period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </PagePanel>

          {/* Right: Consented Storefront Observations */}
          <PagePanel className="p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Storefront Behavioral Observations
            </h3>
            <p className="text-xs text-muted-foreground">
              Consented browser interaction telemetry. Deduplicated by stable event ID, limited to
              90 days retention.
            </p>
            <div className="rounded-lg border border-border/70 overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Observation Signal</TableHead>
                    <TableHead className="text-right">Observed Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sharing?.observations && sharing.observations.length > 0 ? (
                    sharing.observations.map((obs) => (
                      <TableRow key={obs.name}>
                        <TableCell className="font-mono text-xs text-foreground">
                          {obs.name}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {formatAnalyticsCount(obs.count)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="text-center text-xs text-muted-foreground py-4"
                      >
                        No consented browser observations recorded in period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </PagePanel>
        </div>

        {/* Honest Measurement Limitations Notice */}
        <PagePanel className="border-border/80 bg-muted/20 p-4 text-xs space-y-2 mt-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="size-4 text-primary" />
            <span>Honest Telemetry Boundaries & Privacy Protections</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              <strong>Verified unique recipients are unavailable:</strong> HTTP open counts include
              crawlers, link previewers, and repeated page reloads. They are validated requests, not
              unique human visitors.
            </li>
            <li>
              <strong>Verified share-to-save conversion is unavailable:</strong> A browser Save One
              or Save All click is an unverified client initiation signal, not a verified
              transaction attribution.
            </li>
            <li>
              <strong>Customer privacy guaranteed:</strong> Observation payloads transmit only
              action names, session UUIDs, and mode (GUEST/ACCOUNT). No tokens, URLs, customer IDs,
              or private wishlist contents are recorded.
            </li>
          </ul>
        </PagePanel>
      </PageSection>

      {/* ==================================================================== */}
      {/* 7. Section 6: Operational Health & Processing Diagnostics */}
      {/* ==================================================================== */}
      <PageSection
        title="Wishlist Operational Diagnostics & Pipeline Health"
        description="HTTP counter outcomes, analytical projection status, and lifecycle cleanup backlog."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PagePanel className="p-4 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Worker & Projection State
            </span>
            <div className="flex items-center gap-2 pt-1">
              {isFailed ? (
                <StatusBadge status="FAILED" tone="danger" />
              ) : isLagging ? (
                <StatusBadge status="PENDING" tone="warning" />
              ) : (
                <StatusBadge status="HEALTHY" tone="success" />
              )}
              <span className="font-mono text-xs text-muted-foreground">
                {metadata?.pendingEvents ?? 0} pending events
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Last processed:{' '}
              <span className="font-mono">
                {metadata?.lastProcessedAt
                  ? new Date(metadata.lastProcessedAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
            </p>
          </PagePanel>

          <PagePanel className="p-4 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lifecycle Retention Backlog
            </span>
            <div className="space-y-1 pt-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expired Unreported:</span>
                <span className="font-semibold text-foreground">
                  {operations?.cleanup.expiredUnreported ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Purgeable Shares (&gt;30d):</span>
                <span className="font-semibold text-foreground">
                  {operations?.cleanup.purgeableShares ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expired Merge Receipts (&gt;90d):</span>
                <span className="font-semibold text-foreground">
                  {operations?.cleanup.expiredMergeReceipts ?? 0}
                </span>
              </div>
            </div>
          </PagePanel>

          <PagePanel className="p-4 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Privacy Minimization
            </span>
            <div className="flex items-center gap-2 pt-1">
              <StatusBadge status="ACTIVE" tone="success" />
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Historical activity cells with 1–2 events per product/category are withheld as null to
              prevent individual customer preference re-identification.
            </p>
          </PagePanel>
        </div>

        {/* Operational HTTP Counters Table */}
        {operations?.counters && operations.counters.length > 0 ? (
          <PagePanel className="p-4 sm:p-5 space-y-3 mt-4">
            <h3 className="text-sm font-semibold text-foreground">
              HTTP Operations & Latency Overview
            </h3>
            <p className="text-xs text-muted-foreground">
              Best-effort daily counters recorded after response delivery.
            </p>
            <div className="rounded-lg border border-border/70 overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.counters.map((c, i) => {
                    const avgMs = c.count > 0 ? Math.round(c.totalDurationMs / c.count) : 0;
                    return (
                      <TableRow key={`${c.day}-${c.operation}-${c.outcome}-${i}`}>
                        <TableCell className="font-mono text-xs">{c.day}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-foreground">
                          {c.operation}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={c.outcome}
                            tone={
                              c.outcome === 'SUCCESS'
                                ? 'success'
                                : c.outcome === 'CLIENT_ERROR'
                                  ? 'warning'
                                  : 'danger'
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatAnalyticsCount(c.count)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {avgMs} ms
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </PagePanel>
        ) : null}
      </PageSection>
    </div>
  );
}
