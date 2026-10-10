'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Bell,
  BriefcaseBusiness,
  ExternalLink,
  HeartHandshake,
  Mail,
  MessageSquare,
  RotateCcw,
  Star,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReviewDistribution } from '../analytics-charts';
import { MetricCard } from '../analytics-kpi-card';
import {
  formatAnalyticsCount,
  formatAnalyticsMoney,
  type AnalyticsReportEnvelopeDto,
  type AssetsReportTotalsDto,
  type DateRangeSelection,
  type NotificationsReportTotalsDto,
  type ReturnsReportTotalsDto,
  type ReviewsReportTotalsDto,
} from '@/lib/analytics/types';
import { fetchAnalyticsReport } from '@/lib/analytics/api';

interface OperationsViewProps {
  readonly selection: DateRangeSelection;
}

export function OperationsView({ selection }: OperationsViewProps) {
  const [activeTab, setActiveTab] = React.useState<'returns' | 'reviews' | 'notifications' | 'assets'>('returns');

  const [returnsReport, setReturnsReport] = React.useState<AnalyticsReportEnvelopeDto<ReturnsReportTotalsDto> | null>(null);
  const [reviewsReport, setReviewsReport] = React.useState<AnalyticsReportEnvelopeDto<ReviewsReportTotalsDto> | null>(null);
  const [notifReport, setNotifReport] = React.useState<AnalyticsReportEnvelopeDto<NotificationsReportTotalsDto> | null>(null);
  const [assetsReport, setAssetsReport] = React.useState<AnalyticsReportEnvelopeDto<AssetsReportTotalsDto> | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ret, rev, notif, ass] = await Promise.all([
        fetchAnalyticsReport<ReturnsReportTotalsDto>('RETURNS', selection),
        fetchAnalyticsReport<ReviewsReportTotalsDto>('REVIEWS', selection),
        fetchAnalyticsReport<NotificationsReportTotalsDto>('NOTIFICATIONS', selection),
        fetchAnalyticsReport<AssetsReportTotalsDto>('ASSETS', selection),
      ]);
      setReturnsReport(ret);
      setReviewsReport(rev);
      setNotifReport(notif);
      setAssetsReport(ass);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load operational reports.');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (error) {
    return <ErrorState title="Operational Reports Error" message={error} onRetry={loadData} />;
  }

  // 1. Returns aggregates
  const returnRows = returnsReport?.totals ?? [];
  const totalReturnCases = returnRows.reduce((sum, r) => sum + Number(r.cases || 0), 0);
  const totalRequestedUnits = returnRows.reduce((sum, r) => sum + Number(r.requested_quantity || 0), 0);
  const totalReceivedUnits = returnRows.reduce((sum, r) => sum + Number(r.received_quantity || 0), 0);
  const totalRefundAmount = returnRows.reduce((sum, r) => sum + Number(r.refunds || 0), 0);

  // 2. Reviews aggregates
  const reviewRows = reviewsReport?.totals ?? [];
  const totalReviews = reviewRows.reduce((sum, r) => sum + Number(r.reviews || 0), 0);
  const ratingSum = reviewRows.reduce(
    (sum, r) => sum + Number(r.rating || 0) * Number(r.reviews || 0),
    0,
  );
  const averageRating = totalReviews > 0 ? ratingSum / totalReviews : null;

  const reviewRatingItems = [5, 4, 3, 2, 1].map((stars) => {
    const matching = reviewRows.filter((r) => Number(r.rating) === stars);
    const count = matching.reduce((sum, r) => sum + Number(r.reviews || 0), 0);
    return { rating: stars, count };
  });

  // 3. Notifications aggregates
  const notifRows = notifReport?.totals ?? [];
  const totalNotifs = notifRows.reduce((sum, r) => sum + Number(r.notifications || 0), 0);
  const emailCount = notifRows
    .filter((n) => n.channel.toUpperCase() === 'EMAIL')
    .reduce((sum, n) => sum + Number(n.notifications || 0), 0);
  const smsCount = notifRows
    .filter((n) => n.channel.toUpperCase() === 'SMS')
    .reduce((sum, n) => sum + Number(n.notifications || 0), 0);

  // 4. Assets aggregates
  const assetRows = assetsReport?.totals ?? [];
  const totalAssets = assetRows.reduce((sum, r) => sum + Number(r.assets || 0), 0);
  const assetCostSum = assetRows.reduce(
    (sum, r) => (r.acquisition_cost ? sum + Number(r.acquisition_cost) : sum),
    0,
  );

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as typeof activeTab)}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
          <TabsList>
            <TabsTrigger value="returns" className="gap-1.5">
              <RotateCcw className="size-3.5" />
              <span>Returns & Refunds</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-1">({totalReturnCases})</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="gap-1.5">
              <HeartHandshake className="size-3.5" />
              <span>Customer Reviews</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-1">({totalReviews})</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5">
              <Bell className="size-3.5" />
              <span>Notifications & Dispatch</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-1">({totalNotifs})</span>
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-1.5">
              <BriefcaseBusiness className="size-3.5" />
              <span>Fixed Assets</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-1">({totalAssets})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* =================================================================== */}
        {/* Tab 1: Returns & Refunds */}
        {/* =================================================================== */}
        <TabsContent value="returns" className="space-y-6">
          <PageSection
            title="Reverse Logistics & Return Cases"
            description="Returns requested by customers and RTO cases processed in the returns domain."
            actions={
              <Link
                href="/returns"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <span>Returns workspace</span>
                <ExternalLink className="size-3" />
              </Link>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Return Cases"
                value={formatAnalyticsCount(totalReturnCases)}
                subtitle="Cases opened in period"
                definitionTooltip="Customer return requests and courier return-to-origin cases."
                loading={loading}
              />
              <MetricCard
                title="Requested Units"
                value={formatAnalyticsCount(totalRequestedUnits)}
                subtitle="Units claimed by customers"
                definitionTooltip="Item count requested for return across return case lines."
                loading={loading}
              />
              <MetricCard
                title="Units Received into Stock"
                value={formatAnalyticsCount(totalReceivedUnits)}
                subtitle="Inspected reverse receipts"
                definitionTooltip="Physical units inspected and accepted back into warehouse reverse inventory."
                loading={loading}
              />
              <MetricCard
                title="Completed Refunds"
                value={formatAnalyticsMoney(totalRefundAmount, selection.currency)}
                subtitle="Disbursed return refunds"
                definitionTooltip="Payments refunds linked to commercial return case resolutions."
                loading={loading}
              />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden mt-4">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Case Type</TableHead>
                    <TableHead>Case Status</TableHead>
                    <TableHead>Receipt Status</TableHead>
                    <TableHead>Resolution</TableHead>
                    <TableHead className="text-right">Cases</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Refund Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                        No return cases recorded in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    returnRows.map((row, idx) => (
                      <TableRow key={`${row.case_type}-${row.case_status}-${idx}`}>
                        <TableCell className="font-semibold text-foreground text-xs">
                          {row.case_type}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={row.case_status}
                            tone={row.case_status === 'RESOLVED' ? 'success' : 'warning'}
                            className="text-[10px] px-1.5 py-0"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {row.receipt_status}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {row.commercial_resolution_status}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                          {formatAnalyticsCount(row.cases)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                          {formatAnalyticsCount(row.requested_quantity)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                          {formatAnalyticsCount(row.received_quantity)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-rose-600 dark:text-rose-400">
                          {formatAnalyticsMoney(row.refunds, row.currency_code)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </PageSection>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 2: Customer Reviews */}
        {/* =================================================================== */}
        <TabsContent value="reviews" className="space-y-6">
          <PageSection
            title="Product Quality & Customer Ratings"
            description="Submitted reviews, moderation statuses, and star rating distributions."
            actions={
              <Link
                href="/reviews"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <span>Reviews moderation</span>
                <ExternalLink className="size-3" />
              </Link>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <MetricCard
                title="Total Customer Reviews"
                value={formatAnalyticsCount(totalReviews)}
                subtitle="Reviews submitted in period"
                definitionTooltip="Customer reviews submitted across products during this reporting period."
                loading={loading}
              />
              <MetricCard
                title="Average Star Rating"
                value={averageRating ? `${averageRating.toFixed(2)} ★` : '—'}
                subtitle="Out of 5.0 stars"
                definitionTooltip="Weighted average of star ratings across submitted reviews."
                loading={loading}
              />
              <MetricCard
                title="Published Ratings"
                value={formatAnalyticsCount(
                  reviewRows
                    .filter((r) => r.visibility_status === 'PUBLISHED')
                    .reduce((sum, r) => sum + Number(r.reviews || 0), 0),
                )}
                subtitle="Live on storefront catalog"
                definitionTooltip="Reviews approved by merchant moderation and live on product pages."
                loading={loading}
              />
            </div>

            <PagePanel className="p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Star Rating Distribution Breakdown
              </h4>
              <ReviewDistribution
                ratings={reviewRatingItems}
                averageRating={averageRating ?? undefined}
                totalReviews={totalReviews}
              />
            </PagePanel>
          </PageSection>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 3: Notifications & Dispatch */}
        {/* =================================================================== */}
        <TabsContent value="notifications" className="space-y-6">
          <PageSection
            title="Notification Delivery & Provider Dispatch"
            description="Transactional emails and SMS messages triggered across commercial events."
            actions={
              <Link
                href="/notifications"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <span>Notification center</span>
                <ExternalLink className="size-3" />
              </Link>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <MetricCard
                title="Total Dispatched"
                value={formatAnalyticsCount(totalNotifs)}
                subtitle="Across email & SMS channels"
                definitionTooltip="Transactional communications triggered in Notifications domain."
                loading={loading}
              />
              <MetricCard
                title="Email Deliveries"
                value={formatAnalyticsCount(emailCount)}
                subtitle="Via Resend transactional engine"
                definitionTooltip="Customer order confirmations, tracking alerts, and invoice emails."
                loading={loading}
              />
              <MetricCard
                title="SMS Broadcasts"
                value={formatAnalyticsCount(smsCount)}
                subtitle="Via SMS gateway"
                definitionTooltip="SMS OTPs and doorstep dispatch notifications."
                loading={loading}
              />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Dispatch Status</TableHead>
                    <TableHead className="text-right">Message Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                        No notifications triggered in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    notifRows.map((row, idx) => (
                      <TableRow key={`${row.channel}-${row.status}-${row.provider}-${idx}`}>
                        <TableCell className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                          {row.channel.toUpperCase() === 'EMAIL' ? (
                            <Mail className="size-3.5 text-primary" />
                          ) : (
                            <MessageSquare className="size-3.5 text-sky-500" />
                          )}
                          <span>{row.channel}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.provider}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={row.status}
                            tone={
                              row.status === 'SENT' || row.status === 'DELIVERED'
                                ? 'success'
                                : row.status === 'FAILED'
                                  ? 'danger'
                                  : 'warning'
                            }
                            className="text-[10px] px-1.5 py-0"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-foreground">
                          {formatAnalyticsCount(row.notifications)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </PageSection>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 4: Fixed Assets */}
        {/* =================================================================== */}
        <TabsContent value="assets" className="space-y-6">
          <PageSection
            title="Fixed Asset Valuation & Equipment"
            description="Capital equipment, warehouse machinery, and operational property tracking."
            actions={
              <Link
                href="/assets"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <span>Assets console</span>
                <ExternalLink className="size-3" />
              </Link>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <MetricCard
                title="Tracked Fixed Assets"
                value={formatAnalyticsCount(totalAssets)}
                subtitle="Equipment & property records"
                definitionTooltip="Items registered in Assets domain."
                loading={loading}
              />
              <MetricCard
                title="Recorded Acquisition Cost"
                value={formatAnalyticsMoney(assetCostSum, selection.currency)}
                subtitle="Capitalized acquisition value"
                definitionTooltip="Sum of capitalized asset acquisition costs recorded in Assets."
                loading={loading}
              />
            </div>

            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Operational Status</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Asset Units</TableHead>
                    <TableHead className="text-right">Acquisition Cost</TableHead>
                    <TableHead className="text-center">Valuation Completeness</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                        No asset acquisitions recorded in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    assetRows.map((row, idx) => (
                      <TableRow key={`${row.status}-${row.condition}-${idx}`}>
                        <TableCell className="font-semibold text-foreground text-xs">
                          {row.status}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {row.condition}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                          {formatAnalyticsCount(row.assets)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums font-bold text-foreground">
                          {row.acquisition_cost !== null
                            ? formatAnalyticsMoney(row.acquisition_cost, row.currency_code)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge
                            status={row.valuation_status}
                            tone={row.valuation_status === 'AVAILABLE' ? 'success' : 'warning'}
                            className="text-[10px] px-1.5 py-0"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </PageSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
