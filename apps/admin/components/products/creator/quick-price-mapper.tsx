'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CircleDollarSign, Percent, Tags } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

import type { VariantMatrixRow } from './types';
import { merchandisingCost, suggestedSellingPrice } from './utils/pricing';

interface QuickPriceMapperProps {
  readonly rows: readonly VariantMatrixRow[];
  readonly defaultPrice: string;
  readonly defaultCompareAtPrice: string;
  readonly onUpdateRow: (id: string, updates: Partial<VariantMatrixRow>) => void;
}

export function QuickPriceMapper({
  rows,
  defaultPrice,
  defaultCompareAtPrice,
  onUpdateRow,
}: QuickPriceMapperProps) {
  const [open, setOpen] = useState(false);
  const [samePrice, setSamePrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [targetMargin, setTargetMargin] = useState('40');
  const [roundingIncrement, setRoundingIncrement] = useState('10');
  const [resultMessage, setResultMessage] = useState('');

  const enabledRows = rows.filter((row) => row.enabled);
  const priceNumber = Number(samePrice);
  const compareAtNumber = Number(compareAtPrice);
  const canApplySamePrice =
    Number.isFinite(priceNumber) &&
    priceNumber > 0 &&
    (!compareAtPrice || (Number.isFinite(compareAtNumber) && compareAtNumber > priceNumber));
  const marginNumber = Number(targetMargin);
  const canApplyMargin = Number.isFinite(marginNumber) && marginNumber > 0 && marginNumber < 100;

  const handleToggle = () => {
    const next = !open;
    if (next) {
      setSamePrice((value) => value || defaultPrice);
      setCompareAtPrice((value) => value || defaultCompareAtPrice);
    }
    setOpen(next);
  };

  const applySamePrice = () => {
    if (!canApplySamePrice) return;
    for (const row of enabledRows) {
      onUpdateRow(row.id, {
        priceAmount: samePrice,
        ...(compareAtPrice ? { compareAtAmount: compareAtPrice } : {}),
      });
    }
    setResultMessage(
      `Mapped the same selling price to ${enabledRows.length} enabled variant${enabledRows.length === 1 ? '' : 's'}.`,
    );
  };

  const applyTargetMargin = (margin = marginNumber) => {
    if (!Number.isFinite(margin) || margin <= 0 || margin >= 100) return;
    let mapped = 0;
    let skipped = 0;
    for (const row of enabledRows) {
      const cost = merchandisingCost(
        row.estimatedCostAmount || row.costAmount,
        row.latestAcquisitionCost,
      );
      const price = suggestedSellingPrice(cost.amount, margin, Number(roundingIncrement));
      if (!price) {
        skipped += 1;
        continue;
      }
      onUpdateRow(row.id, { priceAmount: price });
      mapped += 1;
    }
    setTargetMargin(String(margin));
    setResultMessage(
      `Mapped ${mapped} variant${mapped === 1 ? '' : 's'} to a ${margin}% target margin${skipped ? `; skipped ${skipped} without a usable cost` : ''}.`,
    );
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-10 gap-2 sm:h-8"
        aria-expanded={open}
        aria-controls="quick-price-mapping-panel"
        onClick={handleToggle}
      >
        <Tags className="size-3.5" aria-hidden="true" />
        Quick price mapping
        {open ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
      </Button>

      {open ? (
        <div
          id="quick-price-mapping-panel"
          className="grid gap-3 rounded-lg border border-primary/20 bg-card p-3 shadow-2xs lg:grid-cols-2"
        >
          <section
            className="space-y-3 rounded-md border bg-muted/20 p-3"
            aria-label="Map one price"
          >
            <div className="flex items-start gap-2">
              <CircleDollarSign
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  One price for every enabled variant
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Useful when colors or sizes share the same customer price.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="quick-selling-price" className="text-xs">
                  Selling price (BDT)
                </Label>
                <Input
                  id="quick-selling-price"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  placeholder="e.g. 1490"
                  value={samePrice}
                  onChange={(event) => setSamePrice(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quick-compare-price" className="text-xs">
                  Compare-at price
                </Label>
                <Input
                  id="quick-compare-price"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  placeholder="Optional"
                  value={compareAtPrice}
                  onChange={(event) => setCompareAtPrice(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
            {compareAtPrice && compareAtNumber <= priceNumber ? (
              <p className="text-[11px] text-warning">
                Compare-at price must be higher than the selling price.
              </p>
            ) : null}
            <Button
              type="button"
              className="h-10 w-full sm:w-auto"
              disabled={!canApplySamePrice || enabledRows.length === 0}
              onClick={applySamePrice}
            >
              Map to {enabledRows.length} enabled variant{enabledRows.length === 1 ? '' : 's'}
            </Button>
          </section>

          <section
            className="space-y-3 rounded-md border bg-muted/20 p-3"
            aria-label="Map prices by margin"
          >
            <div className="flex items-start gap-2">
              <Percent className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Price each variant from its cost
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Uses each variant&apos;s landed cost first, then its planning estimate.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[30, 40, 50].map((margin) => (
                <Button
                  key={margin}
                  type="button"
                  variant={targetMargin === String(margin) ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-10 flex-1 text-xs sm:h-9"
                  disabled={enabledRows.length === 0}
                  onClick={() => applyTargetMargin(margin)}
                >
                  {margin}% margin
                </Button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="quick-target-margin" className="text-xs">
                  Custom margin (%)
                </Label>
                <Input
                  id="quick-target-margin"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  inputMode="numeric"
                  value={targetMargin}
                  onChange={(event) => setTargetMargin(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="quick-rounding" className="text-xs">
                  Round price upward to
                </Label>
                <NativeSelect
                  id="quick-rounding"
                  value={roundingIncrement}
                  onChange={(event) => setRoundingIncrement(event.target.value)}
                  className="w-full"
                >
                  <option value="1">Next ৳1</option>
                  <option value="10">Next ৳10</option>
                  <option value="50">Next ৳50</option>
                  <option value="100">Next ৳100</option>
                </NativeSelect>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full sm:w-auto"
              disabled={!canApplyMargin || enabledRows.length === 0}
              onClick={() => applyTargetMargin()}
            >
              Map custom margin
            </Button>
          </section>

          <p className="text-[11px] text-muted-foreground lg:col-span-2" aria-live="polite">
            {resultMessage ||
              'Only enabled variants are changed. Review any mapped price in the matrix before saving.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
