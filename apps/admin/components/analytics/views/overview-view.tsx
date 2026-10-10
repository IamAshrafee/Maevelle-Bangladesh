'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  CreditCard,
  HelpCircle,
  PackageSearch,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
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
import { SalesTrendChart } from '../analytics-charts';
import { MetricCard } from '../analytics-kpi-card';
import {
  calculateComparisonChange,
  formatAnalyticsCount,
  formatAnalyticsMoney,
  formatAnalyticsPercent,
  type AnalyticsReportEnvelopeDto,
  type AnalyticsViewKey,
  type DateRangeSelection,
  type DeliveryReportTotalsDto,
  type InventoryReportTotalsDto,
  type ProductsReportBreakdownDto,
  type ReturnsReportTotalsDto,
  type SalesReportSeriesDto,
  type SalesReportTotalsDto,
  type StorefrontReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface OverviewViewProps {
  readonly selection: DateRangeSelection;
  readonly onNavigateView: (view: AnalyticsViewKey) => void;
}

export function OverviewView({ selection, onNavigateView }: OverviewViewProps) {
  const [salesReport, setSalesReport] = React.useState<AnalyticsReportEnvelopeDto<SalesReportTotalsDto, SalesReportSeriesDto> | null>(null);
  const [productsReport, setProductsReport] = React.useState<AnalyticsReportEnvelopeDto<unknown, unknown, ProductsReportBreakdownDto> | null>(null);
  const [deliveryReport, setDeliveryReport] = React.useState<AnalyticsReportEnvelopeDto<DeliveryReportTotalsDto> | null>(null);
  const [returnsReport, setReturnsReport] = React.useState<AnalyticsReportEnvelopeDto<ReturnsReportTotalsDto> | null>(null);
  const [storefrontReport, setStorefrontReport] = React.useState<AnalyticsReportEnvelopeDto<StorefrontReportTotalsDto> | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sales, products, delivery, returns, storefront] = await Promise.all([
        fetchAnalyticsReport<SalesReportTotalsDto, SalesReportSeriesDto>('SALES', selection),
        fetchAnalyticsReport<unknown, unknown, ProductsReportBreakdownDto>('PRODUCTS', {
          ...selection,
          pageSize: 5,
        }),
        fetchAnalyticsReport<DeliveryReportTotalsDto>('DELIVERY', selection),
        fetchAnalyticsReport<ReturnsReportTotalsDto>('RETURNS', selection),
        fetchAnalyticsReport<StorefrontReportTotalsDto>('STOREFRONT', selection),
      ]);

      setSalesReport(sales);
      setProductsReport(products);
      setDeliveryReport(delivery);
      setReturnsReport(returns);
      setStorefrontReport(storefront);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load overview analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (error) {
    return <ErrorState title="Analytics Error" message={error} onRetry={loadData} />;
  }

  // Authoritative Sales Totals & Comparisons
  const currentSales = salesReport?.totals?.[0];
  const priorSales = salesReport?.comparison?.totals?.[0];

  const netSalesAmount = Number(currentSales?.net_after_refunds ?? 0);
  const priorNetSales = Number(priorSales?.net_after_refunds ?? 0);
  const netSalesDelta = calculateComparisonChange(netSalesAmount, priorNetSales);

  const ordersCount = Number(currentSales?.eligible_orders ?? 0);
  const priorOrders = Number(priorSales?.eligible_orders ?? 0);
  const ordersDelta = calculateComparisonChange(ordersCount, priorOrders);

  const aov = ordersCount > 0 ? netSalesAmount / ordersCount : 0;
  const priorAov = priorOrders > 0 ? priorNetSales / priorOrders : 0;
  const aovDelta = calculateComparisonChange(aov, priorAov);

  const refundAmount = Number(currentSales?.refunds ?? 0);
  const priorRefund = Number(priorSales?.refunds ?? 0);
  const refundDelta = calculateComparisonChange(refundAmount, priorRefund, true);

  // Delivery & Returns Stats
  const deliveries = deliveryReport?.totals ?? [];
  const deliveredCount = deliveries.find((d) => d.outcome_status === 'DELIVERED')?.deliveries ?? '0';
  const failedCount = deliveries.find((d) => d.outcome_status === 'FAILED')?.deliveries ?? '0';
  const totalDeliveries = deliveries.reduce((acc, curr) => acc + Number(curr.deliveries || 0), 0);
  const deliverySuccessRate = totalDeliveries > 0 ? (Number(deliveredCount) / totalDeliveries) * 100 : null;

  const returnTotals = returnsReport?.totals ?? [];
  const customerReturnCases = returnTotals
    .filter((r) => r.case_type === 'CUSTOMER_RETURN')
    .reduce((sum, r) => sum + Number(r.cases || 0), 0);
  const rtoCases = returnTotals
    .filter((r) => r.case_type === 'RTO')
    .reduce((sum, r) => sum + Number(r.cases || 0), 0);

  // Storefront Sessions
  const sfTotals = storefrontReport?.totals?.[0];
  const isStorefrontNotTracked = storefrontReport?.availability.status === 'NOT_TRACKED';

  // Series chart points
  const chartPoints = (salesReport?.series ?? []).map((s) => ({
    period: s.period,
    order_total: Number(s.order_total ?? 0),
    refunds: Number(s.refunds ?? 0),
    orders: Number(s.orders ?? 0),
  }));

  return (
    <div className="space-y-6">
      {/* 1. Executive Snapshot KPI Cards */}
      <PageSection
        title="Executive Performance Snapshot"
        description="Core commerce metrics for the selected window. Numbers reflect immutable order snapshots."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Net Sales (After Refunds)"
            value={formatAnalyticsMoney(netSalesAmount, selection.currency)}
            comparison={netSalesDelta}
            subtitle={`Gross ৳${formatAnalyticsCount(currentSales?.merchandise_gross ?? 0)} · Disc -৳${formatAnalyticsCount(currentSales?.discounts ?? 0)}`}
            definitionTooltip="Merchandise subtotal minus discounts plus delivery fees minus completed refunds on eligible (non-cancelled) orders."
            loading={loading}
            drillDownLabel="Sales report"
            drillDownHref="/analytics?view=sales"
          />

          <MetricCard
            title="Eligible Orders"
            value={formatAnalyticsCount(ordersCount)}
            comparison={ordersDelta}
            subtitle={`${currentSales?.merchandise_gross ? 'Active commercial commitments' : 'No placed orders'}`}
            definitionTooltip="Total orders placed in this period that reached confirmed or completed state. Cancelled orders are excluded from eligible sales totals."
            loading={loading}
            drillDownLabel="View orders"
            drillDownHref="/orders"
          />

          <MetricCard
            title="Average Order Value (AOV)"
            value={formatAnalyticsMoney(aov, selection.currency)}
            comparison={aovDelta}
            subtitle="Net sales per eligible order"
            definitionTooltip="Calculated strictly as Net Sales divided by Eligible Orders. Cancelled orders are excluded."
            loading={loading}
          />

          <MetricCard
            title="Completed Refunds"
            value={formatAnalyticsMoney(refundAmount, selection.currency)}
            comparison={refundDelta}
            subtitle={`${formatAnalyticsCount(currentSales?.refunds ?? 0)} returned to customers`}
            definitionTooltip="Authoritative completed refunds recorded by Payments during this period. Attributed to refund completion date."
            loading={loading}
            drillDownLabel="Returns report"
            drillDownHref="/analytics?view=operations"
          />
        </div>
      </PageSection>

      {/* 2. Primary Trend Visual */}
      <PageSection
        title="Revenue & Order Trajectory"
        description="Daily sales volume vs completed refund subtractions over the reporting timeline."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigateView('sales')}
            className="text-xs gap-1"
          >
            <span>Full sales analytics</span>
            <ArrowRight className="size-3.5" />
          </Button>
        }
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
                Refunds (BDT)
              </span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              Granularity: <strong>{selection.granularity}</strong>
            </span>
          </div>

          <SalesTrendChart
            data={chartPoints}
            height={300}
            currency={selection.currency}
          />
        </PagePanel>
      </PageSection>

      {/* 3. Operational Pulse & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top 5 Products Ranking Preview */}
        <div className="lg:col-span-2 space-y-4">
          <PageSection
            title="Top Performing Products"
            description="Sellable variants ordered by net sales in this period."
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onNavigateView('products')}
                className="text-xs text-primary hover:text-primary-hover"
              >
                <span>View all products</span>
                <ArrowRight className="size-3 mr-0.5" />
              </Button>
            }
          >
            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product / Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Net Sales</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsReport?.breakdown && productsReport.breakdown.length > 0 ? (
                    productsReport.breakdown.map((row) => (
                      <TableRow key={`${row.product_id}-${row.variant_id}-${row.sku_snapshot}`}>
                        <TableCell className="max-w-[200px]">
                          <div className="font-medium text-foreground truncate" title={row.product_title_snapshot}>
                            {row.product_title_snapshot}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate" title={row.variant_title_snapshot}>
                            {row.variant_title_snapshot || 'Default Variant'}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.sku_snapshot}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                          {formatAnalyticsCount(row.quantity)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                          {formatAnalyticsMoney(row.net_sales, row.currency_code)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {row.profitability_status === 'RESTRICTED' ? (
                            <span className="text-[11px] text-muted-foreground">Restricted</span>
                          ) : row.gross_margin !== null ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              {formatAnalyticsMoney(row.gross_margin, row.currency_code)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700 dark:text-amber-400">Partial cost</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                        No product sales facts projected for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </PageSection>
        </div>

        {/* Operational Health Strip */}
        <div className="space-y-4">
          <PageSection
            title="Operational Health"
            description="Fulfillment and delivery indicators."
          >
            <div className="space-y-3">
              {/* Delivery Success Rate */}
              <PagePanel className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Truck className="size-3.5 text-primary" />
                    Delivery Success
                  </span>
                  <span className="text-xs font-mono font-semibold text-foreground">
                    {deliverySuccessRate !== null ? `${deliverySuccessRate.toFixed(1)}%` : 'No shipments'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-foreground tabular-nums">
                    {formatAnalyticsCount(deliveredCount)} / {formatAnalyticsCount(totalDeliveries)}
                  </span>
                  <span className="text-xs text-muted-foreground">Delivered / Total</span>
                </div>
                <div className="text-xs text-muted-foreground border-t border-border/50 pt-1.5 flex justify-between">
                  <span>Failed shipments: <strong className="font-mono text-foreground">{failedCount}</strong></span>
                  <button
                    type="button"
                    onClick={() => onNavigateView('delivery')}
                    className="text-primary hover:underline text-[11px]"
                  >
                    Delivery report →
                  </button>
                </div>
              </PagePanel>

              {/* Reverse Logistics: Returns & RTO */}
              <PagePanel className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <RotateCcw className="size-3.5 text-rose-500" />
                    Reverse Logistics
                  </span>
                  <span className="text-xs font-mono font-medium text-foreground">
                    {customerReturnCases + rtoCases} cases
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/50 pt-2">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Customer Returns</span>
                    <strong className="text-foreground font-mono text-base">{customerReturnCases}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Courier RTO</span>
                    <strong className="text-foreground font-mono text-base">{rtoCases}</strong>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-1">
                  RTO (Return to Origin) is couriers failing delivery; Returns are customer-initiated.
                </p>
              </PagePanel>

              {/* Storefront Traffic Pulse */}
              <PagePanel className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Users className="size-3.5 text-sky-500" />
                    Storefront Traffic
                  </span>
                  {isStorefrontNotTracked ? (
                    <StatusBadge status="NOT_ACTIVE" tone="neutral" />
                  ) : (
                    <StatusBadge status="ACTIVE" tone="success" />
                  )}
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-foreground tabular-nums">
                    {isStorefrontNotTracked
                      ? '—'
                      : formatAnalyticsCount(sfTotals?.eligible_sessions ?? 0)}
                  </span>
                  <span className="text-xs text-muted-foreground">Consented Sessions</span>
                </div>
                <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-1.5">
                  {isStorefrontNotTracked
                    ? 'No consented browser events collected. Tracking requires explicit client consent.'
                    : `Observed ${formatAnalyticsCount(sfTotals?.observed_order_sessions ?? 0)} converted order sessions.`}
                </p>
              </PagePanel>
            </div>
          </PageSection>
        </div>
      </div>

      {/* 4. Quick Module Jump Links */}
      <PageSection
        title="Explore Specialized Reports"
        description="Navigate to dedicated analytics workspaces for deep root-cause investigation."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Sales & Orders', view: 'sales' as const, icon: ShoppingBag, desc: 'Channels & statuses' },
            { label: 'Products & SKUs', view: 'products' as const, icon: PackageSearch, desc: 'Sales & margins' },
            { label: 'Customers', view: 'customers' as const, icon: Users, desc: 'Acquisition & LTV' },
            { label: 'Warehouse Stock', view: 'inventory' as const, icon: Boxes, desc: 'Snapshots & reserves' },
            { label: 'Finance & Ledger', view: 'finance' as const, icon: CreditCard, desc: 'Cash movement & COGS' },
            { label: 'Logistics & Couriers', view: 'delivery' as const, icon: Truck, desc: 'Pathao, Steadfast, RTO' },
          ].map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigateView(item.view)}
              className="flex flex-col text-left p-3.5 rounded-xl border border-border/70 bg-card hover:bg-card/80 hover:border-primary/50 transition-colors shadow-2xs group cursor-pointer"
            >
              <item.icon className="size-4 text-primary mb-2 group-hover:scale-110 transition-transform duration-150" />
              <strong className="text-xs font-semibold text-foreground truncate">{item.label}</strong>
              <small className="text-[11px] text-muted-foreground truncate mt-0.5">{item.desc}</small>
            </button>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
