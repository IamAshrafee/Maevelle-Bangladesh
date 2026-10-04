'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Image, MessageSquare, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReviewQueueCounts {
  pending: number;
  visible: number;
  rejected: number;
  hidden: number;
  needs_response?: number | undefined;
  needsResponse?: number | undefined;
  with_media?: number | undefined;
  withMedia?: number | undefined;
  total: number;
}

interface ReviewsStatsStripProps {
  counts?: ReviewQueueCounts | undefined;
  activeQueue: string;
  onSelectQueue: (queue: string) => void;
}

export function ReviewsStatsStrip({
  counts,
  activeQueue,
  onSelectQueue,
}: ReviewsStatsStripProps) {
  const needsResponseCount = counts?.needsResponse ?? counts?.needs_response ?? 0;
  const withMediaCount = counts?.withMedia ?? counts?.with_media ?? 0;

  const safeCounts = {
    pending: counts?.pending ?? 0,
    visible: counts?.visible ?? 0,
    rejected: counts?.rejected ?? 0,
    hidden: counts?.hidden ?? 0,
    needs_response: needsResponseCount,
    with_media: withMediaCount,
    total: counts?.total ?? 0,
  };

  const cards = [
    {
      key: 'PENDING',
      label: 'Awaiting Decision',
      count: safeCounts.pending,
      icon: AlertCircle,
      accent: 'text-amber-600 dark:text-amber-400',
      activeBorder: 'border-amber-500 ring-1 ring-amber-500/20 bg-amber-500/5',
      badge: safeCounts.pending > 0 ? 'Action required' : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    },
    {
      key: 'VISIBLE',
      label: 'Storefront Visible',
      count: safeCounts.visible,
      icon: Eye,
      accent: 'text-emerald-600 dark:text-emerald-400',
      activeBorder: 'border-emerald-500 ring-1 ring-emerald-500/20 bg-emerald-500/5',
    },
    {
      key: 'NEEDS_RESPONSE',
      label: 'Needs Response',
      count: safeCounts.needs_response,
      icon: MessageSquare,
      accent: 'text-primary dark:text-primary',
      activeBorder: 'border-primary ring-1 ring-primary/20 bg-primary/5',
      badge: safeCounts.needs_response > 0 ? `${safeCounts.needs_response} open` : undefined,
      badgeColor: 'bg-primary-subtle text-primary',
    },
    {
      key: 'MEDIA',
      label: 'With Photos & Video',
      count: safeCounts.with_media,
      icon: Image,
      accent: 'text-sky-600 dark:text-sky-400',
      activeBorder: 'border-sky-500 ring-1 ring-sky-500/20 bg-sky-500/5',
    },
    {
      key: 'REJECTED',
      label: 'Rejected',
      count: safeCounts.rejected,
      icon: ShieldAlert,
      accent: 'text-rose-600 dark:text-rose-400',
      activeBorder: 'border-rose-500 ring-1 ring-rose-500/20 bg-rose-500/5',
    },
    {
      key: 'HIDDEN',
      label: 'Hidden Content',
      count: safeCounts.hidden,
      icon: EyeOff,
      accent: 'text-slate-500 dark:text-slate-400',
      activeBorder: 'border-slate-500 ring-1 ring-slate-500/20 bg-slate-500/5',
    },
  ];

  return (
    <div
      role="region"
      aria-label="Review moderation operational queues"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeQueue === card.key;

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onSelectQueue(card.key)}
            className={cn(
              'group relative flex flex-col justify-between text-left rounded-lg border border-border bg-card p-3.5 shadow-2xs transition-colors hover:border-border/80 hover:bg-muted/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer',
              isActive && card.activeBorder,
            )}
          >
            <div className="flex items-center justify-between gap-1 w-full">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {card.label}
              </span>
              <Icon className={cn('size-3.5 shrink-0', card.accent)} aria-hidden="true" />
            </div>

            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
                {card.count.toLocaleString()}
              </span>
              {card.badge ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-tight',
                    card.badgeColor,
                  )}
                >
                  {card.badge}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
