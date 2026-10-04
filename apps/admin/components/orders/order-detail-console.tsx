'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  MessageSquare,
  Package,
  RefreshCw,
  Share2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

import type { OrderDetailDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { fetchApiData } from '@/lib/api';

import { AddOrderNoteDialog } from './add-order-note-dialog';
import { ManageOrderTagsDialog } from './manage-order-tags-dialog';
import { OrderCustomerAddressCard } from './order-customer-address-card';
import { OrderEmailStatus } from './order-email-status';
import { OrderFulfillmentDeliveryCard } from './order-fulfillment-delivery-card';
import { OrderHeaderActions } from './order-header-actions';
import { OrderItemsCard } from './order-items-card';
import { OrderPaymentCard } from './order-payment-card';
import { OrderReturnsRefundsCard } from './order-returns-refunds-card';
import { OrderReviewStatusCard } from './order-review-status-card';
import { OrderRiskCard } from './order-risk-card';
import { OrderSmsStatus } from './order-sms-status';
import { OrderSummaryStrip } from './order-summary-strip';
import { OrderTimelineCard } from './order-timeline-card';
import { OrderVerificationsCard } from './order-verifications-card';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function OrderDetailConsole({ orderId }: { readonly orderId: string }) {
  const [order, setOrder] = useState<OrderDetailDto>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [transitionFeedback, setTransitionFeedback] = useState<{
    orderMessage: string;
    smsEffect: string;
    tone: 'success' | 'warning' | 'info';
  } | null>(null);

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
      <main className="px-4 py-12 sm:px-6 lg:px-8 text-sm text-muted-foreground flex items-center justify-center min-h-[300px]">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-4 animate-spin text-primary" />
          <span>Loading operational order command center…</span>
        </div>
      </main>
    );
  }

  if (state === 'error' || !order) {
    return (
      <main className="px-4 py-12 sm:px-6 lg:px-8 text-sm text-destructive flex flex-col items-center justify-center min-h-[300px] gap-3">
        <div className="flex items-center gap-2">
          <XCircle className="size-5" />
          <span className="font-medium">{message || 'Order was not found.'}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </main>
    );
  }

  return (
    <main className="min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      {/* Top Header */}
      <header className="flex flex-col gap-4 border-b pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Breadcrumb
              items={[
                { label: 'Orders', href: '/orders' },
                { label: order.orderNumber, current: true },
              ]}
              className="mb-2 text-xs"
            />
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Order {order.orderNumber}
              </h1>
              <StatusBadge status={order.status} />
              <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {order.salesChannel.replaceAll('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Placed on {formatDateTime(order.createdAt)} · Source: {order.source.replaceAll('_', ' ')}
            </p>

            {/* Tags & Tag Manager */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
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

          {/* Action Buttons */}
          <OrderHeaderActions
            order={order}
            onRefresh={() => void load()}
            onConfirmed={(feedback) => {
              if (feedback) setTransitionFeedback(feedback);
              void load();
            }}
          />
        </div>
      </header>

      {/* Transition Feedback Banner */}
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
                <span className="font-medium text-foreground">Notification status:</span>{' '}
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

      {/* Summary Strip (4 Key Dimensions) */}
      <OrderSummaryStrip order={order} />

      {/* Main 2-Column Command Center Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Column (Left - 2 Cols) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Items & Snapshots */}
          <OrderItemsCard order={order} onUpdated={() => void load()} />

          {/* Payment & Financial Breakdown */}
          <OrderPaymentCard order={order} />

          {/* Fulfillment & Shipments */}
          <OrderFulfillmentDeliveryCard order={order} onUpdated={() => void load()} />

          {/* Customer Returns & Refunds */}
          <OrderReturnsRefundsCard order={order} />

          {/* Customer Reviews State */}
          <OrderReviewStatusCard orderId={order.id} />

          {/* Unified Business Timeline */}
          <OrderTimelineCard timeline={order.timeline} />
        </div>

        {/* Context Column (Right - 1 Col) */}
        <div className="space-y-6">
          {/* Delivery Intelligence & Fraud Risk */}
          <OrderRiskCard
            orderId={order.id}
            orderNumber={order.orderNumber}
            customerPhone={order.customerPhone}
            onVerificationRecorded={() => void load()}
          />

          {/* Customer Verification History & Recording */}
          <OrderVerificationsCard
            orderId={order.id}
            orderNumber={order.orderNumber}
            customerPhone={order.customerPhone}
            verifications={order.verifications}
            canRecordVerification={order.capabilities.canRecordVerification}
            onUpdated={() => void load()}
          />

          {/* Customer Contact & Delivery Address */}
          <OrderCustomerAddressCard order={order} onUpdated={() => void load()} />

          {/* Customer Communications (SMS & Email Status) */}
          <OrderEmailStatus orderId={order.id} hasEmail={Boolean(order.customerEmail)} />
          <OrderSmsStatus orderId={order.id} />

          {/* Operational Notes */}
          <section className="rounded-xl border bg-card shadow-sm" aria-label="Order Notes">
            <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-base font-semibold text-foreground">Operational Notes</h2>
              </div>
              <AddOrderNoteDialog orderId={order.id} onCompleted={() => void load()} />
            </div>
            <div className="px-6 py-4">
              {order.notes.length ? (
                <ul className="space-y-4">
                  {order.notes.map((note) => (
                    <li key={note.id} className="text-sm border-b pb-3 last:border-0 last:pb-0">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            note.noteType === 'INTERNAL'
                              ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          }`}
                        >
                          {note.noteType === 'INTERNAL' ? 'Internal Staff' : 'Customer Visible'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDateTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-foreground text-xs leading-relaxed">
                        {note.body}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs italic text-muted-foreground">No notes recorded.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
