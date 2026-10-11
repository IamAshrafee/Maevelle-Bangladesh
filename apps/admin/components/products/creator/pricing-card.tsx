'use client';

import { AlertCircle, DollarSign, HelpCircle, Layers, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ProfitMarginCalculator } from './profit-margin-calculator';
import type { VariantAcquisitionCost } from './utils/pricing';

interface PricingCardProps {
  readonly variantMode: 'simple' | 'variants';
  readonly priceAmount: string;
  readonly compareAtAmount: string;
  readonly costAmount: string;
  readonly acquisitionCost?: VariantAcquisitionCost | null;
  readonly fieldErrors: Record<string, string>;
  readonly onPriceChange: (val: string) => void;
  readonly onCompareAtChange: (val: string) => void;
  readonly onCostChange: (val: string) => void;
}

export function PricingCard({
  variantMode,
  priceAmount,
  compareAtAmount,
  costAmount,
  acquisitionCost,
  fieldErrors,
  onPriceChange,
  onCompareAtChange,
  onCostChange,
}: PricingCardProps) {
  const hasMultipleVariants = variantMode === 'variants';
  const numPrice = Number.parseFloat(priceAmount);
  const numCompareAt = Number.parseFloat(compareAtAmount);
  const hasValidNumbers =
    !Number.isNaN(numPrice) && !Number.isNaN(numCompareAt) && numPrice > 0 && numCompareAt > 0;
  const discountPercent =
    hasValidNumbers && numCompareAt > numPrice
      ? Math.round(((numCompareAt - numPrice) / numCompareAt) * 100)
      : null;
  const hasInvalidDiscount = hasValidNumbers && numCompareAt <= numPrice;

  return (
    <Card className="border-border shadow-2xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Pricing & Margins</CardTitle>
          </div>
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
              <HelpCircle className="size-4 text-muted-foreground" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Set retail selling prices, sale strikethrough prices, and internal acquisition costs.
            </TooltipContent>
          </Tooltip>
        </div>
        <CardDescription>
          {hasMultipleVariants
            ? 'Set optional defaults here, then price each sellable variant from its own landed cost.'
            : 'Selling price in Bangladeshi Taka (BDT), backed by the best available unit cost.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Selling Price */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="selling-price" className="font-medium text-xs sm:text-sm">
                {hasMultipleVariants ? 'Default Selling Price (BDT)' : 'Selling Price (BDT)'}{' '}
                {!hasMultipleVariants ? <span className="text-destructive">*</span> : null}
              </Label>
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>
                  The final checkout price charged to customers in Bangladesh.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold text-muted-foreground">
                ৳
              </span>
              <Input
                id="selling-price"
                type="number"
                step="1"
                min="0"
                placeholder="2450"
                value={priceAmount}
                onChange={(e) => onPriceChange(e.target.value)}
                className="pl-7 font-mono text-xs font-semibold tabular-nums sm:text-sm"
              />
            </div>
            {fieldErrors.price && <p className="text-xs text-destructive">{fieldErrors.price}</p>}
          </div>

          {/* Compare At Price */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="compare-at-price" className="font-medium text-xs sm:text-sm">
                  Compare-at Price (BDT)
                </Label>
                <Tooltip>
                  <TooltipTrigger
                    render={<span tabIndex={0} className="inline-flex cursor-help" />}
                  >
                    <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Original retail price before discount. Displayed as a strikethrough price on the
                    storefront.
                  </TooltipContent>
                </Tooltip>
              </div>
              {discountPercent !== null && (
                <Badge
                  variant="outline"
                  className="gap-1 border-success/30 bg-success/10 font-mono text-[10px] text-success tabular-nums"
                >
                  <Tag className="size-2.5" />
                  {discountPercent}% OFF
                </Badge>
              )}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold text-muted-foreground">
                ৳
              </span>
              <Input
                id="compare-at-price"
                type="number"
                step="1"
                min="0"
                placeholder="2950"
                value={compareAtAmount}
                onChange={(e) => onCompareAtChange(e.target.value)}
                className="pl-7 font-mono text-xs tabular-nums sm:text-sm"
              />
            </div>
            {hasInvalidDiscount && (
              <p className="flex items-center gap-1 text-[11px] text-warning">
                <AlertCircle className="size-3 shrink-0" />
                Compare-at price must exceed selling price to show a discount.
              </p>
            )}
          </div>
        </div>

        <Separator />

        {hasMultipleVariants ? (
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary-subtle p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Layers className="size-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Pricing is variant-specific</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The variant matrix below automatically loads each receipt-backed landed cost. Use
                its target-margin actions to set selling prices without forcing every variant to
                share one cost.
              </p>
            </div>
          </div>
        ) : (
          <ProfitMarginCalculator
            sellingPrice={priceAmount}
            estimatedCostPrice={costAmount}
            acquisitionCost={acquisitionCost ?? null}
            onEstimatedCostPriceChange={onCostChange}
            onSellingPriceChange={onPriceChange}
          />
        )}
      </CardContent>
    </Card>
  );
}
