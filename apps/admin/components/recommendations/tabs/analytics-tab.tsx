'use client';

import * as React from 'react';
import { BarChart3, Info, Percent, Eye, MousePointerClick, TrendingUp, Users } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PerformanceResponse } from '../recommendations-types';
import { PLACEMENT_LABELS } from '../recommendations-types';

interface AnalyticsTabProps {
  performance: PerformanceResponse | null;
  loading: boolean;
  dateRange: { from: string; to: string };
  onDateRangeChange: (from: string, to: string) => void;
  canViewAnalytics: boolean;
}

export function AnalyticsTab({
  performance,
  loading,
  dateRange,
  onDateRangeChange,
  canViewAnalytics,
}: AnalyticsTabProps) {
  const [from, setFrom] = React.useState(dateRange.from);
  const [to, setTo] = React.useState(dateRange.to);

  React.useEffect(() => {
    setFrom(dateRange.from);
    setTo(dateRange.to);
  }, [dateRange]);

  function handleApplyDates(e: React.FormEvent) {
    e.preventDefault();
    onDateRangeChange(from, to);
  }

  function handlePreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    setFrom(startStr);
    setTo(endStr);
    onDateRangeChange(startStr, endStr);
  }

  if (!canViewAnalytics) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
        You do not have the <code className="font-mono">analytics.view</code> capability required to
        inspect recommendation engagement analytics.
      </div>
    );
  }

  const placements = performance?.placements ?? [];

  return (
    <div className="space-y-6">
      {/* Date Range Filter Bar */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
        <form
          onSubmit={handleApplyDates}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">From Date</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 text-xs font-mono"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">To Date</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 text-xs font-mono"
                required
              />
            </div>
            <Button type="submit" size="sm" className="h-9 text-xs shadow-sm">
              Apply Period
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
            <span className="text-xs text-muted-foreground mr-1">Presets:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handlePreset(7)}
            >
              7D
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handlePreset(30)}
            >
              30D
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handlePreset(90)}
            >
              90D
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handlePreset(365)}
            >
              1Y
            </Button>
          </div>
        </form>
      </div>

      {/* Engagement Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            Placement Engagement Comparison
          </h3>
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {dateRange.from} to {dateRange.to}
          </span>
        </div>

        <div className="relative">
          <Table density="comfortable">
            <TableHeader>
              <TableRow>
                <TableHead>Discovery Placement</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Click Rate (CTR)</TableHead>
                <TableHead className="text-right">30-min Continuations</TableHead>
                <TableHead className="text-right">Unique Sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placements.map((p) => {
                const label =
                  PLACEMENT_LABELS[p.placement as keyof typeof PLACEMENT_LABELS] ?? p.placement;
                const ctrPct = p.ctr !== null ? `${(p.ctr * 100).toFixed(1)}%` : '—';

                return (
                  <TableRow key={p.placement}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{label}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {p.placement}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {p.impressions.toLocaleString()}
                    </TableCell>

                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {p.clicks.toLocaleString()}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 font-mono tabular-nums font-semibold text-foreground">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, (p.ctr ?? 0) * 500)}%` }}
                          />
                        </div>
                        <span>{ctrPct}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {p.productPageContinuations.toLocaleString()}
                    </TableCell>

                    <TableCell className="text-right font-mono tabular-nums text-foreground">
                      {p.uniqueSessions.toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Attribution & Privacy Methodology Callout */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-xs text-muted-foreground leading-relaxed">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Info className="size-4 text-primary" />
          Analytics & Attribution Methodology
        </div>
        <p>
          • <strong>Consent Coverage:</strong> Reflects real browser telemetry exclusively from
          visitors who affirmatively granted analytics cookies. Denied or unconsented customer
          sessions are omitted.
        </p>
        <p>
          • <strong>Click-Through Rate (CTR):</strong> Measured as distinct viewed recommendation
          lists that resulted in a product click divided by total viewed lists.
        </p>
        <p>
          • <strong>Browsing Depth:</strong> Product page visits are tracked when a customer navigates
          to any product page within a 30-minute attribution window following a carousel selection.
        </p>
      </div>
    </div>
  );
}

