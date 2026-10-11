'use client';

import { useMemo } from 'react';
import { Calculator, HelpCircle, ReceiptText, TrendingDown, TrendingUp } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  merchandisingCost,
  suggestedSellingPrice,
  type VariantAcquisitionCost,
} from './utils/pricing';

interface ProfitMarginCalculatorProps {
  readonly sellingPrice: string;
  readonly estimatedCostPrice: string;
  readonly acquisitionCost?: VariantAcquisitionCost | null;
  readonly onEstimatedCostPriceChange: (value: string) => void;
  readonly onSellingPriceChange: (value: string) => void;
  readonly compact?: boolean;
}

export function ProfitMarginCalculator({
  sellingPrice,
  estimatedCostPrice,
  acquisitionCost,
  onEstimatedCostPriceChange,
  onSellingPriceChange,
  compact = false,
}: ProfitMarginCalculatorProps) {
  const effectiveCost = useMemo(
    () => merchandisingCost(estimatedCostPrice, acquisitionCost),
    [acquisitionCost, estimatedCostPrice],
  );
  const calculations = useMemo(() => {
    const price = parseFloat(sellingPrice);
    const cost = parseFloat(effectiveCost.amount);

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
  }, [effectiveCost.amount, sellingPrice]);
  const suggestions = useMemo(
    () =>
      [30, 40, 50]
        .map((margin) => ({
          margin,
          price: suggestedSellingPrice(effectiveCost.amount, margin),
        }))
        .filter((suggestion): suggestion is { margin: number; price: string } =>
          Boolean(suggestion.price),
        ),
    [effectiveCost.amount],
  );
  const acquisitionIsBdt = acquisitionCost?.currency === 'BDT';
  const acquisitionLabel =
    acquisitionCost?.state === 'PROVISIONAL'
      ? 'Provisional landed unit cost'
      : 'Final landed unit cost';

  return (
    <div className="space-y-3">
      {acquisitionCost ? (
        <div className="rounded-lg border border-primary/25 bg-primary-subtle p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ReceiptText className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{acquisitionLabel}</p>
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
                  {new Intl.NumberFormat('en-BD', {
                    style: 'currency',
                    currency: acquisitionCost.currency,
                    maximumFractionDigits: 2,
                  }).format(Number(acquisitionCost.amount))}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Receipt <span className="font-mono">{acquisitionCost.receiptNumber}</span>
                  {' · '}
                  {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                    new Date(acquisitionCost.receivedAt),
                  )}
                </p>
              </div>
            </div>
            <StatusBadge
              status={acquisitionCost.state}
              tone={acquisitionCost.state === 'PROVISIONAL' ? 'warning' : 'success'}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Loaded automatically from Supply receiving and landed-cost allocation. This value is
            read-only here so Catalog cannot rewrite accounting cost history.
          </p>
          {!acquisitionIsBdt ? (
            <p className="mt-2 text-[11px] font-medium text-warning">
              Margin suggestions require a BDT cost. The planning estimate below is used until this
              acquisition cost is converted to BDT.
            </p>
          ) : null}
        </div>
      ) : null}

      {!acquisitionIsBdt ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="cost-price-input" className="font-medium text-xs sm:text-sm">
              {acquisitionCost ? 'Planning estimate (BDT)' : 'Estimated unit cost (BDT)'}
            </Label>
            <Tooltip>
              <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                A merchandising estimate used before a receipt-backed landed cost is available. It
                never replaces Supply costing or accounting FIFO valuation.
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
              value={estimatedCostPrice}
              onChange={(e) => onEstimatedCostPriceChange(e.target.value)}
              className="pl-7 font-mono text-xs tabular-nums sm:text-sm"
            />
          </div>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-start gap-2">
            <Calculator className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-foreground">
                Set selling price by target margin
              </p>
              <p className="text-[11px] text-muted-foreground">
                Suggestions use the{' '}
                {effectiveCost.source === 'LANDED_COST' ? 'landed cost' : 'planning estimate'} and
                round upward to the next ৳10.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion.margin}
                type="button"
                variant="outline"
                className="h-10 justify-between px-3 text-xs"
                onClick={() => onSellingPriceChange(suggestion.price)}
              >
                <span>{suggestion.margin}% margin</span>
                <span className="font-mono font-semibold tabular-nums">৳{suggestion.price}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

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
                  ৳
                  {calculations.profit.toLocaleString('en-BD', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}
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
          Add a selling price and{' '}
          {effectiveCost.source === 'NONE' ? 'unit cost' : 'valid selling price'} to see live profit
          and margin.
        </p>
      )}
    </div>
  );
}
