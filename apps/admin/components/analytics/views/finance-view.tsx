'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  Landmark,
  Receipt,
  Scale,
  ShieldAlert,
} from 'lucide-react';

import { useAdminCapability } from '@/components/admin-capabilities';
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
  calculateComparisonChange,
  formatAnalyticsCount,
  formatAnalyticsMoney,
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type FinanceReportTotalsDto,
  type PaymentsReportTotalsDto,
  type SalesReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface FinanceViewProps {
  readonly selection: DateRangeSelection;
}

export function FinanceView({ selection }: FinanceViewProps) {
  const canViewFinancial = useAdminCapability('analytics.financial.view');

  const [financeReport, setFinanceReport] = React.useState<AnalyticsReportEnvelopeDto<FinanceReportTotalsDto> | null>(null);
  const [paymentsReport, setPaymentsReport] = React.useState<AnalyticsReportEnvelopeDto<PaymentsReportTotalsDto> | null>(null);
  const [salesReport, setSalesReport] = React.useState<AnalyticsReportEnvelopeDto<SalesReportTotalsDto> | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    if (!canViewFinancial) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [fin, pay, sales] = await Promise.all([
        fetchAnalyticsReport<FinanceReportTotalsDto>('FINANCE', selection),
        fetchAnalyticsReport<PaymentsReportTotalsDto>('PAYMENTS', selection),
        fetchAnalyticsReport<SalesReportTotalsDto>('SALES', selection),
      ]);
      setFinanceReport(fin);
      setPaymentsReport(pay);
      setSalesReport(sales);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load financial analytics.');
    } finally {
      setLoading(false);
    }
  }, [canViewFinancial, selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // If user lacks financial analytics capability
  if (!canViewFinancial) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-border/80 bg-card max-w-xl mx-auto space-y-4">
        <div className="size-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-600">
          <ShieldAlert className="size-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Restricted Financial Area</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            You do not have the <code className="font-mono text-primary font-semibold">analytics.financial.view</code> permission
            required to view treasury movements, recognized profit margins, cash ledger movements, and owner capital facts.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Contact your organization owner if you need access to sensitive accounting intelligence.
        </p>
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Financial Analytics Error" message={error} onRetry={loadData} />;
  }

  // Finance aggregates
  const cashFacts = financeReport?.totals ?? [];
  const netCashMovement = cashFacts.reduce((sum, r) => sum + Number(r.account_movement || 0), 0);
  const totalTransactions = cashFacts.reduce((sum, r) => sum + Number(r.transactions || 0), 0);

  // Payments aggregates
  const paymentTotals = paymentsReport?.totals ?? [];
  const confirmedPayments = paymentTotals.filter(
    (p) => p.fact_type === 'PAYMENT' && p.status === 'CONFIRMED',
  );
  const confirmedPaymentAmount = confirmedPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );

  const refundFacts = paymentTotals.filter(
    (p) => p.fact_type === 'REFUND' && p.status === 'COMPLETED',
  );
  const refundAmount = refundFacts.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Sales totals
  const salesTotals = salesReport?.totals?.[0];
  const netRealizedSales = Number(salesTotals?.net_after_refunds ?? 0);
  const deliveryChargesCollected = Number(salesTotals?.delivery_charges ?? 0);

  return (
    <div className="space-y-6">
      {/* 1. Treasury & Realized Performance KPIs */}
      <PageSection
        title="Authoritative Financial Intelligence"
        description="Cash movement, recognized payments, and ledger account postings. Preserves strict separation between commercial sales and capital financing."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Net Cash Ledger Delta"
            value={formatAnalyticsMoney(netCashMovement, selection.currency)}
            subtitle={`Across ${formatAnalyticsCount(totalTransactions)} ledger postings`}
            definitionTooltip="Net sum of debit and credit entries across all financial accounts in this period. Excludes non-financial projections."
            loading={loading}
            drillDownLabel="Finance ledger"
            drillDownHref="/finance/journal"
          />

          <MetricCard
            title="Confirmed Customer Payments"
            value={formatAnalyticsMoney(confirmedPaymentAmount, selection.currency)}
            subtitle="Verified payment gateway & COD receipts"
            definitionTooltip="Payment facts confirmed by Payments domain. Distinct from order placement and distinct from ledger postings."
            loading={loading}
            drillDownLabel="Payments queue"
            drillDownHref="/payments"
          />

          <MetricCard
            title="Realized Commercial Sales"
            value={formatAnalyticsMoney(netRealizedSales, selection.currency)}
            subtitle="Net sales after refunds"
            definitionTooltip="Authoritative order net snapshot minus proportional refunds on non-cancelled orders."
            loading={loading}
          />

          <MetricCard
            title="Customer Delivery Fees"
            value={formatAnalyticsMoney(deliveryChargesCollected, selection.currency)}
            subtitle="Shipping charged to customers"
            definitionTooltip="Delivery fees charged to customers on orders; strictly distinct from courier logistics expenses."
            loading={loading}
          />
        </div>
      </PageSection>

      {/* 2. Cash Ledger Movement Breakdown by Transaction Type */}
      <PageSection
        title="Cash Ledger Movements by Transaction Type"
        description="Movement in business accounts derived from authoritative Finance journal entries."
        actions={
          <Link
            href="/finance"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
          >
            <span>Finance workspace</span>
            <ExternalLink className="size-3" />
          </Link>
        }
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Transaction Type</TableHead>
                <TableHead className="text-right">Ledger Transactions</TableHead>
                <TableHead className="text-right">Net Movement (BDT)</TableHead>
                <TableHead className="text-center">Accounting Context</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={4} className="py-4">
                      <div className="h-4 bg-muted/60 rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : cashFacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">
                    No cash movement facts recorded for this date window.
                  </TableCell>
                </TableRow>
              ) : (
                cashFacts.map((row) => {
                  const delta = Number(row.account_movement || 0);
                  const isCapital = row.transaction_type.toUpperCase().includes('CAPITAL');
                  const isTransfer = row.transaction_type.toUpperCase().includes('TRANSFER');

                  return (
                    <TableRow key={`${row.transaction_type}-${row.currency_code}`}>
                      <TableCell className="font-semibold text-foreground text-xs">
                        {row.transaction_type.replaceAll('_', ' ')}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                        {formatAnalyticsCount(row.transactions)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums font-bold">
                        <span className={delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                          {delta >= 0 ? '+' : ''}
                          {formatAnalyticsMoney(delta, row.currency_code)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge
                          status={isCapital ? 'CAPITAL' : isTransfer ? 'TRANSFER' : 'OPERATING'}
                          tone={isCapital ? 'info' : isTransfer ? 'neutral' : 'success'}
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

      {/* 3. Payments Domain Fact Reconciliation */}
      <PageSection
        title="Payments & Gateway Settlement Facts"
        description="Records confirmed by the Payments subsystem across attempts, settled payments, and refund disbursements."
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Fact Type</TableHead>
                <TableHead>Settlement Status</TableHead>
                <TableHead className="text-right">Records Count</TableHead>
                <TableHead className="text-right">Total Amount (BDT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentTotals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                    No payment facts recorded in this period.
                  </TableCell>
                </TableRow>
              ) : (
                paymentTotals.map((row) => (
                  <TableRow key={`${row.fact_type}-${row.status}-${row.currency_code}`}>
                    <TableCell className="font-medium text-foreground text-xs">
                      {row.fact_type}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.status}
                        tone={
                          row.status === 'CONFIRMED' || row.status === 'COMPLETED'
                            ? 'success'
                            : row.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                        className="text-[10px] px-1.5 py-0"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                      {formatAnalyticsCount(row.records)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-semibold text-foreground">
                      {formatAnalyticsMoney(row.amount, row.currency_code)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PageSection>

      {/* 4. Crucial Accounting Invariants */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-foreground/80 flex items-start gap-2.5">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Strict Accounting Separation:</strong>{' '}
          Owner Capital is financing, never operational sales revenue. Internal account transfers are
          treasury balancing, never realized revenue. Delivered COD orders are physically fulfilled
          deliveries, but are NOT financially settled until courier remittance is confirmed in Finance.
        </div>
      </div>
    </div>
  );
}
