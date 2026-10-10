'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Boxes,
  Camera,
  ExternalLink,
  Layers,
  MapPin,
  Warehouse,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
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
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type InventoryReportTotalsDto,
  type InventorySnapshotItemDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport, fetchInventorySnapshots } from '@/lib/analytics/api';

interface InventoryViewProps {
  readonly selection: DateRangeSelection;
}

export function InventoryView({ selection }: InventoryViewProps) {
  const [report, setReport] = React.useState<AnalyticsReportEnvelopeDto<InventoryReportTotalsDto> | null>(null);
  const [snapshots, setSnapshots] = React.useState<readonly InventorySnapshotItemDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invReport, snapList] = await Promise.all([
        fetchAnalyticsReport<InventoryReportTotalsDto>('INVENTORY', selection),
        fetchInventorySnapshots(),
      ]);
      setReport(invReport);
      setSnapshots(snapList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load inventory analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggregates
  const totals = report?.totals ?? [];
  const latestSnapshot = totals[0];

  const totalPositions = totals.reduce((sum, r) => sum + Number(r.sku_positions || 0), 0);
  const totalAvailable = totals.reduce((sum, r) => sum + Number(r.available_to_sell || 0), 0);
  const totalReserved = totals.reduce((sum, r) => sum + Number(r.reserved || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Inventory KPIs */}
      <PageSection
        title="Warehouse Stock Position Snapshot"
        description="Daily point-in-time warehouse balance snapshots. Distinguishes uncommitted available stock from checkout reservations."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Available to Sell (ATS)"
            value={formatAnalyticsCount(totalAvailable)}
            subtitle="Free unreserved physical inventory"
            definitionTooltip="Physical stock on hand minus active checkout and fulfillment line reservations."
            loading={loading}
            drillDownLabel="Live stock"
            drillDownHref="/inventory/stock"
          />

          <MetricCard
            title="Reserved for Orders"
            value={formatAnalyticsCount(totalReserved)}
            subtitle="Committed to active orders"
            definitionTooltip="Units currently held for pending fulfillment or checkout allocations."
            loading={loading}
            drillDownLabel="Fulfillments"
            drillDownHref="/fulfillments"
          />

          <MetricCard
            title="Tracked SKU Positions"
            value={formatAnalyticsCount(totalPositions)}
            subtitle="Warehouse SKU locations"
            definitionTooltip="Active SKU-level positions monitored across all fulfillment centers."
            loading={loading}
          />

          <MetricCard
            title="Latest Captured Snapshot"
            value={latestSnapshot ? latestSnapshot.snapshot_date : 'Pending'}
            subtitle={latestSnapshot ? `${latestSnapshot.location_name}` : 'No snapshots'}
            definitionTooltip="Most recent scheduled EOD snapshot captured for warehouse audit reconciliation."
            loading={loading}
          />
        </div>
      </PageSection>

      {/* 2. Warehouse Location Aggregate Table */}
      <PageSection
        title="Location Inventory Ledger"
        description="Aggregated stock posture grouped by warehouse location and snapshot date."
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Snapshot Date</TableHead>
                <TableHead>Warehouse Location</TableHead>
                <TableHead className="text-right">Tracked SKUs</TableHead>
                <TableHead className="text-right">Reserved Units</TableHead>
                <TableHead className="text-right">Available to Sell</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={6} className="py-4">
                      <div className="h-4 bg-muted/60 rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : totals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    No daily inventory snapshots recorded for the selected date range.
                  </TableCell>
                </TableRow>
              ) : (
                totals.map((row) => (
                  <TableRow key={`${row.snapshot_date}-${row.location_name}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.snapshot_date}
                    </TableCell>
                    <TableCell className="font-semibold text-foreground text-xs">
                      {row.location_name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                      {formatAnalyticsCount(row.sku_positions)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400 font-medium">
                      {formatAnalyticsCount(row.reserved)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-primary">
                      {formatAnalyticsCount(row.available_to_sell)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href="/inventory/stock"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                      >
                        <span>Stock ledger</span>
                        <ExternalLink className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageSection>

      {/* 3. Detailed Point-in-time SKU Snapshots */}
      <PageSection
        title="SKU-Level Point-in-Time Ledger"
        description="Detailed stock positions captured across warehouses."
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Snapshot Date</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Sellable Quantity</TableHead>
                <TableHead className="text-right">Reserved Quantity</TableHead>
                <TableHead className="text-right">Available to Sell</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                    No SKU-level snapshots captured yet.
                  </TableCell>
                </TableRow>
              ) : (
                snapshots.slice(0, 30).map((snap) => (
                  <TableRow key={`${snap.snapshot_date}-${snap.sku}-${snap.location_name}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {snap.snapshot_date}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {snap.sku}
                    </TableCell>
                    <TableCell className="text-xs text-foreground">
                      {snap.location_name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatAnalyticsCount(snap.sellable_quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-amber-700 dark:text-amber-400">
                      {formatAnalyticsCount(snap.reserved_quantity)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-primary">
                      {formatAnalyticsCount(snap.available_to_sell)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageSection>

      {/* 4. Definition Banner */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/70 text-xs text-muted-foreground flex items-start gap-2.5">
        <Boxes className="size-4 text-primary shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Stock Valuation Note:</strong>{' '}
          Physical available units reflect sellable inventory minus active reservations. Potential
          retail value is distinct from inventory cost valuation; Analytics does not infer
          historical stock ages from current counts alone.
        </div>
      </div>
    </div>
  );
}
