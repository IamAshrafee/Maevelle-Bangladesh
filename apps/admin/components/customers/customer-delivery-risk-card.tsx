'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  HelpCircle,
  Info,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
  Truck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { CustomerRiskBadge } from './customer-risk-badge';

export interface CustomerDeliveryHistoryData {
  readonly eligibleDeliveries: number;
  readonly deliveredCount: number;
  readonly failedDeliveryCount: number;
  readonly rtoCount: number;
  readonly successRate: number | null;
  readonly rtoRate: number | null;
  readonly lastSuccessfulDelivery?: string;
  readonly lastRto?: string;
  readonly risk: {
    readonly level: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED' | string;
    readonly reasons: readonly { readonly code: string; readonly explanation: string }[];
  };
  readonly providerHistory?: readonly {
    readonly providerCode: string;
    readonly total: number;
    readonly delivered: number;
    readonly rto: number;
  }[];
  readonly recentOutcomes?: readonly {
    readonly deliveryId: string;
    readonly deliveryNumber: string;
    readonly orderNumber: string;
    readonly providerCode?: string;
    readonly outcome: string;
    readonly occurredAt: string;
  }[];
  readonly checkedAt?: string;
}

interface CustomerDeliveryRiskCardProps {
  readonly history?: CustomerDeliveryHistoryData | null;
  readonly customerSearchTerm: string;
}

export function CustomerDeliveryRiskCard({
  history,
  customerSearchTerm,
}: CustomerDeliveryRiskCardProps) {
  const [showAllOutcomes, setShowAllOutcomes] = useState(false);

  if (!history) {
    return (
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Delivery Intelligence</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          No delivery records observed for this customer.
        </p>
      </section>
    );
  }

  const riskLevel = history.risk.level;
  const recentOutcomes = history.recentOutcomes ?? [];
  const visibleOutcomes = showAllOutcomes ? recentOutcomes : recentOutcomes.slice(0, 3);

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Delivery Intelligence">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Delivery & RTO Intelligence</h2>
        </div>
        <CustomerRiskBadge level={riskLevel} />
      </div>

      <div className="space-y-4 p-6">
        {/* Core Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">Delivered</span>
            <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {history.deliveredCount}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {history.successRate !== null ? `${history.successRate}% rate` : 'N/A'}
            </span>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">RTO / Returned</span>
            <p className={`mt-1 text-lg font-bold ${history.rtoCount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-foreground'}`}>
              {history.rtoCount}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {history.rtoRate !== null ? `${history.rtoRate}% rate` : '0%'}
            </span>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">Failed Attempts</span>
            <p className="mt-1 text-lg font-bold text-foreground">
              {history.failedDeliveryCount}
            </p>
            <span className="text-[10px] text-muted-foreground">Customer unreachable/rejected</span>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <span className="text-[11px] font-medium text-muted-foreground">Handed Over</span>
            <p className="mt-1 text-lg font-bold text-foreground">
              {history.eligibleDeliveries}
            </p>
            <span className="text-[10px] text-muted-foreground">Eligible dispatches</span>
          </div>
        </div>

        {/* Explainable Risk Signals */}
        <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Info className="size-3.5 text-primary" aria-hidden="true" />
            <span>Factual Delivery Risk Assessment:</span>
          </div>
          {history.risk.reasons.length > 0 ? (
            <ul className="space-y-1.5 pl-5 list-disc text-xs text-muted-foreground">
              {history.risk.reasons.map((reason, idx) => (
                <li key={idx} className="leading-tight">
                  <span className="text-foreground">{reason.explanation}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sufficient successful delivery history without repetitive courier returns.
            </p>
          )}
        </div>

        {/* Courier / Provider Breakdown */}
        {history.providerHistory && history.providerHistory.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Courier Network History
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {history.providerHistory.map((p) => (
                <div
                  key={p.providerCode}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-xs"
                >
                  <span className="font-semibold capitalize text-foreground">
                    {p.providerCode.toLowerCase()}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-700 font-medium">{p.delivered} delivered</span>
                    <span>·</span>
                    <span className="text-rose-600 font-medium">{p.rto} RTO</span>
                    <span className="text-muted-foreground">({p.total} total)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Recent Delivery Outcomes */}
        {recentOutcomes.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Consignment Outcomes
              </span>
              {recentOutcomes.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllOutcomes(!showAllOutcomes)}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  {showAllOutcomes ? 'Show less' : `View all (${recentOutcomes.length})`}
                </button>
              )}
            </div>

            <div className="divide-y rounded-md border">
              {visibleOutcomes.map((item) => (
                <div
                  key={item.deliveryId}
                  className="flex items-center justify-between px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-medium text-foreground">
                      Consignment {item.deliveryNumber}
                    </span>
                    <span className="ml-1.5 text-muted-foreground">
                      (Order #{item.orderNumber})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        item.outcome === 'DELIVERED'
                          ? 'border-emerald-300 text-emerald-700'
                          : item.outcome.includes('RTO') || item.outcome === 'FAILED'
                            ? 'border-rose-300 text-rose-700'
                            : ''
                      }`}
                    >
                      {item.outcome.replaceAll('_', ' ')}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Intl.DateTimeFormat('en-BD', { dateStyle: 'short' }).format(
                        new Date(item.occurredAt),
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span>
            {history.checkedAt
              ? `Calculated on ${new Intl.DateTimeFormat('en-BD', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(history.checkedAt))}`
              : 'Internal live data'}
          </span>
          <Link
            href={`/deliveries?q=${encodeURIComponent(customerSearchTerm)}`}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Explore in Deliveries Workspace <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
