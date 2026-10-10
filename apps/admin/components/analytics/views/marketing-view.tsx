'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ExternalLink,
  Flame,
  Globe,
  Megaphone,
  Share2,
  Tag,
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
  formatAnalyticsPercent,
  type AnalyticsReportEnvelopeDto,
  type DateRangeSelection,
  type MarketingReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface MarketingViewProps {
  readonly selection: DateRangeSelection;
}

export function MarketingView({ selection }: MarketingViewProps) {
  const [report, setReport] = React.useState<AnalyticsReportEnvelopeDto<MarketingReportTotalsDto> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsReport<MarketingReportTotalsDto>('MARKETING', selection);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load marketing analytics.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (error) {
    return <ErrorState title="Marketing Analytics Error" message={error} onRetry={loadData} />;
  }

  const rows = report?.totals ?? [];
  const isNotTracked = report?.availability.status === 'NOT_TRACKED';

  const totalSessions = rows.reduce((sum, r) => sum + Number(r.sessions || 0), 0);
  const totalObservedOrders = rows.reduce((sum, r) => sum + Number(r.observed_orders || 0), 0);
  const overallConversion =
    totalSessions > 0 ? (totalObservedOrders / totalSessions) * 100 : null;

  return (
    <div className="space-y-6">
      {/* 1. Marketing KPIs */}
      <PageSection
        title="Marketing Attribution & Traffic Acquisition"
        description="Tracks acquisition channels, referral origin, and UTM campaign conversion."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Tracked Campaign Traffic"
            value={isNotTracked ? '—' : formatAnalyticsCount(totalSessions)}
            status={isNotTracked ? 'NOT_TRACKED' : 'AVAILABLE'}
            statusLabel={isNotTracked ? 'No Consented Events' : 'Active'}
            subtitle={isNotTracked ? 'UTM tracking uncollected' : 'Identified source sessions'}
            definitionTooltip="Consented sessions classified with first-touch or last-non-direct attribution parameters."
            loading={loading}
          />

          <MetricCard
            title="Attributed Orders"
            value={isNotTracked ? '—' : formatAnalyticsCount(totalObservedOrders)}
            subtitle="Observed purchase sessions"
            definitionTooltip="Sessions carrying UTM campaign parameters that culminated in an ORDER_PLACED event."
            loading={loading}
          />

          <MetricCard
            title="Campaign Conversion Rate"
            value={
              isNotTracked || overallConversion === null
                ? '—'
                : `${overallConversion.toFixed(2)}%`
            }
            subtitle="Observed orders / sessions"
            definitionTooltip="Attributed conversion rate across tracked acquisition campaigns."
            loading={loading}
          />

          <MetricCard
            title="Attribution Model"
            value="First / Non-Direct"
            subtitle="Canonical model rule"
            definitionTooltip="Maevelle tracks first-touch acquisition origin and last-non-direct campaign parameters."
            loading={loading}
          />
        </div>
      </PageSection>

      {/* 2. UTM Campaign Performance Table */}
      <PageSection
        title="Campaign & Traffic Source Breakdown"
        description="Performance categorized by Source, Medium, and Campaign tags."
      >
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>UTM Source</TableHead>
                <TableHead>UTM Medium</TableHead>
                <TableHead>Campaign Tag</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Orders Placed</TableHead>
                <TableHead className="text-right">Conversion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={6} className="py-4">
                      <div className="h-4 bg-muted/60 rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 || isNotTracked ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    {isNotTracked
                      ? 'No consented campaign attribution events collected for this organization.'
                      : 'No attributed campaign traffic found during this date window.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => {
                  const sCount = Number(row.sessions || 0);
                  const oCount = Number(row.observed_orders || 0);
                  const rate = sCount > 0 ? (oCount / sCount) * 100 : null;

                  return (
                    <TableRow key={`${row.source}-${row.medium}-${row.campaign}-${idx}`}>
                      <TableCell className="font-semibold text-foreground text-xs">
                        {row.source}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {row.medium}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-primary font-medium">
                        {row.campaign}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                        {formatAnalyticsCount(sCount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-foreground">
                        {formatAnalyticsCount(oCount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {rate !== null ? (
                          <span className={rate > 0 ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}>
                            {rate.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </PageSection>

      {/* 3. Social Channel vs Paid Ad Distinction */}
      <div className="p-4 rounded-xl bg-info/10 border border-info/20 text-xs text-foreground/80 flex items-start gap-2.5">
        <Megaphone className="size-4 text-info shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground font-semibold">Attribution Truth Principle:</strong>{' '}
          Manual orders entered with source <code className="font-mono text-foreground font-semibold">FACEBOOK</code> or{' '}
          <code className="font-mono text-foreground font-semibold">INSTAGRAM</code> indicate the customer conversation
          happened on social media; they are NOT automatically classified as measured paid ad
          conversions unless verified UTM ad campaign parameters were attached to the session.
        </div>
      </div>
    </div>
  );
}
