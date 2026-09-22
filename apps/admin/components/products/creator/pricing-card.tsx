'use client';

import { DollarSign, HelpCircle } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { ProfitMarginCalculator } from './profit-margin-calculator';

interface PricingCardProps {
  readonly priceAmount: string;
  readonly compareAtAmount: string;
  readonly costAmount: string;
  readonly fieldErrors: Record<string, string>;
  readonly onPriceChange: (val: string) => void;
  readonly onCompareAtChange: (val: string) => void;
  readonly onCostChange: (val: string) => void;
}

export function PricingCard({
  priceAmount,
  compareAtAmount,
  costAmount,
  fieldErrors,
  onPriceChange,
  onCompareAtChange,
  onCostChange,
}: PricingCardProps) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">
              Pricing & Margins
            </CardTitle>
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
          Base pricing in Bangladeshi Taka (BDT) and automated gross margin calculation.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Selling Price */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="selling-price" className="font-medium text-xs sm:text-sm">
                Selling Price (BDT) <span className="text-destructive">*</span>
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
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
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
                className="pl-7 text-xs sm:text-sm font-semibold"
              />
            </div>
            {fieldErrors.price && (
              <p className="text-xs text-destructive">{fieldErrors.price}</p>
            )}
          </div>

          {/* Compare At Price */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="compare-at-price" className="font-medium text-xs sm:text-sm">
                Compare-at Price (BDT)
              </Label>
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>
                  Original retail price before discount. Displayed as a strikethrough price on the storefront.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
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
                className="pl-7 text-xs sm:text-sm"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Cost & Gross Margin Calculator */}
        <ProfitMarginCalculator
          sellingPrice={priceAmount}
          costPrice={costAmount}
          onCostPriceChange={onCostChange}
        />
      </CardContent>
    </Card>
  );
}
