'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ExternalLink, Layers, Package, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
  remainingSupplyQuantity,
} from '@/lib/supply/api';
import { percentage } from '@/lib/supply/status';
import type { ShipmentDetailItemsTableProps } from './types';

export function ShipmentDetailItemsTable({ shipment }: ShipmentDetailItemsTableProps) {
  const [search, setSearch] = useState('');

  const filteredAllocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shipment.allocations;
    return shipment.allocations.filter(
      (alloc) =>
        alloc.productTitle.toLowerCase().includes(q) ||
        alloc.sku.toLowerCase().includes(q) ||
        alloc.purchaseNumber.toLowerCase().includes(q) ||
        alloc.supplierName.toLowerCase().includes(q) ||
        (alloc.optionSummary && alloc.optionSummary.toLowerCase().includes(q)),
    );
  }, [search, shipment.allocations]);

  // Grand totals
  const totalAllocated = shipment.allocations.reduce(
    (sum, a) => sum + Number(a.allocatedQuantity),
    0,
  );
  const totalReceived = shipment.allocations.reduce(
    (sum, a) => sum + Number(a.receivedQuantity),
    0,
  );
  const totalRemaining = totalAllocated - totalReceived;
  const totalValue = shipment.allocations.reduce((sum, a) => {
    const price = Number(a.unitPrice ?? 0);
    const qty = Number(a.allocatedQuantity ?? 0);
    return sum + price * qty;
  }, 0);

  return (
    <div className="space-y-3">
      {/* Header and Filter Control */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">
            Shipment Cargo Items ({shipment.allocations.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Specific purchase order line quantities consolidated into this physical transit container.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by product, SKU, PO #..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Cargo Allocations Table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="w-[34%]">Product & Variant</TableHead>
              <TableHead className="w-[20%]">Source Purchase</TableHead>
              <TableHead className="w-[14%] text-right">Unit Price</TableHead>
              <TableHead className="w-[10%] text-right">Allocated</TableHead>
              <TableHead className="w-[12%] text-right">Received</TableHead>
              <TableHead className="w-[10%] text-right">Remaining</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredAllocations.map((allocation) => {
              const allocated = Number(allocation.allocatedQuantity);
              const received = Number(allocation.receivedQuantity);
              const remaining = Number(
                remainingSupplyQuantity(allocation.allocatedQuantity, allocation.receivedQuantity),
              );
              const pct = percentage(received, allocated);
              const isFullyReceived = received >= allocated;
              const hasStarted = received > 0 && !isFullyReceived;

              return (
                <TableRow key={allocation.id} className="text-xs">
                  {/* Product & Variant Column */}
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/products/${allocation.productId}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {allocation.productTitle}
                        </Link>
                        {allocation.optionSummary ? (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {allocation.optionSummary}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{allocation.sku}</span>
                        <span>·</span>
                        <Link
                          href={`/inventory/adjustments?variantId=${encodeURIComponent(allocation.variantId)}`}
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <span>Check stock</span>
                          <ExternalLink className="size-2.5" />
                        </Link>
                      </div>
                    </div>
                  </TableCell>

                  {/* Originating Purchase Column */}
                  <TableCell className="align-top">
                    <div className="space-y-0.5">
                      <Link
                        href={`/purchases/${allocation.purchaseId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {allocation.purchaseNumber}
                      </Link>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {allocation.supplierName}
                      </p>
                    </div>
                  </TableCell>

                  {/* Commercial Unit Price Column */}
                  <TableCell className="text-right align-top">
                    {allocation.unitPrice ? (
                      <div className="space-y-0.5">
                        <span className="font-medium tabular-nums text-foreground">
                          {formatSupplyMoney(allocation.unitPrice, shipment.currencyCode)}
                        </span>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          Total: {formatSupplyMoney(String(Number(allocation.unitPrice) * allocated), shipment.currencyCode)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Expected Allocated Column */}
                  <TableCell className="text-right align-top font-medium tabular-nums text-foreground">
                    {formatSupplyNumber(allocation.allocatedQuantity)}
                  </TableCell>

                  {/* Received Column with Progress Bar */}
                  <TableCell className="text-right align-top">
                    <div className="space-y-1">
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className={`font-medium tabular-nums ${
                            isFullyReceived
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : hasStarted
                                ? 'text-primary'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {formatSupplyNumber(allocation.receivedQuantity)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                      </div>
                      <Progress value={pct} className="h-1" />
                    </div>
                  </TableCell>

                  {/* Remaining Column */}
                  <TableCell className="text-right align-top">
                    <span
                      className={`font-medium tabular-nums ${
                        remaining > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-muted-foreground font-normal'
                      }`}
                    >
                      {formatSupplyNumber(String(remaining))}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}

            {!filteredAllocations.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No cargo items matching "{search}".
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>

          {/* Grand Totals Footer */}
          {filteredAllocations.length > 0 ? (
            <TableFooter>
              <TableRow className="bg-muted/50 font-semibold text-xs">
                <TableCell colSpan={2}>
                  Total Cargo ({shipment.allocations.length} items)
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalValue > 0 ? formatSupplyMoney(String(totalValue), shipment.currencyCode) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatSupplyNumber(String(totalAllocated))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatSupplyNumber(String(totalReceived))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                  {formatSupplyNumber(String(totalRemaining))}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
