'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  HelpCircle,
  Repeat,
  UserCheck,
  UserPlus,
  Users,
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
  type CustomersReportBreakdownDto,
  type DateRangeSelection,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface CustomersViewProps {
  readonly selection: DateRangeSelection;
}

export function CustomersView({ selection }: CustomersViewProps) {
  const [report, setReport] = React.useState<AnalyticsReportEnvelopeDto<unknown, unknown, CustomersReportBreakdownDto> | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsReport<unknown, unknown, CustomersReportBreakdownDto>(
        'CUSTOMERS',
        {
          ...selection,
          page,
          pageSize,
        },
      );
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load customer analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection, page, pageSize]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const rows = report?.breakdown ?? [];
  const totalItems = report?.pagination.totalItems ?? 0;
  const totalPages = report?.pagination.totalPages ?? 1;

  // Breakdown metrics
  const returningCount = rows.filter((r) => r.returning_customer).length;
  const firstTimeCount = rows.filter((r) => !r.returning_customer).length;
  const repeatRate = rows.length > 0 ? (returningCount / rows.length) * 100 : 0;

  const totalNetSpend = rows.reduce((sum, r) => sum + Number(r.net_sales || 0), 0);
  const averageCustomerSpend = rows.length > 0 ? totalNetSpend / rows.length : 0;

  return (
    <div className="space-y-6">
      {/* 1. Customer Acquisition & Value KPIs */}
      <PageSection
        title="Customer Base & Retention Analysis"
        description="Buyer counts reflect canonical customer identities resolved across guest checkouts and alias merges."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Active Buyers in Period"
            value={formatAnalyticsCount(totalItems)}
            subtitle="Distinct resolved customers"
            definitionTooltip="Unique canonical customer identities with eligible orders committed during this period."
            loading={loading}
          />

          <MetricCard
            title="Repeat Buyers (Sample)"
            value={formatAnalyticsCount(returningCount)}
            subtitle={`${repeatRate.toFixed(1)}% of listed buyers`}
            definitionTooltip="Customers with more than one placed order across Maevelle history."
            loading={loading}
          />

          <MetricCard
            title="First-Time Buyers (Sample)"
            value={formatAnalyticsCount(firstTimeCount)}
            subtitle={`${(100 - repeatRate).toFixed(1)}% first order`}
            definitionTooltip="Customers whose first recorded purchase occurred within this period."
            loading={loading}
          />

          <MetricCard
            title="Average Buyer Spend"
            value={formatAnalyticsMoney(averageCustomerSpend, selection.currency)}
            subtitle="Net realized spend per buyer"
            definitionTooltip="Total period net sales divided by distinct purchasing customers."
            loading={loading}
          />
        </div>
      </PageSection>

      {/* 2. Customer Value Ranking Table */}
      <PageSection
        title="Purchasing Customer Ledger"
        description="Top customer accounts ranked by realized net spend in this period."
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
              </NativeSelect>
            </div>
          </div>
        }
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Customer Name / Identity</TableHead>
                <TableHead className="text-center">Type</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Period Net Sales</TableHead>
                <TableHead>First Order Date</TableHead>
                <TableHead>Recent Order Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={7} className="py-4">
                      <div className="h-4 bg-muted/60 rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                    No purchasing customers recorded for this period.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.canonical_customer_id}>
                    <TableCell className="max-w-[220px]">
                      <span className="font-semibold text-foreground truncate block">
                        {row.display_name || 'Guest Customer'}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground block truncate">
                        ID: {row.canonical_customer_id.slice(0, 8)}…
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge
                        status={row.returning_customer ? 'REPEAT' : 'FIRST_TIME'}
                        tone={row.returning_customer ? 'success' : 'info'}
                        className="text-[10px] px-1.5 py-0"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-semibold text-foreground">
                      {formatAnalyticsCount(row.orders)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-foreground">
                      {formatAnalyticsMoney(row.net_sales, row.currency_code)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.first_order_at ? new Date(row.first_order_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.last_order_at ? new Date(row.last_order_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/customers/${row.canonical_customer_id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                      >
                        <span>Profile</span>
                        <ExternalLink className="size-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20 text-xs">
              <span className="text-muted-foreground">
                Showing{' '}
                <strong className="text-foreground">{(page - 1) * pageSize + 1}</strong> to{' '}
                <strong className="text-foreground">
                  {Math.min(page * pageSize, totalItems)}
                </strong>{' '}
                of <strong className="text-foreground">{totalItems}</strong> customers
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

      {/* 3. Guest & Identity Notice */}
      <div className="p-4 rounded-xl bg-info/10 border border-info/20 text-xs text-foreground/80 flex items-start gap-2.5">
        <Users className="size-4 text-info shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Guest Purchasing & Identity Canonicalization:</strong>{' '}
          Maevelle supports frictionless guest checkout. Orders placed without account registration are
          harmonized through customer phone/email resolution so returning guests are not treated as
          disconnected anonymous users.
        </div>
      </div>
    </div>
  );
}
