'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  Eye,
  MousePointerClick,
  ShoppingBag,
  ShoppingCart,
  Users,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState, PagePanel, PageSection } from '@/components/ui/page-shell';
import { StorefrontFunnelChart } from '../analytics-charts';
import { MetricCard } from '../analytics-kpi-card';
import {
  formatAnalyticsCount,
  formatAnalyticsPercent,
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type StorefrontReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface StorefrontViewProps {
  readonly selection: DateRangeSelection;
}

export function StorefrontView({ selection }: StorefrontViewProps) {
  const [report, setReport] = React.useState<AnalyticsReportEnvelopeDto<StorefrontReportTotalsDto> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsReport<StorefrontReportTotalsDto>('STOREFRONT', selection);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load storefront analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (error) {
    return <ErrorState title="Storefront Analytics Error" message={error} onRetry={loadData} />;
  }

  const totals = report?.totals?.[0];
  const isNotTracked = report?.availability.status === 'NOT_TRACKED';

  const eligibleSessions = Number(totals?.eligible_sessions || 0);
  const productViewSessions = Number(totals?.product_view_sessions || 0);
  const cartSessions = Number(totals?.cart_sessions || 0);
  const checkoutSessions = Number(totals?.checkout_sessions || 0);
  const orderSessions = Number(totals?.observed_order_sessions || 0);

  const funnelStages = [
    {
      id: 'sessions',
      name: 'Eligible Sessions',
      count: eligibleSessions,
      stageConversionRate: null,
    },
    {
      id: 'views',
      name: 'Product Views',
      count: productViewSessions,
      stageConversionRate:
        eligibleSessions > 0 ? (productViewSessions / eligibleSessions).toFixed(4) : null,
    },
    {
      id: 'cart',
      name: 'Added to Cart',
      count: cartSessions,
      stageConversionRate: totals?.product_view_to_cart_rate ?? null,
    },
    {
      id: 'checkout',
      name: 'Started Checkout',
      count: checkoutSessions,
      stageConversionRate: totals?.cart_to_checkout_rate ?? null,
    },
    {
      id: 'orders',
      name: 'Orders Placed',
      count: orderSessions,
      stageConversionRate: totals?.checkout_completion_rate ?? null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Funnel KPIs */}
      <PageSection
        title="Storefront Browsing & Conversion Funnel"
        description="Tracks consented browsing sessions through product discovery, cart, checkout, and purchase completion."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Consented Sessions"
            value={isNotTracked ? '—' : formatAnalyticsCount(eligibleSessions)}
            status={isNotTracked ? 'NOT_TRACKED' : 'AVAILABLE'}
            statusLabel={isNotTracked ? 'Consent Required' : 'Active'}
            subtitle={isNotTracked ? 'Tracking not yet collected' : 'Consented visitor sessions'}
            definitionTooltip="Distinct browser sessions where analytics consent was explicitly GRANTED. Denied and unknown sessions are rejected from persistence."
            loading={loading}
          />

          <MetricCard
            title="Product View → Cart Rate"
            value={isNotTracked ? '—' : formatAnalyticsPercent(totals?.product_view_to_cart_rate)}
            subtitle={`${formatAnalyticsCount(cartSessions)} added to cart`}
            definitionTooltip="Sessions with at least one ADD_TO_CART event divided by sessions with at least one PRODUCT_VIEWED event."
            loading={loading}
          />

          <MetricCard
            title="Cart → Checkout Rate"
            value={isNotTracked ? '—' : formatAnalyticsPercent(totals?.cart_to_checkout_rate)}
            subtitle={`${formatAnalyticsCount(checkoutSessions)} began checkout`}
            definitionTooltip="Sessions initiating checkout divided by sessions with cart activity."
            loading={loading}
          />

          <MetricCard
            title="Overall Session Conversion"
            value={
              isNotTracked
                ? '—'
                : formatAnalyticsPercent(totals?.observed_session_conversion_rate)
            }
            subtitle={`${formatAnalyticsCount(orderSessions)} orders observed`}
            definitionTooltip="Observed order sessions divided by total eligible consented sessions in this period."
            loading={loading}
          />
        </div>
      </PageSection>

      {/* 2. Conversion Funnel Visual */}
      <PageSection
        title="Conversion Stage Analysis"
        description="Stage-by-stage progression and drop-off rates across the purchase lifecycle."
      >
        <PagePanel>
          <StorefrontFunnelChart
            stages={funnelStages}
            isNotTracked={isNotTracked}
            notTrackedReason={report?.availability.reason ?? null}
          />
        </PagePanel>
      </PageSection>

      {/* 3. Measurement Integrity & Privacy Invariants */}
      <div className="p-4 rounded-xl bg-info/10 border border-info/20 text-xs text-foreground/80 flex items-start gap-2.5">
        <Activity className="size-4 text-info shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Measurement Policy & Consent Boundaries:</strong>{' '}
          Behavioral storefront metrics are strictly consent-gated. If a shopper selects &ldquo;Deny&rdquo;
          or has not yet expressed consent, their browsing events are dropped at the edge and never
          persisted. Transactional order creation remains 100% authoritative and operates
          independently of behavioral tracking.
        </div>
      </div>
    </div>
  );
}
