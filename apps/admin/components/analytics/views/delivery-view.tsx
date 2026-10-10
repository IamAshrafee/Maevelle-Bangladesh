'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  RotateCcw,
  ShieldAlert,
  Truck,
  XCircle,
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
  formatAnalyticsDuration,
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type DeliveryReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface DeliveryViewProps {
  readonly selection: DateRangeSelection;
}

export function DeliveryView({ selection }: DeliveryViewProps) {
  const [report, setReport] = React.useState<AnalyticsReportEnvelopeDto<DeliveryReportTotalsDto> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsReport<DeliveryReportTotalsDto>('DELIVERY', selection);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load delivery analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (error) {
    return <ErrorState title="Delivery Analytics Error" message={error} onRetry={loadData} />;
  }

  const rows = report?.totals ?? [];
  const totalDeliveries = rows.reduce((sum, r) => sum + Number(r.deliveries || 0), 0);
  const totalAttempts = rows.reduce((sum, r) => sum + Number(r.attempts || 0), 0);
  const deliveredRow = rows.find((r) => r.outcome_status === 'DELIVERED');
  const failedRow = rows.find((r) => r.outcome_status === 'FAILED');

  const deliveredCount = Number(deliveredRow?.deliveries || 0);
  const failedCount = Number(failedRow?.deliveries || 0);
  const successRate = totalDeliveries > 0 ? (deliveredCount / totalDeliveries) * 100 : null;

  const averageHours = deliveredRow?.average_delivery_hours;

  return (
    <div className="space-y-6">
      {/* 1. Delivery KPIs */}
      <PageSection
        title="Fulfillment Logistics & Courier Outcomes"
        description="Delivery attempts, transit durations, and outcome statuses normalized across delivery providers."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Consignments"
            value={formatAnalyticsCount(totalDeliveries)}
            subtitle="Parcels dispatched in window"
            definitionTooltip="Total deliveries created in Fulfillment and dispatched to courier partners."
            loading={loading}
            drillDownLabel="View deliveries"
            drillDownHref="/deliveries"
          />

          <MetricCard
            title="Delivery Success Rate"
            value={successRate !== null ? `${successRate.toFixed(1)}%` : 'No shipments'}
            status={successRate !== null && successRate >= 85 ? 'AVAILABLE' : 'PARTIAL'}
            statusLabel={successRate !== null && successRate >= 85 ? 'On Target' : 'Needs Review'}
            subtitle={`${formatAnalyticsCount(deliveredCount)} parcels delivered`}
            definitionTooltip="Delivered parcels divided by total completed delivery attempts in this period."
            loading={loading}
          />

          <MetricCard
            title="Average Delivery Duration"
            value={formatAnalyticsDuration(averageHours)}
            subtitle="Ready to doorstep delivery"
            definitionTooltip="Average hours elapsed between parcel ready_at and courier delivered_at confirmation."
            loading={loading}
          />

          <MetricCard
            title="Delivery Failures / Exceptions"
            value={formatAnalyticsCount(failedCount)}
            status={failedCount > 0 ? 'PARTIAL' : 'AVAILABLE'}
            statusLabel={failedCount > 0 ? 'Exceptions' : 'Zero Failures'}
            subtitle="Parcels returned or undelivered"
            definitionTooltip="Shipments where final outcome was marked FAILED, RTO, or UNREACHABLE."
            loading={loading}
            drillDownLabel="Delivery exceptions"
            drillDownHref="/delivery/exceptions"
          />
        </div>
      </PageSection>

      {/* 2. Outcome Status Breakdown Table */}
      <PageSection
        title="Delivery Status Breakdown"
        description="Deliveries grouped by standardized terminal outcome status."
        actions={
          <Link
            href="/couriers"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
          >
            <span>Courier operations</span>
            <ExternalLink className="size-3" />
          </Link>
        }
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Outcome Status</TableHead>
                <TableHead className="text-right">Consignments</TableHead>
                <TableHead className="text-right">Total Attempts</TableHead>
                <TableHead className="text-right">Delivered Units</TableHead>
                <TableHead className="text-right">Failed Units</TableHead>
                <TableHead className="text-right">Avg Duration</TableHead>
                <TableHead className="text-center">Health Indicator</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={7} className="py-4">
                      <div className="h-4 bg-muted/60 rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                    No delivery records found for the selected date range.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isDelivered = row.outcome_status === 'DELIVERED';
                  const isFailed = row.outcome_status === 'FAILED';

                  return (
                    <TableRow key={row.outcome_status}>
                      <TableCell className="font-semibold text-foreground text-xs">
                        {row.outcome_status}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-foreground">
                        {formatAnalyticsCount(row.deliveries)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                        {formatAnalyticsCount(row.attempts)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                        {formatAnalyticsCount(row.delivered_quantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-rose-700 dark:text-rose-400 font-medium">
                        {formatAnalyticsCount(row.failed_quantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {formatAnalyticsDuration(row.average_delivery_hours)}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge
                          status={isDelivered ? 'DELIVERED' : isFailed ? 'FAILED' : 'IN_TRANSIT'}
                          tone={isDelivered ? 'success' : isFailed ? 'danger' : 'warning'}
                          className="text-[10px] px-1.5 py-0"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </PageSection>

      {/* 3. Delivery and COD Relationship Warning */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-foreground/80 flex items-start gap-2.5">
        <Clock className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">COD vs Delivery Status Distinction:</strong>{' '}
          A parcel marked as <code className="font-mono text-foreground font-semibold">DELIVERED</code> by Pathao or Steadfast
          confirms physical doorstep handover. It does NOT imply the cash collected by the courier
          has been remitted or settled in Finance. COD settlement remains an independent accounting
          fact.
        </div>
      </div>
    </div>
  );
}
