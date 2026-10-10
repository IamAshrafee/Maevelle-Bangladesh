'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, BarChart3, HelpCircle } from 'lucide-react';

import { formatAnalyticsCount, formatAnalyticsMoney, formatAnalyticsPercent } from '@/lib/analytics/types';
import { cn } from '@/lib/utils';

// ============================================================================
// 1. Sales Trend Chart
// ============================================================================

export interface SalesTrendDataPoint {
  readonly period: string;
  readonly order_total: number;
  readonly refunds?: number;
  readonly orders: number;
}

interface SalesTrendChartProps {
  readonly data: readonly SalesTrendDataPoint[];
  readonly height?: number;
  readonly currency?: string;
  readonly className?: string;
}

export function SalesTrendChart({
  data,
  height = 300,
  currency = 'BDT',
  className,
}: SalesTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center text-muted-foreground',
          className,
        )}
        style={{ height }}
      >
        <BarChart3 className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-foreground">No sales activity in this period</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select a broader date range or rebuild projections if orders were placed recently.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...data]} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="orderTotalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="refundsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#e11d48" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#e11d48" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.6)" />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(val: number) => {
              if (val >= 1_000_000) return `৳${(val / 1_000_000).toFixed(1)}M`;
              if (val >= 1_000) return `৳${(val / 1_000).toFixed(0)}K`;
              return `৳${val}`;
            }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as SalesTrendDataPoint;
              return (
                <div className="rounded-lg border border-border bg-card p-3 shadow-md text-xs space-y-1.5 min-w-44">
                  <p className="font-semibold text-foreground font-mono">{label}</p>
                  <div className="border-t border-border/60 pt-1.5 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="size-2 rounded-full bg-teal-600" />
                        Order Total:
                      </span>
                      <strong className="font-mono text-foreground tabular-nums">
                        {formatAnalyticsMoney(point.order_total, currency)}
                      </strong>
                    </div>
                    {point.refunds ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 rounded-full bg-rose-500" />
                          Refunds:
                        </span>
                        <strong className="font-mono text-rose-600 tabular-nums">
                          -{formatAnalyticsMoney(point.refunds, currency)}
                        </strong>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-1">
                      <span className="text-muted-foreground">Orders Count:</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {formatAnalyticsCount(point.orders)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="order_total"
            name="Order Total"
            stroke="#0d9488"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#orderTotalGrad)"
          />
          <Area
            type="monotone"
            dataKey="refunds"
            name="Refunds"
            stroke="#e11d48"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fillOpacity={1}
            fill="url(#refundsGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// 2. Horizontal Distribution Bar List
// ============================================================================

export interface DistributionItem {
  readonly label: string;
  readonly count: number;
  readonly amount?: number | null;
  readonly percentage?: number;
  readonly color?: string;
}

interface DistributionListProps {
  readonly items: readonly DistributionItem[];
  readonly totalCount?: number;
  readonly currency?: string;
  readonly className?: string;
}

export function DistributionList({
  items,
  totalCount,
  currency = 'BDT',
  className,
}: DistributionListProps) {
  const sum = totalCount ?? items.reduce((acc, curr) => acc + curr.count, 0);

  if (!items.length || sum === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border/70 rounded-lg">
        No breakdown distribution available for this period.
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        const pct = item.percentage ?? (sum > 0 ? (item.count / sum) * 100 : 0);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground truncate">{item.label}</span>
              <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                {item.amount !== undefined && item.amount !== null ? (
                  <span className="text-muted-foreground">{formatAnalyticsMoney(item.amount, currency)}</span>
                ) : null}
                <span className="font-semibold text-foreground">{formatAnalyticsCount(item.count)}</span>
                <span className="text-muted-foreground/70 w-12 text-right">({pct.toFixed(1)}%)</span>
              </div>
            </div>
            {/* Visual Bar */}
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// 3. Storefront Conversion Funnel Component
// ============================================================================

export interface FunnelStage {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly dropOffRate?: string | null | undefined;
  readonly stageConversionRate?: string | null | undefined;
}

interface FunnelChartProps {
  readonly stages: readonly FunnelStage[];
  readonly isNotTracked?: boolean;
  readonly notTrackedReason?: string | null;
  readonly className?: string;
}

export function StorefrontFunnelChart({
  stages,
  isNotTracked = false,
  notTrackedReason,
  className,
}: FunnelChartProps) {
  if (isNotTracked) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center',
          className,
        )}
      >
        <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 mb-2">
          <AlertCircle className="size-5" />
        </div>
        <h4 className="text-sm font-semibold text-foreground">Behavioral Tracking Not Active</h4>
        <p className="mt-1 text-xs text-muted-foreground max-w-md">
          {notTrackedReason ??
            'Consented storefront behavioral events (Product views, cart activity, checkout starts) have not been collected for this organization. Transactional orders remain authoritative.'}
        </p>
      </div>
    );
  }

  const baseline = stages[0]?.count ?? 0;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {stages.map((stage, index) => {
          const overallPct = baseline > 0 ? (stage.count / baseline) * 100 : 0;
          return (
            <div
              key={stage.id}
              className="relative rounded-lg border border-border/80 bg-card p-3 shadow-2xs space-y-1.5"
            >
              <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                <span className="truncate">{stage.name}</span>
                <span className="text-[10px] text-primary font-mono">Stage {index + 1}</span>
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-foreground">
                {formatAnalyticsCount(stage.count)}
              </div>
              <div className="flex items-center justify-between text-[11px] border-t border-border/50 pt-1">
                <span className="text-muted-foreground">Of traffic:</span>
                <span className="font-mono font-medium text-foreground">{overallPct.toFixed(1)}%</span>
              </div>
              {stage.stageConversionRate ? (
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {formatAnalyticsPercent(stage.stageConversionRate)} step conv.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Visual Funnel Stack */}
      <div className="space-y-2 pt-2">
        {stages.map((stage) => {
          const widthPct = baseline > 0 ? Math.max(8, (stage.count / baseline) * 100) : 0;
          return (
            <div key={stage.id} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-foreground">{stage.name}</span>
                <span className="font-mono text-muted-foreground">
                  {formatAnalyticsCount(stage.count)} sessions
                </span>
              </div>
              <div className="h-6 w-full rounded bg-muted/50 overflow-hidden flex items-center px-2">
                <div
                  className="h-full rounded bg-primary/80 transition-opacity duration-150"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 4. Rating 5-Star Distribution Component
// ============================================================================

export interface ReviewRatingItem {
  readonly rating: number;
  readonly count: number;
}

interface ReviewDistributionProps {
  readonly ratings: readonly ReviewRatingItem[];
  readonly averageRating?: number | string | null | undefined;
  readonly totalReviews?: number | null | undefined;
  readonly className?: string | undefined;
}

export function ReviewDistribution({
  ratings,
  averageRating,
  totalReviews,
  className,
}: ReviewDistributionProps) {
  const total = totalReviews ?? ratings.reduce((sum, r) => sum + r.count, 0);

  const starRows = [5, 4, 3, 2, 1].map((stars) => {
    const found = ratings.find((r) => Number(r.rating) === stars);
    const count = found?.count ?? 0;
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { stars, count, pct };
  });

  return (
    <div className={cn('flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl border border-border/80 bg-card', className)}>
      {/* Big Average Score */}
      <div className="flex flex-col items-center justify-center sm:border-r sm:border-border/70 sm:pr-6 min-w-32">
        <span className="text-4xl font-extrabold text-foreground font-mono tabular-nums">
          {averageRating ? Number(averageRating).toFixed(1) : '—'}
        </span>
        <span className="text-xs text-amber-500 mt-1">★★★★★</span>
        <span className="text-[11px] text-muted-foreground mt-0.5">
          Based on {formatAnalyticsCount(total)} reviews
        </span>
      </div>

      {/* 5-bar breakout */}
      <div className="flex-1 w-full space-y-1.5">
        {starRows.map(({ stars, count, pct }) => (
          <div key={stars} className="flex items-center gap-2 text-xs">
            <span className="w-12 text-muted-foreground font-medium">{stars} stars</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-14 text-right font-mono tabular-nums text-muted-foreground text-[11px]">
              {formatAnalyticsCount(count)} ({pct.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 5. Chart Skeleton
// ============================================================================

export function ChartSkeleton({ height = 280, className }: { height?: number; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col justify-end gap-2 rounded-xl border border-border/70 bg-card p-4 animate-pulse',
        className,
      )}
      style={{ height }}
    >
      <div className="flex items-end gap-3 h-full pb-6 px-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="flex-1 bg-muted/60 rounded-t"
            style={{ height: `${Math.max(15, (i * 17) % 85)}%` }}
          />
        ))}
      </div>
      <div className="h-3 w-full bg-muted/40 rounded" />
    </div>
  );
}
