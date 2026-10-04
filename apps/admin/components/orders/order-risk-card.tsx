'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import Link from 'next/link';

import type { OrderDeliveryRiskAssessmentDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchApiData } from '@/lib/api';
import { RecordVerificationDialog } from './record-verification-dialog';

interface OrderRiskCardProps {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerPhone?: string | null | undefined;
  readonly onVerificationRecorded?: (() => void) | undefined;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  return date.toLocaleDateString('en-BD', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(amount: number | string | undefined | null): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrderRiskCard({
  orderId,
  orderNumber,
  customerPhone,
  onVerificationRecorded,
}: OrderRiskCardProps) {
  const [assessment, setAssessment] = useState<OrderDeliveryRiskAssessmentDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadData(force = false) {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      if (force) {
        const refreshed = await fetchApiData<OrderDeliveryRiskAssessmentDto>(
          `/admin/orders/${orderId}/risk-assessment/refresh`,
          { method: 'POST' },
        );
        setAssessment(refreshed);
      } else {
        const data = await fetchApiData<OrderDeliveryRiskAssessmentDto>(
          `/admin/orders/${orderId}/risk-assessment`,
        );
        setAssessment(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load risk evaluation');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData(false);
  }, [orderId]);

  if (loading) {
    return (
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Evaluating delivery history & courier risk…</span>
        </div>
      </section>
    );
  }

  if (error && !assessment) {
    return (
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="size-4 text-amber-500" />
            <span>Delivery risk assessment unavailable</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void loadData(true)}>
            Retry
          </Button>
        </div>
      </section>
    );
  }

  if (!assessment) return null;

  const { overallRiskLevel, recommendation, signals, internalHistory, providerHistory, duplicateOrders } =
    assessment;

  // Determine badge styling based on overall risk level
  const riskBadgeConfig = {
    LOW: {
      label: 'Low Risk',
      variant: 'outline' as const,
      className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
      icon: ShieldCheck,
    },
    MODERATE: {
      label: 'Moderate Risk',
      variant: 'outline' as const,
      className: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
      icon: AlertTriangle,
    },
    ELEVATED: {
      label: 'Elevated Risk',
      variant: 'outline' as const,
      className: 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
      icon: ShieldAlert,
    },
    INSUFFICIENT_HISTORY: {
      label: 'Limited History',
      variant: 'outline' as const,
      className: 'border-slate-300 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
      icon: Info,
    },
  }[overallRiskLevel] ?? {
    label: overallRiskLevel,
    variant: 'outline' as const,
    className: '',
    icon: Info,
  };

  const RiskIcon = riskBadgeConfig.icon;

  // Recommendation banner details
  const recommendationBanner = {
    APPROVE_COD: {
      title: 'Approved for COD',
      description: 'Customer has clean delivery history. Routine confirmation recommended.',
      tone: 'emerald',
    },
    VERIFY_CUSTOMER: {
      title: 'Verification Recommended',
      description: 'Customer contact or phone confirmation advised prior to dispatch.',
      tone: 'amber',
    },
    REQUIRE_PREPAYMENT: {
      title: 'Prepayment Recommended',
      description: 'High return / RTO pattern detected across courier network.',
      tone: 'rose',
    },
    REJECT_SUSPICIOUS: {
      title: 'Suspicious Activity Detected',
      description: 'Elevated risk factors detected. Review order details carefully.',
      tone: 'rose',
    },
  }[recommendation] ?? {
    title: recommendation.replaceAll('_', ' '),
    description: 'Advisory guidance based on multi-courier and internal history.',
    tone: 'slate',
  };

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Delivery Risk and Fraud Check">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Truck className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Delivery Intelligence & Risk</h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${riskBadgeConfig.className}`}
          >
            <RiskIcon className="size-3.5" aria-hidden="true" />
            {riskBadgeConfig.label}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            title="Refresh Steadfast fraud check & recalculate"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh Check</span>
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-6 text-sm">
        {/* Recommendation Banner */}
        <div
          className={`flex items-start gap-3 rounded-lg border p-3.5 ${
            recommendationBanner.tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100'
              : recommendationBanner.tone === 'amber'
                ? 'border-amber-200 bg-amber-50/70 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100'
                : 'border-rose-200 bg-rose-50/70 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100'
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {recommendationBanner.tone === 'emerald' ? (
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : recommendationBanner.tone === 'amber' ? (
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{recommendationBanner.title}</p>
            <p className="mt-0.5 text-xs opacity-90">{recommendationBanner.description}</p>
          </div>
          <RecordVerificationDialog
            orderId={orderId}
            orderNumber={orderNumber}
            customerPhone={customerPhone}
            onCompleted={() => {
              void loadData(true);
              onVerificationRecorded?.();
            }}
            trigger={
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 bg-background/80 shadow-none">
                <PhoneCall className="mr-1 size-3" /> Verify
              </Button>
            }
          />
        </div>

        {/* Duplicate Order Warning */}
        {duplicateOrders && duplicateOrders.length > 0 && (
          <div className="rounded-lg border border-rose-300 bg-rose-50/80 p-3.5 text-xs text-rose-950 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-100">
            <div className="flex items-center gap-1.5 font-semibold text-rose-900 dark:text-rose-300">
              <AlertTriangle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>Probable duplicate order detected ({duplicateOrders.length} candidate{duplicateOrders.length === 1 ? '' : 's'} within 48h)</span>
            </div>
            <ul className="mt-2 divide-y divide-rose-200/60 dark:divide-rose-900/60">
              {duplicateOrders.map((dup) => (
                <li key={dup.orderId} className="flex items-center justify-between py-1.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/orders/${dup.orderId}`}
                      className="font-medium text-rose-900 dark:text-rose-200 hover:underline inline-flex items-center gap-1"
                    >
                      {dup.orderNumber}
                      <ExternalLink className="size-3 opacity-70" />
                    </Link>
                    <span className="ml-2 text-[11px] text-muted-foreground">({dup.orderStatus})</span>
                    <p className="text-[11px] text-rose-800/80 dark:text-rose-300/80">
                      {dup.matchingReasons.join(' · ')}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                    {formatRelativeTime(dup.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Delivery History Breakdown Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Internal Maevelle History */}
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                Maevelle Store History
              </span>
              <span className="text-[11px] text-muted-foreground">Internal</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground text-[11px]">Orders placed</span>
                <p className="font-semibold text-sm">{internalHistory.ordersCount}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Delivered</span>
                <p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                  {internalHistory.deliveredCount}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">RTO (Returned)</span>
                <p className={`font-semibold text-sm ${internalHistory.rtoCount > 0 ? 'text-rose-600' : 'text-foreground'}`}>
                  {internalHistory.rtoCount}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px]">Return rate</span>
                <p className="font-semibold text-sm">
                  {internalHistory.rtoRate !== null ? `${internalHistory.rtoRate}%` : '—'}
                </p>
              </div>
              <div className="col-span-2 border-t pt-1.5 mt-1 flex justify-between text-[11px]">
                <span className="text-muted-foreground">Delivered spend</span>
                <span className="font-medium text-foreground">{formatMoney(internalHistory.totalDeliveredSpend)}</span>
              </div>
            </div>
          </div>

          {/* Steadfast Official Fraud Check */}
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                Steadfast Courier Network
              </span>
              {providerHistory.steadfast?.available ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded font-medium dark:bg-emerald-950 dark:text-emerald-300">
                  Active
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Unavailable</span>
              )}
            </div>

            {providerHistory.steadfast?.available ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground text-[11px]">Total parcels</span>
                  <p className="font-semibold text-sm">{providerHistory.steadfast.totalParcels}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Delivered</span>
                  <p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                    {providerHistory.steadfast.deliveredCount}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Cancelled / Return</span>
                  <p className={`font-semibold text-sm ${providerHistory.steadfast.cancelledCount > 0 ? 'text-rose-600' : 'text-foreground'}`}>
                    {providerHistory.steadfast.cancelledCount}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Success rate</span>
                  <p className="font-semibold text-sm">
                    {providerHistory.steadfast.successRate !== null
                      ? `${providerHistory.steadfast.successRate}%`
                      : '—'}
                  </p>
                </div>
                <div className="col-span-2 border-t pt-1.5 mt-1 flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Fraud reports filed</span>
                  <span className={`font-semibold ${providerHistory.steadfast.fraudReportsCount > 0 ? 'text-rose-600' : 'text-foreground'}`}>
                    {providerHistory.steadfast.fraudReportsCount}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-center text-xs text-muted-foreground py-2">
                <p>{providerHistory.steadfast?.error ?? 'Steadfast fraud check credentials not configured.'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Explainable Signals List */}
        {signals && signals.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Advisory Signals ({signals.length})
            </p>
            <div className="space-y-1.5">
              {signals.map((sig) => (
                <div
                  key={sig.code}
                  className="flex items-start gap-2 rounded-md border bg-background p-2.5 text-xs"
                >
                  <span
                    className={`mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      sig.severity === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : sig.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    }`}
                  >
                    {sig.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{sig.title}</p>
                    <p className="mt-0.5 text-muted-foreground">{sig.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Freshness & Metadata Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            Evaluated {formatRelativeTime(assessment.evaluatedAt)}
            {assessment.isFresh ? ' (Cached)' : ''}
          </span>
          <span>Normalized: {assessment.normalizedPhone}</span>
        </div>
      </div>
    </section>
  );
}
