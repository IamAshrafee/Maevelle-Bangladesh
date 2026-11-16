'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, MessageSquare } from 'lucide-react';

import type { OrderDetailDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdminPage, ErrorState, PageHeader, PageSkeleton } from '@/components/ui/page-shell';
import { DetailWorkspace } from '@/components/workspaces/detail-workspace';
import { fetchApiData } from '@/lib/api';

import { AddOrderNoteDialog } from './add-order-note-dialog';
import { ManageOrderTagsDialog } from './manage-order-tags-dialog';
import { OrderCustomerAddressCard } from './order-customer-address-card';
import { OrderEmailStatus } from './order-email-status';
import { OrderFulfillmentDeliveryCard } from './order-fulfillment-delivery-card';
import { OrderHeaderActions } from './order-header-actions';
import { OrderItemsCard } from './order-items-card';
import { OrderPaymentCard } from './order-payment-card';
import { OrderPrintableInvoice } from './order-printable-invoice';
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
    return <PageSkeleton variant="detail" widthVariant="wide" />;
  }

  if (state === 'error' || !order) {
    return (
      <AdminPage variant="wide">
        <ErrorState
          title="Could not load order"
          message={message || 'Order was not found.'}
          onRetry={() => void load()}
        />
      </AdminPage>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <DetailWorkspace
          widthVariant="wide"
          header={
            <PageHeader
              breadcrumbs={[
                { label: 'Orders', href: '/orders' },
                { label: order.orderNumber, current: true },
              ]}
              title={`Order ${order.orderNumber}`}
              badge={
                <>
                  <StatusBadge status={order.status} />
                  <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {order.salesChannel.replaceAll('_', ' ')}
                  </span>
                </>
              }
              description={`Placed on ${formatDateTime(order.createdAt)} · Source: ${order.source.replaceAll('_', ' ')}`}
              actions={
                <OrderHeaderActions
                  order={order}
                  onRefresh={() => void load()}
                  onConfirmed={(feedback) => {
                    if (feedback) setTransitionFeedback(feedback);
                    void load();
                  }}
                />
              }
            >
              <div className="pt-1.5 flex flex-wrap items-center gap-1.5">
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
            </PageHeader>
          }
          kpiStrip={
            <>
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
              <OrderSummaryStrip order={order} />
            </>
          }
          primary={
            <>
              <OrderItemsCard order={order} onUpdated={() => void load()} />
              <OrderPaymentCard order={order} />
              <OrderFulfillmentDeliveryCard order={order} onUpdated={() => void load()} />
              <OrderReturnsRefundsCard order={order} />
              <OrderReviewStatusCard orderId={order.id} />
              <OrderTimelineCard timeline={order.timeline} />
            </>
          }
          rail={
            <>
              <OrderRiskCard
                orderId={order.id}
                orderNumber={order.orderNumber}
                customerPhone={order.customerPhone}
                onVerificationRecorded={() => void load()}
              />
              <OrderVerificationsCard
                orderId={order.id}
                orderNumber={order.orderNumber}
                customerPhone={order.customerPhone}
                verifications={order.verifications}
                canRecordVerification={order.capabilities.canRecordVerification}
                onUpdated={() => void load()}
              />
              <OrderCustomerAddressCard order={order} onUpdated={() => void load()} />
              <OrderEmailStatus orderId={order.id} hasEmail={Boolean(order.customerEmail)} />
              <OrderSmsStatus orderId={order.id} />
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
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-info/15 text-info'
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
            </>
          }
        />
      </div>
      <OrderPrintableInvoice order={order} />
    </>
  );
}
