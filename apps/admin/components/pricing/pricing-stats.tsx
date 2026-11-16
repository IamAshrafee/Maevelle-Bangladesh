'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { CalendarClock, Layers, Percent, Tag } from 'lucide-react';

import {
  Stats,
  StatsCard,
  StatsDescription,
  StatsTitle,
  StatsValue,
} from '@/components/ui/stats';
import { StatsValueSkeleton } from '@/components/ui/table-skeleton';
import { formatMoney } from '@/lib/format/numbers';
import { cn } from '@/lib/utils';
import { getScheduleCategory, type VariantPriceItem } from './types';

interface PricingStatsProps {
  readonly items: readonly VariantPriceItem[];
  readonly loading?: boolean;
}

export function PricingStats({ items, loading = false }: PricingStatsProps) {
  const metrics = React.useMemo(() => {
    let liveActiveCount = 0;
    let upcomingCount = 0;
    let discountedCount = 0;
    let draftOrArchivedCount = 0;
    let totalLiveBdtAmount = 0;
    let liveBdtCount = 0;

    const now = new Date();

    for (const item of items) {
      const category = getScheduleCategory(item, now);

      if (category === 'LIVE_ACTIVE') {
        liveActiveCount++;
        if (item.currency === 'BDT') {
          const val = Number(item.amount);
          if (Number.isFinite(val) && val > 0) {
            totalLiveBdtAmount += val;
            liveBdtCount++;
          }
        }
        if (item.compareAtAmount && Number(item.compareAtAmount) > Number(item.amount)) {
          discountedCount++;
        }
      } else if (category === 'UPCOMING') {
        upcomingCount++;
      } else {
        draftOrArchivedCount++;
      }
    }

    const averageLiveBdt =
      liveBdtCount > 0 ? Math.round(totalLiveBdtAmount / liveBdtCount) : null;

    return {
      liveActiveCount,
      upcomingCount,
      discountedCount,
      draftOrArchivedCount,
      averageLiveBdt,
      totalCount: items.length,
    };
  }, [items]);

  const isInitialLoading = loading && items.length === 0;
  const isRefreshing = loading && items.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Stats className="grid-cols-2 lg:grid-cols-5">
        {/* Live Active Prices */}
        <StatsCard>
          <div className="flex items-center justify-between">
            <StatsTitle>Live Active</StatsTitle>
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          </div>
          <StatsValue className={cn(isRefreshing && 'opacity-60 transition-opacity')}>
            {isInitialLoading ? <StatsValueSkeleton /> : metrics.liveActiveCount}
          </StatsValue>
          <StatsDescription>Authoritative retail prices</StatsDescription>
        </StatsCard>

        {/* Scheduled Campaigns */}
        <StatsCard>
          <div className="flex items-center justify-between">
            <StatsTitle>Scheduled Campaigns</StatsTitle>
            <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <StatsValue className={cn(isRefreshing && 'opacity-60 transition-opacity')}>
            {isInitialLoading ? <StatsValueSkeleton /> : metrics.upcomingCount}
          </StatsValue>
          <StatsDescription>Upcoming promotional schedules</StatsDescription>
        </StatsCard>

        {/* Average Live Selling Price */}
        <StatsCard>
          <div className="flex items-center justify-between">
            <StatsTitle>Avg Live Price (BDT)</StatsTitle>
            <Tag className="size-3.5 text-primary" aria-hidden="true" />
          </div>
          <StatsValue className={cn(isRefreshing && 'opacity-60 transition-opacity')}>
            {isInitialLoading ? (
              <StatsValueSkeleton />
            ) : metrics.averageLiveBdt !== null ? (
              formatMoney(metrics.averageLiveBdt, 'BDT')
            ) : (
              '—'
            )}
          </StatsValue>
          <StatsDescription>Across live catalog SKUs</StatsDescription>
        </StatsCard>

        {/* Discounted Items */}
        <StatsCard>
          <div className="flex items-center justify-between">
            <StatsTitle>On-Sale Items</StatsTitle>
            <Percent className="size-3.5 text-amber-500" aria-hidden="true" />
          </div>
          <StatsValue className={cn(isRefreshing && 'opacity-60 transition-opacity')}>
            {isInitialLoading ? <StatsValueSkeleton /> : metrics.discountedCount}
          </StatsValue>
          <StatsDescription>Active compare-at markdowns</StatsDescription>
        </StatsCard>

        {/* Drafts & Audit Archive */}
        <StatsCard className="col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <StatsTitle>Drafts & Archive</StatsTitle>
            <Layers className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <StatsValue className={cn(isRefreshing && 'opacity-60 transition-opacity')}>
            {isInitialLoading ? <StatsValueSkeleton /> : metrics.draftOrArchivedCount}
          </StatsValue>
          <StatsDescription>Preserved commercial audit history</StatsDescription>
        </StatsCard>
      </Stats>
    </motion.div>
  );
}

