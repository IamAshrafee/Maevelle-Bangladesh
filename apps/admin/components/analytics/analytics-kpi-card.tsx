'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  HelpCircle,
  Minus,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type ComparisonDelta } from '@/lib/analytics/types';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  readonly title: string;
  readonly value: string | React.ReactNode;
  readonly comparison?: ComparisonDelta | null;
  readonly description?: string;
  readonly definitionTooltip?: string;
  readonly status?: 'AVAILABLE' | 'PARTIAL' | 'RESTRICTED' | 'NOT_TRACKED' | null;
  readonly statusLabel?: string;
  readonly drillDownHref?: string;
  readonly drillDownLabel?: string;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly subtitle?: string;
  readonly loading?: boolean;
  readonly className?: string;
}

export function MetricCard({
  title,
  value,
  comparison,
  description,
  definitionTooltip,
  status,
  statusLabel,
  drillDownHref,
  drillDownLabel = 'View details',
  icon: Icon,
  subtitle,
  loading = false,
  className,
}: MetricCardProps) {
  if (loading) {
    return (
      <article
        className={cn(
          'flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs animate-pulse',
          className,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-muted rounded" />
          <div className="size-4 bg-muted rounded-full" />
        </div>
        <div className="my-3 h-8 w-36 bg-muted/80 rounded" />
        <div className="h-3 w-20 bg-muted/60 rounded" />
      </article>
    );
  }

  return (
    <article
      className={cn(
        'group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs transition-colors duration-150 hover:border-border',
        className,
      )}
    >
      {/* Header: Title + Definition/Icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {title}
          </h3>
          {definitionTooltip ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                    aria-label={`Definition for ${title}`}
                  />
                }
              >
                <HelpCircle className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                <p className="font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-muted-foreground">{definitionTooltip}</p>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {status && status !== 'AVAILABLE' ? (
            <StatusBadge
              status={status}
              tone={
                status === 'PARTIAL'
                  ? 'warning'
                  : status === 'RESTRICTED'
                    ? 'neutral'
                    : 'danger'
              }
              className="text-[10px] px-1.5 py-0"
            />
          ) : null}
          {Icon ? <Icon className="size-4 text-muted-foreground/70" /> : null}
        </div>
      </div>

      {/* Main Metric Value */}
      <div className="my-2.5">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums truncate">
          {value}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground/90 truncate">{subtitle}</p>
        ) : null}
      </div>

      {/* Footer: Comparison Indicator & Drill-down Link */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
        {comparison ? (
          <div className="flex items-center gap-1 truncate font-medium">
            {comparison.tone === 'positive' ? (
              <ArrowUpRight className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : comparison.tone === 'negative' ? (
              <ArrowDownRight className="size-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <Minus className="size-3 text-muted-foreground shrink-0" />
            )}
            <span
              className={cn(
                'tabular-nums truncate',
                comparison.tone === 'positive' &&
                  'text-emerald-700 dark:text-emerald-400 font-semibold',
                comparison.tone === 'negative' &&
                  'text-rose-700 dark:text-rose-400 font-semibold',
                comparison.tone === 'neutral' && 'text-muted-foreground',
              )}
            >
              {comparison.text}
            </span>
          </div>
        ) : description ? (
          <span className="text-xs text-muted-foreground truncate">{description}</span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}

        {drillDownHref ? (
          <Link
            href={drillDownHref}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:text-primary-hover hover:underline transition-colors shrink-0 ml-auto"
          >
            <span>{drillDownLabel}</span>
            <ChevronRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
