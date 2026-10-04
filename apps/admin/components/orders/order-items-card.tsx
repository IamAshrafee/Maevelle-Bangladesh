'use client';

import { Box, Tag } from 'lucide-react';
import type { OrderDetailDto, OrderLineDto } from '@maevelle/contracts';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CancelOrderLineDialog } from './cancel-order-line-dialog';

interface OrderItemsCardProps {
  readonly order: OrderDetailDto;
  readonly onUpdated: () => void;
}

function formatMoney(amount: number | string | undefined | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
    maximumFractionDigits: 0,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrderItemsCard({ order, onUpdated }: OrderItemsCardProps) {
  const activeLineCount = order.lines.filter((line) => line.status === 'ACTIVE').length;
  const canCancelLine = order.capabilities?.canCancelLines && activeLineCount > 1;

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Order Items">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Items Ordered</h2>
          <p className="text-xs text-muted-foreground">
            Historical snapshot preserved at order creation time.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {order.lines.length} line item{order.lines.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product / Variant</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead className="text-center">Fulfilled</TableHead>
              <TableHead className="text-right">Line Total</TableHead>
              {canCancelLine && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.lines.map((line) => {
              const isCancelled = line.status === 'CANCELLED';
              const fulfilled = Number(line.fulfilledQuantity ?? 0);
              const totalQty = Number(line.quantity);

              return (
                <TableRow
                  key={line.id}
                  className={isCancelled ? 'opacity-60 bg-muted/20' : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {line.imageUrl ? (
                        <img
                          src={line.imageUrl}
                          alt={line.productTitle}
                          className="size-11 rounded-md border object-cover shrink-0"
                        />
                      ) : (
                        <div className="flex size-11 items-center justify-center rounded-md border bg-muted text-muted-foreground shrink-0">
                          <Box className="size-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{line.productTitle}</div>
                        {line.variantTitle ? (
                          <div className="text-xs text-muted-foreground">{line.variantTitle}</div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-mono">SKU: {line.sku}</span>
                          {line.options && line.options.length > 0 && (
                            <>
                              <span>·</span>
                              <span>
                                {line.options.map((opt) => `${opt.name}: ${opt.value}`).join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                        {isCancelled && (
                          <div className="mt-1 text-xs font-semibold text-destructive">
                            Cancelled
                            {line.cancellationReasonCode
                              ? ` · ${line.cancellationReasonCode.replaceAll('_', ' ')}`
                              : ''}
                            {line.cancellationReasonText ? ` (${line.cancellationReasonText})` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-right font-medium">
                    {formatMoney(line.unitPrice, order.currency)}
                  </TableCell>

                  <TableCell className="text-center font-medium">
                    {line.quantity}
                  </TableCell>

                  <TableCell className="text-center text-xs">
                    {isCancelled ? (
                      <span className="text-muted-foreground">—</span>
                    ) : fulfilled >= totalQty ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {fulfilled} / {totalQty} (Full)
                      </span>
                    ) : fulfilled > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {fulfilled} / {totalQty}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0 / {totalQty}</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right font-semibold">
                    {formatMoney(line.net, order.currency)}
                  </TableCell>

                  {canCancelLine && (
                    <TableCell className="text-right">
                      {!isCancelled && (
                        <CancelOrderLineDialog
                          orderId={order.id}
                          orderVersion={order.version}
                          line={line}
                          onCompleted={onUpdated}
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pricing Breakdown */}
      <div className="flex justify-end border-t bg-muted/30 px-6 py-4">
        <div className="w-full max-w-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatMoney(order.merchandiseGross, order.currency)}</span>
          </div>

          {Number(order.discountTotal) > 0 ? (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-1">
                <Tag className="size-3.5" />
                Discounts
                {order.discountApplications?.[0]?.promotionName
                  ? ` (${order.discountApplications[0].promotionName})`
                  : ''}
              </span>
              <span>−{formatMoney(order.discountTotal, order.currency)}</span>
            </div>
          ) : null}

          <div className="flex justify-between">
            <span className="text-muted-foreground" title="Charge paid by the customer for shipping">
              Customer Shipping Charge
            </span>
            <span>
              {Number(order.deliveryAmount) === 0 ? 'Free' : formatMoney(order.deliveryAmount, order.currency)}
            </span>
          </div>

          {Number(order.taxAmount) > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatMoney(order.taxAmount, order.currency)}</span>
            </div>
          ) : null}

          <div className="flex justify-between border-t pt-2 text-base font-bold text-foreground">
            <span>Grand Total</span>
            <span>{formatMoney(order.total, order.currency)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
