'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CreditCard,
  ExternalLink,
  Layers,
  ShoppingBag,
  Store,
  Tag,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState, PagePanel, PageSection } from '@/components/ui/page-shell';
import { DistributionList, SalesTrendChart } from '../analytics-charts';
import { MetricCard } from '../analytics-kpi-card';
import {
  calculateComparisonChange,
  formatAnalyticsCount,
  formatAnalyticsMoney,
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type OrdersReportBreakdownDto,
  type OrdersReportTotalsDto,
  type SalesReportSeriesDto,
  type SalesReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface SalesViewProps {
  readonly selection: DateRangeSelection;
}

export function SalesView({ selection }: SalesViewProps) {
  const [salesReport, setSalesReport] = React.useState<AnalyticsReportEnvelopeDto<SalesReportTotalsDto, SalesReportSeriesDto> | null>(null);
  const [ordersReport, setOrdersReport] = React.useState<AnalyticsReportEnvelopeDto<OrdersReportTotalsDto, unknown, OrdersReportBreakdownDto> | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sales, orders] = await Promise.all([
        fetchAnalyticsReport<SalesReportTotalsDto, SalesReportSeriesDto>('SALES', selection),
        fetchAnalyticsReport<OrdersReportTotalsDto, unknown, OrdersReportBreakdownDto>('ORDERS', selection),
      ]);
      setSalesReport(sales);
      setOrdersReport(orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load sales analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (error) {
    return <ErrorState title="Sales Analytics Error" message={error} onRetry={loadData} />;
  }

  // Totals & Comparisons
  const totals = salesReport?.totals?.[0];
  const prior = salesReport?.comparison?.totals?.[0];

  const netSales = Number(totals?.net_after_refunds ?? 0);
  const priorNet = Number(prior?.net_after_refunds ?? 0);
  const netDelta = calculateComparisonChange(netSales, priorNet);

  const grossSales = Number(totals?.merchandise_gross ?? 0);
  const priorGross = Number(prior?.merchandise_gross ?? 0);
  const grossDelta = calculateComparisonChange(grossSales, priorGross);

  const discounts = Number(totals?.discounts ?? 0);
  const priorDiscounts = Number(prior?.discounts ?? 0);
  const discountDelta = calculateComparisonChange(discounts, priorDiscounts);

  const deliveryCharges = Number(totals?.delivery_charges ?? 0);

  const ordersCount = Number(totals?.eligible_orders ?? 0);
  const priorOrders = Number(prior?.eligible_orders ?? 0);
  const ordersDelta = calculateComparisonChange(ordersCount, priorOrders);

  const aov = ordersCount > 0 ? netSales / ordersCount : 0;
  const priorAov = priorOrders > 0 ? priorNet / priorOrders : 0;
  const aovDelta = calculateComparisonChange(aov, priorAov);

  const refunds = Number(totals?.refunds ?? 0);
  const priorRefunds = Number(prior?.refunds ?? 0);
  const refundDelta = calculateComparisonChange(refunds, priorRefunds, true);

  // Time Series
  const chartData = (salesReport?.series ?? []).map((s) => ({
    period: s.period,
    order_total: Number(s.order_total ?? 0),
    refunds: Number(s.refunds ?? 0),
    orders: Number(s.orders ?? 0),
  }));

  // Orders Report breakdowns
  const orderStatuses = (ordersReport?.totals ?? []).map((s) => ({
    label: s.order_status,
    count: Number(s.orders || 0),
  }));

  const rawBreakdown = (ordersReport?.breakdown ?? []) as readonly {
    sales_channel?: string;
    payment_method?: string;
    orders: string;
  }[];

  const channelItems = rawBreakdown
    .filter((b) => Boolean(b.sales_channel))
    .map((b) => ({
      label: b.sales_channel || 'Unknown',
      count: Number(b.orders || 0),
    }));

  const paymentMethodItems = rawBreakdown
    .filter((b) => Boolean(b.payment_method))
    .map((b) => ({
      label: b.payment_method || 'Unknown',
      count: Number(b.orders || 0),
    }));

  return (
    <div className="space-y-6">
      {/* 1. Core Sales KPIs */}
      <PageSection
        title="Commercial Sales Performance"
        description="Authoritative sales aggregate derived from immutable order lines and completed payment refunds."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Merchandise Gross"
            value={formatAnalyticsMoney(grossSales, selection.currency)}
            comparison={grossDelta}
            subtitle="Before discounts & delivery"
            definitionTooltip="Sum of product unit price × quantity on eligible (non-cancelled) orders before promotional discounts or shipping fees."
            loading={loading}
          />

          <MetricCard
            title="Promotional Discounts"
            value={formatAnalyticsMoney(discounts, selection.currency)}
            comparison={discountDelta}
            subtitle={`${grossSales > 0 ? ((discounts / grossSales) * 100).toFixed(1) : '0'}% of gross value`}
            definitionTooltip="Total promotional and coupon deductions applied to order lines."
            loading={loading}
          />

          <MetricCard
            title="Net Sales (After Refunds)"
            value={formatAnalyticsMoney(netSales, selection.currency)}
            comparison={netDelta}
            subtitle={`Includes ৳${formatAnalyticsCount(deliveryCharges)} customer delivery fees`}
            definitionTooltip="Gross merchandise minus discounts plus delivery charge minus completed refunds. This is the realized commercial revenue."
            loading={loading}
            drillDownLabel="View orders"
            drillDownHref="/orders"
          />

          <MetricCard
            title="Average Order Value"
            value={formatAnalyticsMoney(aov, selection.currency)}
            comparison={aovDelta}
            subtitle={`Across ${formatAnalyticsCount(ordersCount)} eligible orders`}
            definitionTooltip="Net sales divided by eligible orders placed in this period."
            loading={loading}
          />
        </div>
      </PageSection>

      {/* 2. Sales Trend Visual */}
      <PageSection
        title="Sales Trend Over Time"
        description="Daily or weekly volume showing order commitments and refund offsets."
      >
        <PagePanel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="size-2.5 rounded-full bg-teal-600" />
                Order Total (BDT)
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2.5 rounded-full bg-rose-500" />
                Completed Refunds (BDT)
              </span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              Granularity: <strong>{selection.granularity}</strong>
            </span>
          </div>

          <SalesTrendChart
            data={chartData}
            height={320}
            currency={selection.currency}
          />
        </PagePanel>
      </PageSection>

      {/* 3. Distribution Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sales Channels */}
        <PagePanel className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <Store className="size-4 text-primary" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Sales Channels
              </h4>
            </div>
            <Link
              href="/orders"
              className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
            >
              <span>Orders</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>
          <DistributionList items={channelItems} currency={selection.currency} />
        </PagePanel>

        {/* Payment Methods */}
        <PagePanel className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-primary" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Payment Methods
              </h4>
            </div>
            <Link
              href="/payments"
              className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
            >
              <span>Payments</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>
          <DistributionList items={paymentMethodItems} currency={selection.currency} />
        </PagePanel>

        {/* Order Lifecycle Statuses */}
        <PagePanel className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Order Statuses
              </h4>
            </div>
            <Link
              href="/orders"
              className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
            >
              <span>Orders</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>
          <DistributionList items={orderStatuses} currency={selection.currency} />
        </PagePanel>
      </div>

      {/* 4. Canonical Money Notes */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/70 text-xs text-muted-foreground flex items-start gap-2.5">
        <Tag className="size-4 text-primary shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Canonical Commercial Accounting:</strong>{' '}
          Cancelled orders are preserved in raw counts but systematically excluded from eligible
          sales figures. Completed refunds are attributed by refund completion time, not the original order date,
          preventing historical restatements.
        </div>
      </div>
    </div>
  );
}
