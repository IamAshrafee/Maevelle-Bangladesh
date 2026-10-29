'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { BadgePercent, CalendarCheck, Coins, Sparkles, Ticket } from 'lucide-react';

import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PromotionItem } from './types';

interface PromotionsStatsProps {
  readonly promotions: readonly PromotionItem[];
}

export function PromotionsStats({ promotions }: PromotionsStatsProps) {
  const activeCount = React.useMemo(
    () => promotions.filter((p) => p.status === 'ACTIVE').length,
    [promotions],
  );

  const totalCommittedUses = React.useMemo(
    () => promotions.reduce((sum, p) => sum + p.committedUsageCount, 0),
    [promotions],
  );

  const totalDiscountAmount = React.useMemo(() => {
    return promotions.reduce((sum, p) => {
      const val = parseFloat(p.committedDiscount) || 0;
      return sum + val;
    }, 0);
  }, [promotions]);

  const totalCoupons = React.useMemo(
    () => promotions.reduce((sum, p) => sum + p.coupons.length, 0),
    [promotions],
  );

  const formattedDiscount = React.useMemo(() => {
    return new Intl.NumberFormat('en-BD', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(totalDiscountAmount);
  }, [totalDiscountAmount]);

  return (
    <TooltipProvider delay={200}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        <Stats className="grid-cols-2 lg:grid-cols-4">
          <StatsCard>
            <div className="flex items-center justify-between">
              <StatsTitle>Campaigns</StatsTitle>
              <BadgePercent className="size-4 text-muted-foreground/70" aria-hidden="true" />
            </div>
            <StatsValue>{promotions.length}</StatsValue>
            <StatsDescription className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              <span>{activeCount} active · {promotions.length - activeCount} other</span>
            </StatsDescription>
          </StatsCard>

          <StatsCard>
            <div className="flex items-center justify-between">
              <StatsTitle>Committed Redemptions</StatsTitle>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" className="text-muted-foreground/70 hover:text-foreground cursor-help" />
                  }
                >
                  <CalendarCheck className="size-4" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>
                  Redemptions committed in placed orders only (cart evaluations do not consume usage).
                </TooltipContent>
              </Tooltip>
            </div>
            <StatsValue>{totalCommittedUses}</StatsValue>
            <StatsDescription>Authoritative customer orders</StatsDescription>
          </StatsCard>

          <StatsCard>
            <div className="flex items-center justify-between">
              <StatsTitle>Discount Delivered</StatsTitle>
              <Coins className="size-4 text-amber-500/80" aria-hidden="true" />
            </div>
            <StatsValue className="text-primary">
              ৳ {formattedDiscount}
            </StatsValue>
            <StatsDescription>Realized commercial savings (BDT)</StatsDescription>
          </StatsCard>

          <StatsCard>
            <div className="flex items-center justify-between">
              <StatsTitle>Coupon Codes</StatsTitle>
              <Ticket className="size-4 text-muted-foreground/70" aria-hidden="true" />
            </div>
            <StatsValue>{totalCoupons}</StatsValue>
            <StatsDescription>Active & scheduled promo codes</StatsDescription>
          </StatsCard>
        </Stats>
      </motion.div>
    </TooltipProvider>
  );
}
