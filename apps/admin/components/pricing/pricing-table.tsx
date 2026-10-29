'use client';

import * as React from 'react';
import {
  Archive,
  Clock,
  History,
  Pencil,
  Tag,
} from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/page-shell';
import { formatMoney } from '@/lib/format/numbers';
import {
  calculateDiscountPercent,
  formatScheduleWindow,
  getScheduleCategory,
  type VariantPriceItem,
} from './types';

interface PricingTableProps {
  readonly items: readonly VariantPriceItem[];
  readonly density: 'comfortable' | 'compact';
  readonly onQuickUpdatePrice: (item: VariantPriceItem) => void;
  readonly onViewHistory: (item: VariantPriceItem) => void;
  readonly onArchivePrice: (item: VariantPriceItem) => void;
  readonly onClearFilters?: () => void;
  readonly hasFilters?: boolean;
}

export function PricingTable({
  items,
  density,
  onQuickUpdatePrice,
  onViewHistory,
  onArchivePrice,
  onClearFilters,
  hasFilters,
}: PricingTableProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title={hasFilters ? 'No prices match your active filters' : 'No price definitions found'}
        description={
          hasFilters
            ? 'Try adjusting your search terms, changing the status tab, or selecting another currency.'
            : 'Set the first variant price definition using the "Set Variant Price" button above.'
        }
        action={
          hasFilters && onClearFilters ? (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear active filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  const now = new Date();

  return (
    <Table density={density}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[30%]">Product & Variant</TableHead>
          <TableHead className="w-[10%]">Currency</TableHead>
          <TableHead className="w-[20%] text-right">Selling Price</TableHead>
          <TableHead className="w-[15%]">Operational Status</TableHead>
          <TableHead className="w-[15%]">Schedule Window</TableHead>
          <TableHead className="w-[10%] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const category = getScheduleCategory(item, now);
          const discount = calculateDiscountPercent(item.amount, item.compareAtAmount);
          const scheduleWindow = formatScheduleWindow(item.effectiveFrom, item.effectiveTo);
          const isArchived = item.status === 'ARCHIVED';

          return (
            <TableRow key={item.priceDefinitionId} className="group">
              {/* Product Title & Variant Details */}
              <TableCell className="align-middle">
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-foreground text-sm truncate">
                    {item.productTitle}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                    {item.variantTitle ? (
                      <span className="font-medium text-foreground/80">{item.variantTitle}</span>
                    ) : null}
                    {item.variantTitle ? <span>•</span> : null}
                    <span className="font-mono tabular-nums text-muted-foreground">
                      SKU: {item.sku}
                    </span>
                  </div>
                </div>
              </TableCell>

              {/* Currency */}
              <TableCell className="align-middle">
                <Badge variant="secondary" className="font-mono text-[11px] font-semibold px-2">
                  {item.currency}
                </Badge>
              </TableCell>

              {/* Selling Price & Compare-At Markdown */}
              <TableCell className="text-right align-middle">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold tabular-nums text-foreground text-sm sm:text-base">
                      {formatMoney(item.amount, item.currency)}
                    </span>
                    {discount !== null ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Badge
                              variant="warning"
                              className="font-mono text-[10px] font-semibold px-1.5 py-0 h-4.5 cursor-help"
                            >
                              -{discount}%
                            </Badge>
                          }
                        />
                        <TooltipContent>
                          <span>
                            Save{' '}
                            {formatMoney(
                              Number(item.compareAtAmount) - Number(item.amount),
                              item.currency,
                            )}{' '}
                            compared to original MSRP
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>

                  {item.compareAtAmount ? (
                    <span className="font-mono tabular-nums text-xs text-muted-foreground line-through">
                      MSRP: {formatMoney(item.compareAtAmount, item.currency)}
                    </span>
                  ) : null}
                </div>
              </TableCell>

              {/* Schedule Status Badge */}
              <TableCell className="align-middle">
                {category === 'LIVE_ACTIVE' && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          Live Active
                        </span>
                      }
                    />
                    <TooltipContent>
                      Serving live storefront customers, cart, and checkout right now.
                    </TooltipContent>
                  </Tooltip>
                )}

                {category === 'UPCOMING' && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <Clock className="size-3.5" aria-hidden="true" />
                          Upcoming Campaign
                        </span>
                      }
                    />
                    <TooltipContent>
                      Scheduled to automatically take effect at {new Date(item.effectiveFrom).toLocaleString()}.
                    </TooltipContent>
                  </Tooltip>
                )}

                {category === 'EXPIRED' && (
                  <Badge variant="destructive" className="text-[11px]">
                    Expired
                  </Badge>
                )}

                {category === 'DRAFT' && (
                  <Badge variant="secondary" className="text-[11px]">
                    Draft
                  </Badge>
                )}

                {category === 'ARCHIVED' && (
                  <Badge variant="outline" className="text-[11px] text-muted-foreground">
                    Archived
                  </Badge>
                )}
              </TableCell>

              {/* Schedule Window */}
              <TableCell className="align-middle text-xs">
                <div className="flex flex-col">
                  <span className="font-mono tabular-nums text-foreground font-medium">
                    {scheduleWindow.primary}
                  </span>
                  {scheduleWindow.secondary ? (
                    <span className="text-[11px] text-muted-foreground">
                      {scheduleWindow.secondary}
                    </span>
                  ) : null}
                </div>
              </TableCell>

              {/* Actions Column */}
              <TableCell className="text-right align-middle">
                <div className="flex items-center justify-end gap-1">
                  {/* Quick update active price */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => onQuickUpdatePrice(item)}
                          aria-label={`Update price for ${item.sku}`}
                        />
                      }
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>Set current retail price</TooltipContent>
                  </Tooltip>

                  {/* View variant history & schedule timeline */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => onViewHistory(item)}
                          aria-label={`View schedule history for ${item.sku}`}
                        />
                      }
                    >
                      <History className="size-3.5" aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>Price history & schedule timeline</TooltipContent>
                  </Tooltip>

                  {/* Archive Price Definition */}
                  {!isArchived && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onArchivePrice(item)}
                            aria-label={`Archive price definition`}
                          />
                        }
                      >
                        <Archive className="size-3.5" aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipContent>Archive price definition</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

