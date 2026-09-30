'use client';

import { AlertCircle, ArrowUpRight, CheckCircle2, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CustomerDeliveryHistoryDto } from '@maevelle/contracts';

import { CustomerRiskBadge } from './delivery-status-badges';

interface CustomerDeliveryRiskCardProps {
  history?: CustomerDeliveryHistoryDto | null | undefined;
  customerName?: string | undefined;
  phone?: string | undefined;
  className?: string | undefined;
  compact?: boolean | undefined;
}

export function CustomerDeliveryRiskCard({
  history,
  customerName,
  phone,
  className,
  compact = false,
}: CustomerDeliveryRiskCardProps) {
  if (!history) {
    return (
      <Card className={cn('border-dashed bg-muted/20', className)}>
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          No delivery history recorded for this customer yet.
        </CardContent>
      </Card>
    );
  }

  const { risk, deliveredCount, failedDeliveryCount, rtoCount, eligibleDeliveries, successRate, rtoRate } = history;

  if (compact) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-xs', className)}>
        <div className="flex items-center gap-2">
          <CustomerRiskBadge level={risk.level} />
          <span className="text-muted-foreground">
            {deliveredCount} delivered · {rtoCount} RTO · {failedDeliveryCount} failed ({eligibleDeliveries} total)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>Success: <strong className="text-foreground">{successRate ?? '—'}%</strong></span>
          <span>RTO: <strong className="text-foreground">{rtoRate ?? '—'}%</strong></span>
          {phone ? (
            <Link
              href={`/deliveries?search=${encodeURIComponent(phone)}`}
              className="inline-flex items-center gap-0.5 text-primary hover:underline font-medium"
            >
              Deliveries <ArrowUpRight className="size-3" />
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              Customer Delivery Reliability
              <CustomerRiskBadge level={risk.level} />
            </CardTitle>
            <CardDescription className="text-xs">
              Cross-order delivery outcomes for {customerName ? `"${customerName}"` : 'this customer'}
              {phone ? ` (${phone})` : ''}
            </CardDescription>
          </div>
          {phone ? (
            <Link
              href={`/deliveries?search=${encodeURIComponent(phone)}`}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
            >
              Inspect all deliveries <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" /> Delivered
            </p>
            <p className="mt-1 text-lg font-bold text-foreground">{deliveredCount}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <RotateCcw className="size-3 text-rose-600" /> RTO count
            </p>
            <p className="mt-1 text-lg font-bold text-foreground">{rtoCount}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Success rate</p>
            <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {successRate !== null ? `${successRate}%` : '—'}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">RTO rate</p>
            <p className={cn('mt-1 text-lg font-bold', (rtoRate ?? 0) > 20 ? 'text-rose-600' : 'text-foreground')}>
              {rtoRate !== null ? `${rtoRate}%` : '—'}
            </p>
          </div>
        </div>

        {risk.reasons && risk.reasons.length > 0 ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-300">
            <p className="font-medium flex items-center gap-1.5 mb-1 text-amber-950 dark:text-amber-200">
              <AlertCircle className="size-3.5" /> Operational Insights
            </p>
            <ul className="space-y-0.5 list-disc list-inside">
              {risk.reasons.map((r, i) => (
                <li key={i}>{r.explanation}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 text-xs text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
            <span>Customer has clean delivery history without recorded delivery exceptions or abnormal RTO.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
