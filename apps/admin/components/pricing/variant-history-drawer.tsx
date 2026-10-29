'use client';

import * as React from 'react';
import {
  Archive,
  Clock,
  History,
  Pencil,
} from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format/numbers';
import {
  calculateDiscountPercent,
  formatScheduleWindow,
  getScheduleCategory,
  type VariantPriceItem,
} from './types';

interface VariantHistoryDrawerProps {
  readonly item: VariantPriceItem | null;
  readonly allPrices: readonly VariantPriceItem[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onQuickUpdatePrice: (item: VariantPriceItem) => void;
  readonly onArchivePrice: (item: VariantPriceItem) => void;
}

export function VariantHistoryDrawer({
  item,
  allPrices,
  open,
  onOpenChange,
  onQuickUpdatePrice,
  onArchivePrice,
}: VariantHistoryDrawerProps) {
  if (!item) return null;

  // Filter all price definitions for this variant
  const variantPrices = React.useMemo(() => {
    return allPrices.filter((p) => p.variantId === item.variantId);
  }, [allPrices, item.variantId]);

  const now = new Date();

  const { livePrices, upcomingPrices, pastPrices } = React.useMemo(() => {
    const live: VariantPriceItem[] = [];
    const upcoming: VariantPriceItem[] = [];
    const past: VariantPriceItem[] = [];

    for (const p of variantPrices) {
      const cat = getScheduleCategory(p, now);
      if (cat === 'LIVE_ACTIVE') {
        live.push(p);
      } else if (cat === 'UPCOMING') {
        upcoming.push(p);
      } else {
        past.push(p);
      }
    }

    return { livePrices: live, upcomingPrices: upcoming, pastPrices: past };
  }, [variantPrices, now]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="size-4" />
            </div>
            <div>
              <SheetTitle>Pricing History & Schedules</SheetTitle>
              <SheetDescription>Timeline of all commercial definitions for this SKU.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Variant Info Header */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground text-sm truncate">{item.productTitle}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {item.currency}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
            {item.variantTitle ? <span>{item.variantTitle}</span> : null}
            {item.variantTitle ? <span>•</span> : null}
            <span>SKU: {item.sku}</span>
          </div>

          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs h-8"
              onClick={() => {
                onOpenChange(false);
                onQuickUpdatePrice(item);
              }}
            >
              <Pencil className="size-3.5" /> Set New Live Price
            </Button>
          </div>
        </div>

        {/* Section 1: Live Active Definitions */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Currently Live ({livePrices.length})</span>
          </div>

          {livePrices.length === 0 ? (
            <p className="text-xs text-muted-foreground italic rounded-lg border border-dashed border-border/80 p-3">
              No price definition is currently live for this SKU.
            </p>
          ) : (
            livePrices.map((price) => {
              const discount = calculateDiscountPercent(price.amount, price.compareAtAmount);
              const window = formatScheduleWindow(price.effectiveFrom, price.effectiveTo);
              return (
                <div
                  key={price.priceDefinitionId}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-foreground text-base tabular-nums">
                      {formatMoney(price.amount, price.currency)}
                    </span>
                    <Badge variant="success" className="text-[10px] font-semibold">
                      Live Active
                    </Badge>
                  </div>

                  {price.compareAtAmount && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono tabular-nums text-muted-foreground line-through">
                        MSRP: {formatMoney(price.compareAtAmount, price.currency)}
                      </span>
                      {discount !== null && (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0 h-4">
                          -{discount}%
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                    <span className="font-mono tabular-nums">{window.primary}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10 text-[11px]"
                      onClick={() => onArchivePrice(price)}
                    >
                      Archive
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Section 2: Scheduled Campaigns (Upcoming) */}
        {upcomingPrices.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="size-3.5 text-amber-500" />
              <span>Upcoming Scheduled ({upcomingPrices.length})</span>
            </div>

            {upcomingPrices.map((price) => {
              const discount = calculateDiscountPercent(price.amount, price.compareAtAmount);
              const window = formatScheduleWindow(price.effectiveFrom, price.effectiveTo);
              return (
                <div
                  key={price.priceDefinitionId}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-foreground text-base tabular-nums">
                      {formatMoney(price.amount, price.currency)}
                    </span>
                    <Badge variant="warning" className="text-[10px] font-semibold">
                      Scheduled
                    </Badge>
                  </div>

                  {price.compareAtAmount && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono tabular-nums text-muted-foreground line-through">
                        MSRP: {formatMoney(price.compareAtAmount, price.currency)}
                      </span>
                      {discount !== null && (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0 h-4">
                          -{discount}%
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                    <span className="font-mono tabular-nums">{window.primary}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10 text-[11px]"
                      onClick={() => onArchivePrice(price)}
                    >
                      Cancel Schedule
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Section 3: Past / Archived History */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Archive className="size-3.5" />
            <span>Audit History & Archived ({pastPrices.length})</span>
          </div>

          {pastPrices.length === 0 ? (
            <p className="text-xs text-muted-foreground italic rounded-lg border border-dashed border-border/80 p-3">
              No archived commercial history yet.
            </p>
          ) : (
            pastPrices.map((price) => {
              const window = formatScheduleWindow(price.effectiveFrom, price.effectiveTo);
              return (
                <div
                  key={price.priceDefinitionId}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {formatMoney(price.amount, price.currency)}
                    </span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {price.status}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                    <span>{window.primary}</span>
                    <span>v{price.version}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

