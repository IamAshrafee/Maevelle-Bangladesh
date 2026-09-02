'use client';

import { ArrowLeft, Box, CheckCircle2, CircleDollarSign, PackageSearch, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { OrderDetailDto } from '@maevelle/contracts';

import { CancelOrderDialog } from './cancel-order-dialog';
import { CreateFulfillmentDialog } from './create-fulfillment-dialog';
import { HoldOrderDialog } from './hold-order-dialog';
import { StatusBadge } from '@/components/status-badge';
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

export function OrderDetailConsole({ orderId }: { readonly orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetailDto>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  async function confirmOrder() {
    try {
      await fetchApiData(`/admin/orders/${order!.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ version: order!.version, status: 'CONFIRMED' }),
      });
      router.refresh();
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
      router.refresh();
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

  return (
    <main className="min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5">
        <div className="flex items-center justify-between">
          <div>
            <nav className="mb-2 text-xs font-medium text-muted-foreground" aria-label="Breadcrumb">
              <Link href="/orders" className="hover:underline">
                Orders
              </Link>{' '}
              <span aria-hidden="true">/</span> {order.orderNumber}
            </nav>
            <h1 className="flex items-center gap-3 text-balance text-2xl font-semibold tracking-tight">
              Order {order.orderNumber}
              <StatusBadge status={order.status} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Placed on {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            {order.status === 'ON_HOLD' && (
              <Button onClick={resumeOrder}>
                Resume Order
              </Button>
            )}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{line.productTitle}</div>
                      <div className="text-xs text-muted-foreground">SKU: {line.sku}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {new Intl.NumberFormat('en-BD', { style: 'currency', currency: order.currency }).format(Number(line.unitPrice))}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.quantity}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {new Intl.NumberFormat('en-BD', { style: 'currency', currency: order.currency }).format(Number(line.total))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end border-t bg-muted/50 px-6 py-4">
              <div className="w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{new Intl.NumberFormat('en-BD', { style: 'currency', currency: order.currency }).format(Number(order.total))}</span>
                </div>
                {/* Note: In a full app, you'd show discounts/taxes here */}
                <div className="flex justify-between border-t pt-2 text-base font-medium">
                  <span>Total</span>
                  <span>{new Intl.NumberFormat('en-BD', { style: 'currency', currency: order.currency }).format(Number(order.total))}</span>
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
              <StatusBadge status={order.payment.status} />
            </div>
            <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Method</p>
                <p className="mt-1 font-medium">{order.payment.method}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expected</p>
                <p className="mt-1 font-medium">
                  {new Intl.NumberFormat('en-BD', { style: 'currency', currency: order.currency }).format(Number(order.payment.expected))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="mt-1 font-medium text-emerald-600">
                  {new Intl.NumberFormat('en-BD', { style: 'currency', currency: order.currency }).format(Number(order.payment.collected))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="mt-1 font-medium text-rose-600">
                  {new Intl.NumberFormat('en-BD', { style: 'currency', currency: order.currency }).format(Number(order.payment.outstanding))}
                </p>
              </div>
            </div>
          </section>
          
          {/* Fulfillments Section */}
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Fulfillments</h2>
              {(order.status === 'PENDING' || order.status === 'CONFIRMED') && (
                <CreateFulfillmentDialog orderId={order.id} currentVersion={order.version} lines={order.lines} />
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
                  {order.fulfillments.map((fulfillment: any) => (
                    <div key={fulfillment.id} className="relative rounded-lg border p-4">
                      <p className="font-medium text-foreground">{fulfillment.fulfillmentNumber}</p>
                      <StatusBadge status={fulfillment.status} />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {fulfillment.dispatchedAt ? `Dispatched: ${new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(new Date(fulfillment.dispatchedAt))}` : 'Pending Dispatch'}
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
                  {order.deliveries.map((delivery: any) => (
                    <div key={delivery.id} className="relative rounded-lg border p-4">
                      <p className="font-medium text-foreground">{delivery.deliveryNumber}</p>
                      <StatusBadge status={delivery.status} />
                      {delivery.trackingNumber && (
                        <p className="mt-2 text-sm text-primary">Tracking: {delivery.trackingNumber}</p>
                      )}
                      {delivery.status !== 'DELIVERED' && delivery.status !== 'FAILED' && (
                        <Button variant="outline" size="sm" className="mt-4 w-full">Initiate RTO</Button>
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
                  {order.returnCases.map((rc: any) => (
                    <div key={rc.id} className="relative rounded-lg border p-4">
                      <p className="font-medium text-foreground">{rc.caseNumber}</p>
                      <StatusBadge status={rc.status} />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {rc.returnType} • {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(new Date(rc.createdAt))}
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
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Customer</h2>
            </div>
            <div className="px-6 py-4 text-sm">
              <div className="font-medium text-foreground">
                {order.customerId ? (
                  <Link href={`/customers/${order.customerId}`} className="hover:underline text-primary">
                    {order.customerName ?? 'Guest'}
                  </Link>
                ) : (
                  order.customerName ?? 'Guest'
                )}
              </div>
              {order.customerEmail ? (
                <div className="mt-1 text-muted-foreground">
                  <a href={`mailto:${order.customerEmail}`} className="hover:underline text-blue-600">
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
                          {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurredAt))}
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
