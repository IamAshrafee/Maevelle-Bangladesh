'use client';

import { useMemo } from 'react';
import { HelpCircle, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ProfitMarginCalculatorProps {
  readonly sellingPrice: string;
  readonly costPrice: string;
  readonly onCostPriceChange: (value: string) => void;
  readonly compact?: boolean;
}

export function ProfitMarginCalculator({
  sellingPrice,
  costPrice,
  onCostPriceChange,
  compact = false,
}: ProfitMarginCalculatorProps) {
  const calculations = useMemo(() => {
    const price = parseFloat(sellingPrice);
    const cost = parseFloat(costPrice);

    if (isNaN(price) || price <= 0 || isNaN(cost) || cost <= 0) {
      return null;
    }

    const profit = price - cost;
    const margin = (profit / price) * 100;
    const markup = (profit / cost) * 100;

    return {
      profit,
      margin: Math.round(margin * 10) / 10,
      markup: Math.round(markup * 10) / 10,
      isLoss: profit < 0,
      isHealthy: margin >= 35,
      isLow: margin >= 0 && margin < 20,
    };
  }, [sellingPrice, costPrice]);

  return (
    <div className="space-y-3">
      {/* Cost per item input */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="cost-price-input" className="font-medium text-xs sm:text-sm">
            Cost per item (BDT)
          </Label>
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
              <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Your acquisition, fabric, or tailoring manufacturing cost. Customers will never see this.
              Used to calculate gross profit, margin, and business analytics.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
            ৳
          </span>
          <Input
            id="cost-price-input"
            type="number"
            step="1"
            min="0"
            placeholder="1200"
            className="pl-7 text-xs sm:text-sm"
            value={costPrice}
            onChange={(e) => onCostPriceChange(e.target.value)}
          />
        </div>
      </div>

      {/* Live Financial Metrics Banner */}
      {calculations ? (
        <div
          className={`rounded-lg border p-3 transition-colors ${
            calculations.isLoss
              ? 'border-red-200 bg-red-50/50 dark:border-red-950 dark:bg-red-950/20'
              : calculations.isHealthy
                ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-950 dark:bg-emerald-950/20'
                : 'border-amber-200 bg-amber-50/40 dark:border-amber-950 dark:bg-amber-950/20'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {calculations.isLoss ? (
                <TrendingDown className="size-4 text-red-600 dark:text-red-400" />
              ) : (
                <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="text-xs font-semibold text-foreground">
                Est. Profit:{' '}
                <span className={calculations.isLoss ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>
                  ৳{calculations.profit.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={`text-[11px] font-semibold ${
                  calculations.isLoss
                    ? 'border-red-300 text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300'
                    : calculations.isHealthy
                      ? 'border-emerald-300 text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'border-amber-300 text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
              >
                {calculations.margin}% Margin
              </Badge>

              {!compact && (
                <span className="text-[11px] text-muted-foreground">
                  ({calculations.markup}% markup)
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">
          Enter selling price and cost to see live profit margins and markup calculations.
        </p>
      )}
    </div>
  );
}
