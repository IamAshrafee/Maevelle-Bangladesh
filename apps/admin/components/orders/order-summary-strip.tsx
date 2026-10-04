'use client';

import {
  AlertTriangle,
  Box,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Package,
  Share2,
  Truck,
} from 'lucide-react';

import type { OrderDetailDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';

interface OrderSummaryStripProps {
  readonly order: OrderDetailDto;
}

function formatMoney(amount: number | string | undefined | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
    maximumFractionDigits: 0,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrderSummaryStrip({ order }: OrderSummaryStripProps) {
  // Calculate total ordered vs fulfilled units
  const activeLines = order.lines.filter((l) => l.status === 'ACTIVE');
  const totalOrderedQuantity = activeLines.reduce(
    (sum, line) => sum + Number(line.quantity),
    0,
  );
  const totalFulfilledQuantity = activeLines.reduce(
    (sum, line) => sum + Number(line.fulfilledQuantity ?? 0),
    0,
  );

  // Check delivery tracking info
  const activeDelivery = order.deliveries?.[0];
  const hasRto = order.deliveries?.some((d) =>
    ['FAILED', 'RETURNED_TO_ORIGIN', 'LOST', 'DAMAGED'].includes(d.outcomeStatus ?? ''),
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* 1. Commercial Status */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Commercial</span>
          <Share2 className="size-4 opacity-70" aria-hidden="true" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground truncate">
          Channel: <span className="font-medium text-foreground">{order.salesChannel.replaceAll('_', ' ')}</span>
        </p>
      </div>

      {/* 2. Payment & COD */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Payment</span>
          <CircleDollarSign className="size-4 opacity-70" aria-hidden="true" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={order.payment.status} />
        </div>
        <div className="mt-2 text-xs">
          {order.paymentMethod === 'COD' ? (
            <p className="text-muted-foreground">
              COD Due:{' '}
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {formatMoney(order.payment.outstanding, order.currency)}
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">
              Paid:{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatMoney(order.payment.collected, order.currency)}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* 3. Fulfillment Progress */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Fulfillment</span>
          <Package className="size-4 opacity-70" aria-hidden="true" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={order.fulfillmentStatus} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground truncate">
          {totalFulfilledQuantity === 0 ? (
            '0 items fulfilled'
          ) : (
            <span className="font-medium text-foreground">
              {totalFulfilledQuantity} of {totalOrderedQuantity} units fulfilled
            </span>
          )}
        </p>
      </div>

      {/* 4. Delivery & Logistics */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">Delivery</span>
          <Truck className="size-4 opacity-70" aria-hidden="true" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {hasRto ? (
            <span className="status-badge status-danger">RTO / Issue</span>
          ) : (
            <StatusBadge status={order.deliveryStatus} />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground truncate">
          {activeDelivery?.trackingNumber ? (
            <span className="font-mono text-primary truncate block" title={activeDelivery.trackingNumber}>
              {activeDelivery.trackingNumber}
            </span>
          ) : (
            <span>{order.deliveries?.length ? `${order.deliveries.length} shipment(s)` : 'Not dispatched'}</span>
          )}
        </p>
      </div>
    </div>
  );
}
