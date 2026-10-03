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

import type { OrderDetailDto, OrderSmsEligibilityDto } from '@maevelle/contracts';

import { CancelOrderDialog } from './cancel-order-dialog';
import { CreateFulfillmentDialog } from './create-fulfillment-dialog';
import { HoldOrderDialog } from './hold-order-dialog';
import { CancelOrderLineDialog } from './cancel-order-line-dialog';
import { AddOrderNoteDialog } from './add-order-note-dialog';
import { CorrectDeliveryAddressDialog } from './correct-delivery-address-dialog';
import { CompleteOrderDialog } from './complete-order-dialog';
import { CorrectCustomerContactDialog } from './correct-customer-contact-dialog';
import { ManageOrderTagsDialog } from './manage-order-tags-dialog';
import { OrderEmailStatus } from './order-email-status';
import { OrderSmsStatus } from './order-sms-status';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
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

interface DeliveryRiskHistory {
  eligibleDeliveries: number;
  deliveredCount: number;
  failedDeliveryCount: number;
  rtoCount: number;
  successRate: number | null;
  rtoRate: number | null;
  risk: {
    level: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED';
    reasons: readonly { code: string; explanation: string }[];
  };
}

export function OrderDetailConsole({ orderId }: { readonly orderId: string }) {
  const [order, setOrder] = useState<OrderDetailDto>();
  const [deliveryRisk, setDeliveryRisk] = useState<DeliveryRiskHistory>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [transitionFeedback, setTransitionFeedback] = useState<{
    orderMessage: string;
    smsEffect: string;
    tone: 'success' | 'warning' | 'info';
  } | null>(null);

  async function confirmOrder() {
    try {
      await fetchApiData(`/admin/orders/${order!.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ version: order!.version, status: 'CONFIRMED' }),
      });

      let smsEffect = 'SMS effect checked';
      let tone: 'success' | 'warning' | 'info' = 'success';
      try {
        const smsEligibility = await fetchApiData<OrderSmsEligibilityDto>(
          `/admin/sms/orders/${order!.id}/eligibility`,
        );
        const confirmedEvent = smsEligibility.events.find(
          (e) => e.notificationType === 'ORDER_CONFIRMED',
        );
        if (confirmedEvent?.latestNotification?.status === 'QUEUED') {
          smsEffect = 'SMS Queued';
          tone = 'success';
        } else if (!smsEligibility.providerConfigured) {
          smsEffect = 'SMS Not sent — production provider not configured';
          tone = 'info';
        } else if (!smsEligibility.globalSmsEnabled) {
          smsEffect = 'SMS Automatic sending disabled';
          tone = 'warning';
        } else if (smsEligibility.phoneValidation === 'MISSING') {
          smsEffect = 'SMS Customer phone missing';
          tone = 'warning';
        } else if (smsEligibility.phoneValidation === 'INVALID') {
          smsEffect = 'SMS Customer phone number is invalid';
          tone = 'warning';
        } else if (smsEligibility.isSuppressed) {
          smsEffect = 'SMS Recipient is suppressed';
          tone = 'warning';
        } else if (!confirmedEvent?.policy.automaticEnabled) {
          smsEffect = 'SMS Automatic sending disabled for Order Confirmed policy';
          tone = 'info';
        } else {
          smsEffect = `SMS ${confirmedEvent?.eligibilityCode.replaceAll('_', ' ').toLowerCase() ?? 'checked'}`;
        }
      } catch {
        smsEffect = 'SMS state can be inspected in the Customer Communications section below';
      }

      setTransitionFeedback({
        orderMessage: 'Order confirmed successfully',
        smsEffect,
        tone,
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
      const [data, risk] = await Promise.all([
        fetchApiData<OrderDetailDto>(`/admin/orders/${orderId}`),
        fetchApiData<DeliveryRiskHistory>(`/admin/orders/${orderId}/customer-delivery-history`).catch(
          () => undefined,
        ),
      ]);
      setOrder(data);
      setDeliveryRisk(risk);
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
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {order.tags?.map((t) => (
                <Badge
                  key={t.id}
                  variant="outline"
                  className="px-2 py-0.5 text-xs font-normal"
                  style={{
                    borderColor: t.color ? `${t.color}80` : undefined,
                    backgroundColor: t.color ? `${t.color}15` : undefined,
                    color: t.color || undefined,
                  }}
                >
                  <span
                    className="mr-1 inline-block size-1.5 rounded-full"
                    style={{ backgroundColor: t.color ?? '#6b7280' }}
                  />
                  {t.label ?? t.name}
                </Badge>
              ))}
              <ManageOrderTagsDialog order={order} onCompleted={() => void load()} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Refresh
            </Button>
            {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
              <CompleteOrderDialog
                orderId={order.id}
                orderNumber={order.orderNumber}
                onCompleted={() => void load()}
              />
            )}
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

      {transitionFeedback ? (
        <div
          role="status"
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
            transitionFeedback.tone === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100'
              : transitionFeedback.tone === 'info'
                ? 'border-blue-300 bg-blue-50 text-blue-950 dark:bg-blue-950 dark:text-blue-100'
                : 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-semibold">{transitionFeedback.orderMessage}</p>
              <p className="mt-0.5 text-xs">
                <span className="font-medium text-foreground">Separate SMS outcome:</span>{' '}
                {transitionFeedback.smsEffect}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTransitionFeedback(null)}
            className="text-xs self-end sm:self-auto"
          >
            Dismiss
          </Button>
        </div>
      ) : null}

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
                    <div key={fulfillment.id} className="relative rounded-lg border p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{fulfillment.fulfillmentNumber}</p>
                          <StatusBadge status={fulfillment.status} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {fulfillment.dispatchedAt
                            ? `Dispatched: ${formatDate(fulfillment.dispatchedAt)}`
                            : 'Pending Dispatch'}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t flex justify-end">
                        <Link
                          href={`/fulfillments?q=${encodeURIComponent(fulfillment.fulfillmentNumber)}`}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          Manage fulfillment →
                        </Link>
                      </div>
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
                    <div key={delivery.id} className="relative rounded-lg border p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{delivery.deliveryNumber}</p>
                          <StatusBadge status={delivery.status} />
                        </div>
                        {delivery.trackingNumber && (
                          <p className="mt-2 text-sm font-mono text-primary truncate">
                            Tracking: {delivery.trackingNumber}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 pt-2 border-t flex justify-end">
                        <Link
                          href={`/deliveries?q=${encodeURIComponent(delivery.deliveryNumber)}`}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          Manage delivery →
                        </Link>
                      </div>
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
                    <div key={rc.id} className="relative rounded-lg border p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{rc.caseNumber}</p>
                          <StatusBadge status={rc.status} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {rc.returnType} • {formatDate(rc.createdAt)}
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t flex justify-end">
                        <Link
                          href={`/returns?selected=${encodeURIComponent(rc.id)}`}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          View return case →
                        </Link>
                      </div>
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
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-medium text-foreground">Customer</h2>
              <CorrectCustomerContactDialog order={order} onCompleted={() => void load()} />
            </div>
            <div className="space-y-3 px-6 py-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
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
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <div className="font-medium text-foreground">
                  {order.customerPhone ? (
                    <a href={`tel:${order.customerPhone}`} className="hover:underline">
                      {order.customerPhone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground italic">None recorded</span>
                  )}
                </div>
              </div>
              {order.customerEmail ? (
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <div className="text-muted-foreground">
                    <a
                      href={`mailto:${order.customerEmail}`}
                      className="hover:underline text-blue-600"
                    >
                      {order.customerEmail}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {deliveryRisk ? (
            <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer delivery risk">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 className="text-lg font-medium text-foreground">Delivery risk / history</h2>
                <StatusBadge status={deliveryRisk.risk.level} />
              </div>
              <div className="space-y-3 px-6 py-4 text-sm">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Delivered</span>
                    <p className="font-semibold text-foreground text-sm">{deliveryRisk.deliveredCount}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RTO</span>
                    <p className="font-semibold text-rose-600 text-sm">{deliveryRisk.rtoCount}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Success rate</span>
                    <p className="font-medium text-foreground">{deliveryRisk.successRate ?? '—'}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RTO rate</span>
                    <p className="font-medium text-foreground">{deliveryRisk.rtoRate ?? '—'}%</p>
                  </div>
                </div>
                {deliveryRisk.risk.reasons[0] ? (
                  <p className="text-xs text-muted-foreground border-t pt-2">
                    {deliveryRisk.risk.reasons[0].explanation}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <OrderEmailStatus orderId={order.id} hasEmail={Boolean(order.customerEmail)} />
          <OrderSmsStatus orderId={order.id} />

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
