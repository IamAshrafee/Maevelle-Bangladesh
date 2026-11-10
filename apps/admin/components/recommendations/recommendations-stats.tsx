'use client';

import * as React from 'react';
import { Eye, MousePointerClick, Percent, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PerformanceResponse } from './recommendations-types';

interface RecommendationsStatsProps {
  performance: PerformanceResponse | null;
  loading: boolean;
  dateRange: { from: string; to: string };
  onDateRangeChange: (from: string, to: string) => void;
  onRefresh: () => void;
}

export function RecommendationsStats({
  performance,
  loading,
  dateRange,
  onDateRangeChange,
  onRefresh,
}: RecommendationsStatsProps) {
  const totals = React.useMemo(() => {
    if (!performance?.placements.length) {
      return { impressions: 0, clicks: 0, continuations: 0, sessions: 0, ctr: null };
    }
    const impressions = performance.placements.reduce((acc, p) => acc + p.impressions, 0);
    const clicks = performance.placements.reduce((acc, p) => acc + p.clicks, 0);
    const continuations = performance.placements.reduce(
      (acc, p) => acc + p.productPageContinuations,
      0,
    );
    const sessions = performance.placements.reduce((acc, p) => acc + p.uniqueSessions, 0);
    const clickedImpressions = performance.placements.reduce(
      (acc, p) => acc + p.clickedImpressions,
      0,
    );
    const ctr = impressions > 0 ? clickedImpressions / impressions : null;
    return { impressions, clicks, continuations, sessions, ctr };
  }, [performance]);

  function setPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    onDateRangeChange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-3">
      {/* Date preset selector bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">Timeframe:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setPreset(7)}
          >
            Last 7 days
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setPreset(30)}
          >
            Last 30 days
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setPreset(90)}
          >
            Last 90 days
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {dateRange.from} → {dateRange.to}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={loading}
                    onClick={onRefresh}
                    aria-label="Refresh performance metrics"
                  />
                }
              >
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              </TooltipTrigger>
              <TooltipContent>Refresh metrics</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Metric 1: Impressions */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Storefront Views</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Eye className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
              {totals.impressions.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Total carousel impressions served</p>
        </div>

        {/* Metric 2: Clicks */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Discovery Clicks</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <MousePointerClick className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
              {totals.clicks.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Product card selections</p>
        </div>

        {/* Metric 3: Click-Through Rate */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Click Rate (CTR)</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Percent className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
              {totals.ctr === null ? '—' : `${(totals.ctr * 100).toFixed(1)}%`}
            </span>
            {totals.ctr !== null && totals.ctr > 0.05 && (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Healthy
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Lists clicked / viewed lists</p>
        </div>

        {/* Metric 4: Continuations */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-border/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Browsing Depth</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TrendingUp className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-foreground">
              {totals.continuations.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">PDP visits within 30 min of click</p>
        </div>
      </div>
    </div>
  );
}
