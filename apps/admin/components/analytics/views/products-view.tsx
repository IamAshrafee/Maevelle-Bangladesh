'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowDownUp,
  Boxes,
  ExternalLink,
  PackageSearch,
  Percent,
  TrendingUp,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState, ErrorState, LoadingState, PagePanel, PageSection } from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MetricCard } from '../analytics-kpi-card';
import {
  formatAnalyticsCount,
  formatAnalyticsMoney,
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type ProductsReportBreakdownDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface ProductsViewProps {
  readonly selection: DateRangeSelection;
}

export function ProductsView({ selection }: ProductsViewProps) {
  const [report, setReport] = React.useState<AnalyticsReportEnvelopeDto<unknown, unknown, ProductsReportBreakdownDto> | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsReport<unknown, unknown, ProductsReportBreakdownDto>(
        'PRODUCTS',
        {
          ...selection,
          page,
          pageSize,
        },
      );
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load product analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection, page, pageSize]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggregate stats from current page & totalItems
  const rows = report?.breakdown ?? [];
  const totalItems = report?.pagination.totalItems ?? 0;
  const totalPages = report?.pagination.totalPages ?? 1;

  const totalUnits = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  const totalSales = rows.reduce((sum, r) => sum + Number(r.net_sales || 0), 0);

  const hasRestrictedCost = rows.some((r) => r.profitability_status === 'RESTRICTED');
  const hasPartialCost = rows.some((r) => r.profitability_status === 'PARTIAL');

  const recognizedCostSum = rows.reduce(
    (sum, r) => (r.recognized_cost ? sum + Number(r.recognized_cost) : sum),
    0,
  );
  const grossMarginSum = rows.reduce(
    (sum, r) => (r.gross_margin ? sum + Number(r.gross_margin) : sum),
    0,
  );

  return (
    <div className="space-y-6">
      {/* 1. Products Summary KPIs */}
      <PageSection
        title="Product & Variant Demand"
        description="Sellable SKU-level commercial performance. Historical sales preserve their immutable title and variant snapshots."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Active SKUs Sold"
            value={formatAnalyticsCount(totalItems)}
            subtitle="Distinct product variants"
            definitionTooltip="Total unique SKU/Variant positions with active order commitments in this period."
            loading={loading}
          />

          <MetricCard
            title="Units Dispatched / Sold"
            value={formatAnalyticsCount(totalUnits)}
            subtitle="Cumulative items ordered"
            definitionTooltip="Total quantity of physical units committed across all eligible orders in this period."
            loading={loading}
          />

          <MetricCard
            title="Total Realized Net Sales"
            value={formatAnalyticsMoney(totalSales, selection.currency)}
            subtitle="Page 1 aggregate net value"
            definitionTooltip="Sum of net product amount minus refunds attributed proportionally to lines."
            loading={loading}
          />

          <MetricCard
            title="Recognized Gross Profit"
            value={
              hasRestrictedCost
                ? 'Restricted'
                : hasPartialCost
                  ? `${formatAnalyticsMoney(grossMarginSum, selection.currency)}*`
                  : formatAnalyticsMoney(grossMarginSum, selection.currency)
            }
            status={
              hasRestrictedCost ? 'RESTRICTED' : hasPartialCost ? 'PARTIAL' : 'AVAILABLE'
            }
            statusLabel={
              hasRestrictedCost
                ? 'Permission Restricted'
                : hasPartialCost
                  ? 'Partial Landed Cost'
                  : 'Fully Costed'
            }
            subtitle={
              hasRestrictedCost
                ? 'Requires analytics.financial.view'
                : hasPartialCost
                  ? '*Some units lack finalized landed costs'
                  : 'Realized gross margin'
            }
            definitionTooltip="Net Sales minus authoritative COGS recognized at outbound fulfillment. Returns recovery is appended on return receipts."
            loading={loading}
          />
        </div>
      </PageSection>

      {/* 2. Top Products Table */}
      <PageSection
        title="Product Performance Rankings"
        description="Inspect sales volume, units sold, and recognized margins per sellable SKU."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Page size:</span>
            <div className="w-24">
              <NativeSelect
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 text-xs bg-background"
              >
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </NativeSelect>
            </div>
          </div>
        }
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Product Snapshot</TableHead>
                <TableHead>Variant Details</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Units Sold</TableHead>
                <TableHead className="text-right">Net Sales</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Margin</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={9} className="py-4">
                      <div className="h-4 bg-muted/60 rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground">
                    No products sold during the selected date window.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const marginPct =
                    row.gross_margin !== null && Number(row.net_sales) > 0
                      ? (Number(row.gross_margin) / Number(row.net_sales)) * 100
                      : null;

                  return (
                    <TableRow key={`${row.product_id}-${row.variant_id}-${row.sku_snapshot}`}>
                      <TableCell className="max-w-[220px]">
                        <span className="font-medium text-foreground truncate block" title={row.product_title_snapshot}>
                          {row.product_title_snapshot}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[180px] text-xs text-muted-foreground truncate" title={row.variant_title_snapshot}>
                        {row.variant_title_snapshot || 'Default Variant'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground font-medium">
                        {row.sku_snapshot}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums font-semibold text-foreground">
                        {formatAnalyticsCount(row.quantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-foreground">
                        {formatAnalyticsMoney(row.net_sales, row.currency_code)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {row.profitability_status === 'RESTRICTED' ? (
                          <span>—</span>
                        ) : row.recognized_cost !== null ? (
                          formatAnalyticsMoney(row.recognized_cost, row.currency_code)
                        ) : (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">Unfinalized</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {row.profitability_status === 'RESTRICTED' ? (
                          <span className="text-muted-foreground">—</span>
                        ) : row.gross_margin !== null ? (
                          <div>
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                              {formatAnalyticsMoney(row.gross_margin, row.currency_code)}
                            </span>
                            {marginPct !== null ? (
                              <span className="block text-[10px] text-muted-foreground font-normal">
                                {marginPct.toFixed(1)}% margin
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                            Partial Cost
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge
                          status={row.profitability_status}
                          tone={
                            row.profitability_status === 'AVAILABLE'
                              ? 'success'
                              : row.profitability_status === 'RESTRICTED'
                                ? 'neutral'
                                : 'warning'
                          }
                          className="text-[10px] px-1.5 py-0"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/products/${row.product_id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                        >
                          <span>Catalog</span>
                          <ExternalLink className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20 text-xs">
              <span className="text-muted-foreground">
                Showing{' '}
                <strong className="text-foreground">
                  {(page - 1) * pageSize + 1}
                </strong>{' '}
                to{' '}
                <strong className="text-foreground">
                  {Math.min(page * pageSize, totalItems)}
                </strong>{' '}
                of <strong className="text-foreground">{totalItems}</strong> SKUs
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2.5 text-xs"
                >
                  Previous
                </Button>
                <span className="font-mono px-2 text-foreground font-semibold">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2.5 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </PageSection>

      {/* 3. Variant & Costing Invariant Context */}
      <div className="p-4 rounded-xl bg-info/10 border border-info/20 text-xs text-foreground/80 flex items-start gap-2.5">
        <PackageSearch className="size-4 text-info shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Snapshot Invariants:</strong>{' '}
          Each row represents an authoritative variant sale snapshot taken at order placement. If a
          product title or SKU is subsequently updated in Catalog, historical reporting remains
          true to what was ordered. Product profitability is marked <code className="font-mono text-primary">PARTIAL</code> when
          units lack finalized FIFO landed costs.
        </div>
      </div>
    </div>
  );
}
