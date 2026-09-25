'use client';

import {
  Box,
  CheckCircle2,
  CircleDollarSign,
  PackageSearch,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { OrderDetailDto } from '@maevelle/contracts';

import { CancelOrderDialog } from './cancel-order-dialog';
import { CreateFulfillmentDialog } from './create-fulfillment-dialog';
import { HoldOrderDialog } from './hold-order-dialog';
import { CancelOrderLineDialog } from './cancel-order-line-dialog';
import { AddOrderNoteDialog } from './add-order-note-dialog';
import { CorrectDeliveryAddressDialog } from './correct-delivery-address-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchApiData } from '@/lib/api';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(date);
}

function formatMoney(amount: number | string | undefined | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrderDetailConsole({ orderId }: { readonly orderId: string }) {
  const [order, setOrder] = useState<OrderDetailDto>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  async function confirmOrder() {
    try {
      await fetchApiData(`/admin/orders/${order!.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ version: order!.version, status: 'CONFIRMED' }),
      });
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to confirm order');
    }
  }

  async function resumeOrder() {
    try {
      await fetchApiData(`/admin/orders/${order!.id}/resume`, {
        method: 'POST',
        body: JSON.stringify({ version: order!.version }),
      });
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to resume order');
    }
  }

  async function load() {
    setState('loading');
    try {
      const data = await fetchApiData<OrderDetailDto>(`/admin/orders/${orderId}`);
      setOrder(data);
      setMessage('');
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    void load();
  }, [orderId]);

  if (state === 'loading') {
    return (
      <main className="px-8 py-12 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 inline size-4 animate-spin" /> Loading order {orderId}...
      </main>
    );
  }

  if (state === 'error' || !order) {
    return (
      <main className="px-8 py-12 text-sm text-red-500">
        <XCircle className="mr-2 inline size-4" /> {message || 'Order not found.'}
      </main>
    );
  }

  const activeLineCount = order.lines.filter((line) => line.status === 'ACTIVE').length;
  const canCancelLine =
    ['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(order.status) &&
    order.fulfillmentStatus === 'UNFULFILLED' &&
    order.paymentStatus === 'UNPAID' &&
    activeLineCount > 1;

  return (
    <main className="min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Breadcrumb
              items={[
                { label: 'Orders', href: '/orders' },
                { label: order.orderNumber, current: true },
              ]}
              className="mb-2"
            />
            <h1 className="flex items-center gap-3 text-balance text-2xl font-semibold tracking-tight">
              Order {order.orderNumber}
              <StatusBadge status={order.status} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Placed on {formatDateTime(order.createdAt)} ·{' '}
              {order.salesChannel.replaceAll('_', ' ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Refresh
            </Button>
            {order.status === 'PENDING' && (
              <CancelOrderDialog orderId={order.id} currentVersion={order.version} />
            )}
            {order.status === 'PENDING' && (
              <Button onClick={confirmOrder}>
                <CheckCircle2 className="mr-2 size-4" /> Confirm Order
              </Button>
            )}
            {order.status === 'CONFIRMED' && (
              <CancelOrderDialog orderId={order.id} currentVersion={order.version} />
            )}
            {order.status === 'CONFIRMED' && (
              <HoldOrderDialog orderId={order.id} currentVersion={order.version} />
            )}
            {order.status === 'ON_HOLD' && <Button onClick={resumeOrder}>Resume Order</Button>}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Main Details */}
        <div className="space-y-6 lg:col-span-2">
          {/* Order Items */}
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Items</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => (
                    <TableRow
                      key={line.id}
                      className={line.status === 'CANCELLED' ? 'opacity-60' : undefined}
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
                            <div className="text-xs text-muted-foreground">SKU: {line.sku}</div>
                            {line.status === 'CANCELLED' ? (
                              <div className="mt-1 text-xs font-medium text-destructive">
                                Cancelled
                                {line.cancellationReasonCode
                                  ? ` · ${line.cancellationReasonCode.replaceAll('_', ' ')}`
                                  : ''}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(line.unitPrice, order.currency)}
                      </TableCell>
                      <TableCell className="text-right">{line.quantity}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(line.net, order.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.status === 'ACTIVE' && canCancelLine ? (
                          <CancelOrderLineDialog
                            orderId={order.id}
                            orderVersion={order.version}
                            line={line}
                            onCompleted={() => void load()}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end border-t bg-muted/50 px-6 py-4">
              <div className="w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(order.merchandiseGross, order.currency)}</span>
                </div>
                {Number(order.discountTotal) > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discounts</span>
                    <span>−{formatMoney(order.discountTotal, order.currency)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span>{formatMoney(order.deliveryAmount, order.currency)}</span>
                </div>
                {Number(order.taxAmount) > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatMoney(order.taxAmount, order.currency)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t pt-2 text-base font-medium">
                  <span>Total</span>
                  <span>{formatMoney(order.total, order.currency)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Payment Section */}
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-medium text-foreground">
                <CircleDollarSign className="size-5 text-muted-foreground" /> Payment
              </h2>
              <div className="flex items-center gap-2">
                <StatusBadge status={order.payment.status} />
                <Button
                  render={<Link href={`/payments?q=${encodeURIComponent(order.orderNumber)}`} />}
                  size="sm"
                  variant="outline"
                >
                  Payment operations
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Method</p>
                <p className="mt-1 font-medium">{order.payment.method}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expected</p>
                <p className="mt-1 font-medium">
                  {formatMoney(order.payment.expected, order.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="mt-1 font-medium text-emerald-600">
                  {formatMoney(order.payment.collected, order.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="mt-1 font-medium text-rose-600">
                  {formatMoney(order.payment.outstanding, order.currency)}
                </p>
              </div>
            </div>
            {order.cancellation?.refundSettlement &&
            order.cancellation.refundSettlement !== 'NOT_REQUIRED' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-amber-50/60 px-6 py-4 text-sm">
                <div>
                  <p className="font-medium text-amber-950">
                    Cancellation refund: {order.cancellation.refundSettlement.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 text-amber-900/80">
                    {order.cancellation.refundObligations.length} linked refund request
                    {order.cancellation.refundObligations.length === 1 ? '' : 's'} must be settled through
                    Payment operations.
                  </p>
                </div>
                <Button
                  render={<Link href={`/payments?tab=refunds&q=${encodeURIComponent(order.orderNumber)}`} />}
                  size="sm"
                  variant="outline"
                >
                  Review refunds
                </Button>
              </div>
            ) : null}
          </section>

          {/* Fulfillments Section */}
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Fulfillments</h2>
              {(order.status === 'PENDING' || order.status === 'CONFIRMED') && (
                <CreateFulfillmentDialog
                  orderId={order.id}
                  currentVersion={order.version}
                  lines={order.lines.filter((line) => line.status === 'ACTIVE')}
                />
              )}
            </div>
            <div className="p-6">
              {!order.fulfillments || order.fulfillments.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
                  <Box className="mb-2 size-8 opacity-20" />
                  <p className="text-sm">No fulfillments created yet.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {order.fulfillments.map((fulfillment) => (
                    <div key={fulfillment.id} className="relative rounded-lg border p-4">
                      <p className="font-medium text-foreground">{fulfillment.fulfillmentNumber}</p>
                      <StatusBadge status={fulfillment.status} />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {fulfillment.dispatchedAt
                          ? `Dispatched: ${formatDate(fulfillment.dispatchedAt)}`
                          : 'Pending Dispatch'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Deliveries Section */}
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Deliveries</h2>
            </div>
            <div className="p-6">
              {!order.deliveries || order.deliveries.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
                  <PackageSearch className="mb-2 size-8 opacity-20" />
                  <p className="text-sm">No deliveries dispatched yet.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {order.deliveries.map((delivery) => (
                    <div key={delivery.id} className="relative rounded-lg border p-4">
                      <p className="font-medium text-foreground">{delivery.deliveryNumber}</p>
                      <StatusBadge status={delivery.status} />
                      {delivery.trackingNumber && (
                        <p className="mt-2 text-sm text-primary">
                          Tracking: {delivery.trackingNumber}
                        </p>
                      )}
                      {delivery.status !== 'DELIVERED' && delivery.status !== 'FAILED' && (
                        <Button variant="outline" size="sm" className="mt-4 w-full">
                          Initiate RTO
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Returns Section */}
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Returns</h2>
            </div>
            <div className="p-6">
              {!order.returnCases || order.returnCases.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center text-muted-foreground">
                  <RefreshCw className="mb-2 size-8 opacity-20" />
                  <p className="text-sm">No return cases filed.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {order.returnCases.map((rc) => (
                    <div key={rc.id} className="relative rounded-lg border p-4">
                      <p className="font-medium text-foreground">{rc.caseNumber}</p>
                      <StatusBadge status={rc.status} />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {rc.returnType} • {formatDate(rc.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column - Customer & Timeline */}
        <div className="space-y-6">
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Notes</h2>
              <AddOrderNoteDialog orderId={order.id} onCompleted={() => void load()} />
            </div>
            <div className="px-6 py-4">
              {order.notes.length ? (
                <ul className="space-y-4">
                  {order.notes.map((note) => (
                    <li key={note.id} className="text-sm">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {note.noteType === 'INTERNAL' ? 'Internal' : 'Customer visible'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-foreground">{note.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm italic text-muted-foreground">No notes recorded.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Delivery address</h2>
              {['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(order.status) &&
              order.fulfillmentStatus === 'UNFULFILLED' ? (
                <CorrectDeliveryAddressDialog order={order} onCompleted={() => void load()} />
              ) : null}
            </div>
            <address className="space-y-1 px-6 py-4 text-sm not-italic">
              <p className="font-medium text-foreground">{order.address.recipientName}</p>
              <p>{order.address.phone}</p>
              <p>{order.address.addressLine1}</p>
              {order.address.addressLine2 ? <p>{order.address.addressLine2}</p> : null}
              <p className="text-muted-foreground">
                {[
                  order.address.area,
                  order.address.city,
                  order.address.district,
                  order.address.postalCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            </address>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Customer</h2>
            </div>
            <div className="px-6 py-4 text-sm">
              <div className="font-medium text-foreground">
                {order.customerId ? (
                  <Link
                    href={`/customers/${order.customerId}`}
                    className="hover:underline text-primary"
                  >
                    {order.customerName ?? 'Guest'}
                  </Link>
                ) : (
                  (order.customerName ?? 'Guest')
                )}
              </div>
              {order.customerEmail ? (
                <div className="mt-1 text-muted-foreground">
                  <a
                    href={`mailto:${order.customerEmail}`}
                    className="hover:underline text-blue-600"
                  >
                    {order.customerEmail}
                  </a>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Timeline</h2>
            </div>
            <div className="px-6 py-4">
              <ul className="space-y-4">
                {order.timeline.length === 0 ? (
                  <li className="text-sm text-muted-foreground italic">No events recorded.</li>
                ) : (
                  order.timeline.map((event, index) => (
                    <li key={event.id} className="flex gap-4">
                      <div className="relative flex flex-col items-center">
                        <div className="size-2.5 rounded-full bg-primary ring-4 ring-background" />
                        {index !== order.timeline.length - 1 && (
                          <div className="absolute top-3 w-px h-full bg-border" />
                        )}
                      </div>
                      <div className="flex flex-col pb-4">
                        <span className="text-sm font-medium">{event.eventType}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.occurredAt)}
                        </span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
