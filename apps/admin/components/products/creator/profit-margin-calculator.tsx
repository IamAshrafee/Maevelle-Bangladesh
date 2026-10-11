'use client';

import { useMemo } from 'react';
import { HelpCircle, TrendingUp, TrendingDown } from 'lucide-react';
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
          className={`rounded-lg border p-3 transition-colors duration-150 ${
            calculations.isLoss
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : calculations.isHealthy
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-warning/30 bg-warning/10 text-warning'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {calculations.isLoss ? (
                <TrendingDown className="size-4 text-destructive" />
              ) : (
                <TrendingUp className="size-4 text-success" />
              )}
              <span className="text-xs font-semibold text-foreground">
                Est. Profit:{' '}
                <span
                  className={`font-mono tabular-nums font-bold ${
                    calculations.isLoss ? 'text-destructive' : 'text-success'
                  }`}
                >
                  ৳{calculations.profit.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[11px] font-mono tabular-nums font-semibold ${
                  calculations.isLoss
                    ? 'border-destructive/40 bg-destructive/15 text-destructive'
                    : calculations.isHealthy
                      ? 'border-success/40 bg-success/15 text-success'
                      : 'border-warning/40 bg-warning/15 text-warning'
                }`}
              >
                {calculations.margin}% Margin
              </Badge>

              {!compact && (
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
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
