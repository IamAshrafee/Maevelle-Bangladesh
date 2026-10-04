'use client';

import {
  AlertTriangle,
  Box,
  Copy,
  ExternalLink,
  Package,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  Truck,
} from 'lucide-react';
import Link from 'next/link';

import type { OrderDetailDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { CreateFulfillmentDialog } from './create-fulfillment-dialog';

interface OrderFulfillmentDeliveryCardProps {
  readonly order: OrderDetailDto;
  readonly onUpdated: () => void;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function OrderFulfillmentDeliveryCard({
  order,
  onUpdated,
}: OrderFulfillmentDeliveryCardProps) {
  const { fulfillments = [], deliveries = [], capabilities } = order;
  const activeLines = order.lines.filter((line) => line.status === 'ACTIVE');

  const rtoDeliveries = deliveries.filter((d) =>
    ['FAILED', 'RETURNED_TO_ORIGIN', 'LOST', 'DAMAGED'].includes(d.outcomeStatus ?? ''),
  );

  return (
    <div className="space-y-6">
      {/* RTO Alert Banner if any courier delivery returned to origin */}
      {rtoDeliveries.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50/90 p-4 text-xs text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          <div className="flex items-center gap-2 font-semibold text-rose-900 dark:text-rose-300">
            <AlertTriangle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>Courier Delivery Issue / Return to Origin (RTO)</span>
          </div>
          <p className="mt-1">
            One or more courier shipments failed delivery and are being returned to warehouse.
            This is distinct from a customer-initiated return.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {rtoDeliveries.map((d) => (
              <Link
                key={d.id}
                href={`/deliveries?q=${encodeURIComponent(d.deliveryNumber)}`}
                className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-medium text-rose-900 border border-rose-200 hover:underline dark:bg-rose-900/60 dark:text-rose-100 dark:border-rose-800"
              >
                {d.deliveryNumber}: {d.outcomeStatus?.replaceAll('_', ' ')}
                <ExternalLink className="size-3 opacity-70" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Fulfillments Section */}
      <section className="rounded-xl border bg-card shadow-sm" aria-label="Fulfillments">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Package className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">Fulfillments</h2>
          </div>
          {capabilities.canCreateFulfillment && (
            <CreateFulfillmentDialog
              orderId={order.id}
              currentVersion={order.version}
              lines={activeLines}
            />
          )}
        </div>

        <div className="p-6">
          {fulfillments.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
              <Box className="mb-2 size-8 opacity-20" />
              <p className="text-sm">No fulfillments created yet.</p>
              {capabilities.canCreateFulfillment && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Order is confirmed and ready for warehouse allocation.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {fulfillments.map((fulfillment) => (
                <div
                  key={fulfillment.id}
                  className="rounded-lg border bg-background p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {fulfillment.fulfillmentNumber}
                      </span>
                      <StatusBadge status={fulfillment.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fulfillment.dispatchedAt
                        ? `Dispatched: ${formatDate(fulfillment.dispatchedAt)}`
                        : 'Warehouse allocation active'}
                    </p>
                  </div>
                  <div className="pt-2 border-t flex justify-end">
                    <Link
                      href={`/fulfillments?q=${encodeURIComponent(fulfillment.fulfillmentNumber)}`}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Manage fulfillment
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Deliveries Section */}
      <section className="rounded-xl border bg-card shadow-sm" aria-label="Deliveries">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">Shipments & Deliveries</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {deliveries.length} consignment{deliveries.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="p-6">
          {deliveries.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
              <Truck className="mb-2 size-8 opacity-20" />
              <p className="text-sm">No shipments booked or dispatched yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {deliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-lg border bg-background p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {delivery.deliveryNumber}
                      </span>
                      <StatusBadge status={delivery.outcomeStatus ?? delivery.status} />
                    </div>

                    {delivery.trackingNumber && (
                      <div className="mt-2 flex items-center justify-between rounded bg-muted/40 px-2.5 py-1 text-xs">
                        <span className="text-muted-foreground">Tracking / Consignment:</span>
                        <span className="font-mono font-medium text-primary">
                          {delivery.trackingNumber}
                        </span>
                      </div>
                    )}

                    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {delivery.dispatchedAt && (
                        <p>Handed Over: {formatDate(delivery.dispatchedAt)}</p>
                      )}
                      {delivery.deliveredAt && (
                        <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Delivered: {formatDate(delivery.deliveredAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t flex justify-end">
                    <Link
                      href={`/deliveries?q=${encodeURIComponent(delivery.deliveryNumber)}`}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Track in Deliveries
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
