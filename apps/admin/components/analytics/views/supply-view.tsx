'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Building2,
  ExternalLink,
  Package,
  ShoppingBag,
  Truck,
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
  formatAnalyticsMoney,
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type SupplyReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface SupplyViewProps {
  readonly selection: DateRangeSelection;
}

export function SupplyView({ selection }: SupplyViewProps) {
  const [report, setReport] = React.useState<AnalyticsReportEnvelopeDto<SupplyReportTotalsDto> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsReport<SupplyReportTotalsDto>('SUPPLY', selection);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load supply analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (error) {
    return <ErrorState title="Supply Analytics Error" message={error} onRetry={loadData} />;
  }

  const rows = report?.totals ?? [];
  const totalPurchases = rows.reduce((sum, r) => sum + Number(r.purchases || 0), 0);
  const totalUnits = rows.reduce((sum, r) => sum + Number(r.units || 0), 0);
  const totalPurchaseValue = rows.reduce((sum, r) => sum + Number(r.purchase_value || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Supply KPIs */}
      <PageSection
        title="Procurement & Inbound Supply"
        description="Supplier purchases, units ordered, and procurement commitments made during the reporting window."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Purchase Orders"
            value={formatAnalyticsCount(totalPurchases)}
            subtitle="Procurement commitments"
            definitionTooltip="Purchase orders created in Procurement domain during this period."
            loading={loading}
            drillDownLabel="View purchases"
            drillDownHref="/purchases"
          />

          <MetricCard
            title="Inbound Units Ordered"
            value={formatAnalyticsCount(totalUnits)}
            subtitle="Raw inventory replenishment"
            definitionTooltip="Cumulative units ordered across purchase lines."
            loading={loading}
          />

          <MetricCard
            title="Total Procurement Value"
            value={formatAnalyticsMoney(totalPurchaseValue, selection.currency)}
            subtitle="Purchase order value"
            definitionTooltip="Sum of unit purchase price × quantity across procurement lines."
            loading={loading}
          />

          <MetricCard
            title="Active Suppliers"
            value={formatAnalyticsCount(rows.length)}
            subtitle="Replenishing partners"
            definitionTooltip="Distinct suppliers with orders during this period."
            loading={loading}
            drillDownLabel="View suppliers"
            drillDownHref="/suppliers"
          />
        </div>
      </PageSection>

      {/* 2. Supplier Procurement Breakdown Table */}
      <PageSection
        title="Supplier Volume & Value Breakdown"
        description="Procurement distribution across suppliers."
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead className="text-right">Purchase Orders</TableHead>
                <TableHead className="text-right">Units Ordered</TableHead>
                <TableHead className="text-right">Committed Value (BDT)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={5} className="py-4">
                      <div className="h-4 bg-muted/60 rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                    No supplier purchases recorded for the selected date range.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.supplier_id}-${row.currency_code}`}>
                    <TableCell className="font-semibold text-foreground text-xs">
                      {row.supplier_name || 'Unassigned Supplier'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                      {formatAnalyticsCount(row.purchases)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                      {formatAnalyticsCount(row.units)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-foreground">
                      {formatAnalyticsMoney(row.purchase_value, row.currency_code)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/suppliers`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                      >
                        <span>Supplier</span>
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

      {/* 3. Domain Reference */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/70 text-xs text-muted-foreground flex items-start gap-2.5">
        <Building2 className="size-4 text-primary shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Supply & Costing Relationship:</strong>{' '}
          Purchasing metrics reflect committed supplier orders. Landed costs are recognized only
          after shipments are received and customs/freight duties are allocated in Costing.
        </div>
      </div>
    </div>
  );
}
