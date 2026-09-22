'use client';

import Link from 'next/link';
import { Edit3, ExternalLink, HelpCircle, Package, PackagePlus, Trash2 } from 'lucide-react';
import type { CatalogVariantChoiceDto, PurchaseDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  formatSupplyMoney,
  formatSupplyNumber,
} from '@/lib/supply/api';
import type { PurchaseLine } from './types';

export interface PurchaseDetailItemsTableProps {
  readonly purchase: PurchaseDto;
  readonly variants: readonly CatalogVariantChoiceDto[];
  readonly canManage: boolean;
  readonly busy: boolean;
  readonly onAddLineClick: () => void;
  readonly onEditLine: (line: PurchaseLine) => void;
  readonly onDeleteLine: (lineId: string) => void;
}

export function PurchaseDetailItemsTable({
  purchase,
  variants,
  canManage,
  busy,
  onAddLineClick,
  onEditLine,
  onDeleteLine,
}: PurchaseDetailItemsTableProps) {
  const isDraft = purchase.status === 'DRAFT';

  // Calculate totals
  const totalUnits = purchase.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  const totalAllocated = purchase.lines.reduce((sum, line) => sum + Number(line.allocatedQuantity), 0);
  const totalReceived = purchase.lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0);

  if (purchase.lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center sm:p-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Package className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 font-heading text-base font-semibold">No purchase items yet</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Add at least one product variant with agreed supplier quantity and unit price before placing this order.
        </p>
        {isDraft && canManage ? (
          <Button className="mt-5" onClick={onAddLineClick} disabled={busy}>
            <PackagePlus className="size-4" />
            <span>Add first item</span>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Ordered Items ({purchase.lines.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            {isDraft
              ? 'Quantities and prices can be adjusted while this purchase order is in Draft status.'
              : 'Commercial quantities and unit prices are locked. Inbound shipments will draw down allocated units.'}
          </p>
        </div>
        {isDraft && canManage ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="outline" size="sm" onClick={onAddLineClick} disabled={busy} />
              }
            >
              <PackagePlus className="size-3.5" />
              <span>Add item</span>
            </TooltipTrigger>
            <TooltipContent side="top">Add another product variant to this draft</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[200px]">Product & SKU</TableHead>
              <TableHead className="text-right">Ordered Qty</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Line Total</TableHead>
              <TableHead className="text-center">
                <span className="inline-flex items-center gap-1">
                  Allocated
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
                      <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Assigned to an inbound freight shipment (container, air parcel, or courier)
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableHead>
              <TableHead className="text-center">
                <span className="inline-flex items-center gap-1">
                  Received
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
                      <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Physically scanned and accepted into warehouse inventory
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableHead>
              {isDraft && canManage ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchase.lines.map((line) => {
              const lineOrdered = Number(line.quantity);
              const lineAllocated = Number(line.allocatedQuantity);
              const lineReceived = Number(line.receivedQuantity);
              const lineTotal = lineOrdered * Number(line.unitPrice);

              // Resolve option summary if not on line
              const optionSummary =
                line.optionSummary ||
                variants.find((v) => v.id === line.variantId)?.optionSummary ||
                '';

              return (
                <TableRow key={line.id} className="group">
                  {/* Product Details */}
                  <TableCell className="max-w-[280px]">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <Link
                          href={`/products/${line.productId}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {line.productTitle}
                        </Link>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground">{line.sku}</span>
                        {optionSummary ? (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {optionSummary}
                          </Badge>
                        ) : null}
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Link
                                href={`/inventory/adjustments?variantId=${encodeURIComponent(line.variantId)}`}
                                className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                              />
                            }
                          >
                            <span>Stock</span>
                            <ExternalLink className="size-2.5" />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Inspect stock on hand and adjustments for {line.sku}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TableCell>

                  {/* Ordered Quantity */}
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatSupplyNumber(line.quantity)}
                  </TableCell>

                  {/* Unit Price */}
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {formatSupplyMoney(line.unitPrice, purchase.currencyCode)}
                  </TableCell>

                  {/* Line Total */}
                  <TableCell className="text-right font-medium font-mono tabular-nums">
                    {formatSupplyMoney(String(lineTotal), purchase.currencyCode)}
                  </TableCell>

                  {/* Allocation Status */}
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
                        <Badge
                          variant={
                            lineAllocated >= lineOrdered
                              ? 'default'
                              : lineAllocated > 0
                                ? 'secondary'
                                : 'outline'
                          }
                          className="gap-1 font-mono text-[11px]"
                        >
                          {formatSupplyNumber(String(lineAllocated))} / {formatSupplyNumber(String(lineOrdered))}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {lineAllocated >= lineOrdered
                          ? 'All units allocated to inbound freight shipments'
                          : lineAllocated > 0
                            ? `${lineOrdered - lineAllocated} units still waiting for a shipment`
                            : 'No shipment created for this item yet'}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Receiving Status */}
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
                        <Badge
                          variant={
                            lineReceived >= lineOrdered
                              ? 'default'
                              : lineReceived > 0
                                ? 'secondary'
                                : 'outline'
                          }
                          className="gap-1 font-mono text-[11px]"
                        >
                          {formatSupplyNumber(String(lineReceived))} / {formatSupplyNumber(String(lineOrdered))}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {lineReceived >= lineOrdered
                          ? 'All ordered units received into warehouse inventory'
                          : lineReceived > 0
                            ? `${lineOrdered - lineReceived} units pending arrival/receipt`
                            : 'No units received into inventory yet'}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Line Actions (Draft Mode Only) */}
                  {isDraft && canManage ? (
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => onEditLine(line)}
                              />
                            }
                          >
                            <Edit3 className="size-3.5" />
                          </TooltipTrigger>
                          <TooltipContent side="top">Edit quantity or unit price</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={busy}
                                onClick={() => onDeleteLine(line.id)}
                              />
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </TooltipTrigger>
                          <TooltipContent side="top">Remove this item from draft</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Totals</TableCell>
              <TableCell className="text-right font-bold tabular-nums">
                {formatSupplyNumber(String(totalUnits))}
              </TableCell>
              <TableCell className="text-right text-muted-foreground font-mono">Avg / Mix</TableCell>
              <TableCell className="text-right font-bold font-mono tabular-nums">
                {formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
              </TableCell>
              <TableCell className="text-center font-semibold font-mono tabular-nums">
                {formatSupplyNumber(String(totalAllocated))} / {formatSupplyNumber(String(totalUnits))}
              </TableCell>
              <TableCell className="text-center font-semibold font-mono tabular-nums">
                {formatSupplyNumber(String(totalReceived))} / {formatSupplyNumber(String(totalUnits))}
              </TableCell>
              {isDraft && canManage ? <TableCell /> : null}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
