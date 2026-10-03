'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, ExternalLink, RefreshCw, RotateCw, Send } from 'lucide-react';
import type { SmsNotificationDetailDto } from './sms-types';
import {
  formatBangladeshPhone,
  formatSmsDate,
  isPendingSmsStatus,
  smsEventLabel,
} from './sms-types';
import { SmsStatusBadge } from './sms-status-badge';
import { fetchSmsApi } from './sms-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function SmsDetailSheet({
  notification,
  open,
  onOpenChange,
  onRefresh,
}: {
  readonly notification: SmsNotificationDetailDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRefresh: (id: string) => Promise<void>;
}) {
  const [action, setAction] = useState<'retry' | 'resend' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !notification || !isPendingSmsStatus(notification.status)) return;
    const timer = setInterval(() => void onRefresh(notification.id), 6000);
    return () => clearInterval(timer);
  }, [notification, onRefresh, open]);

  const submitAction = async () => {
    if (!notification || !action || reason.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'retry')
        await fetchSmsApi(`/admin/sms/operations/${notification.id}/retry`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      else
        await fetchSmsApi(`/admin/sms/operations/${notification.id}/resend`, {
          method: 'POST',
          body: JSON.stringify({ reason, idempotencyKey: `sms-resend-${crypto.randomUUID()}` }),
        });
      setAction(null);
      setReason('');
      await onRefresh(notification.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SMS action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto overscroll-contain sm:max-w-2xl!">
          <SheetHeader className="border-b pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>
                {notification ? smsEventLabel(notification.notification_type) : 'SMS Detail'}
              </SheetTitle>
              {notification ? <SmsStatusBadge status={notification.status} /> : null}
            </div>
            <SheetDescription>
              Current delivery truth, message snapshot, attempts, provider events, and operator
              audit.
            </SheetDescription>
          </SheetHeader>
          {notification ? (
            <div className="space-y-6 px-4 pb-8">
              {notification.status === 'UNKNOWN_PROVIDER_OUTCOME' ? (
                <div className="flex gap-3 rounded-xl border border-purple-300 bg-purple-50 p-4 text-sm text-purple-950 dark:bg-purple-950 dark:text-purple-100">
                  <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Delivery Status Uncertain</p>
                    <p className="mt-1 text-xs">
                      Maevelle cannot yet prove whether the provider accepted the request. Retry and
                      resend remain blocked to prevent a duplicate paid SMS.
                    </p>
                  </div>
                </div>
              ) : null}
              <section aria-labelledby="sms-summary-heading" className="space-y-3">
                <h3 id="sms-summary-heading" className="text-sm font-semibold">
                  Summary
                </h3>
                <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                  <Fact
                    label="Recipient"
                    value={formatBangladeshPhone(notification.intended_recipient)}
                    detail={notification.normalized_recipient ?? undefined}
                  />
                  <Fact
                    label="Effective Recipient"
                    value={formatBangladeshPhone(notification.effective_recipient)}
                    detail={
                      notification.trigger_type === 'TEST' &&
                      notification.effective_recipient !== notification.intended_recipient
                        ? 'Test override active'
                        : undefined
                    }
                  />
                  <Fact
                    label="Related Order"
                    value={notification.order_number ?? notification.source_id}
                    href={`/orders/${notification.source_id}`}
                  />
                  <Fact
                    label="Customer"
                    value={notification.customer_name ?? 'Customer'}
                    href={
                      notification.customer_id
                        ? `/customers/${notification.customer_id}`
                        : undefined
                    }
                  />
                  <Fact label="Trigger" value={notification.trigger_type.replaceAll('_', ' ')} />
                  <Fact
                    label="Provider"
                    value={notification.provider ?? 'Not assigned'}
                    detail={notification.provider_message_id ?? undefined}
                  />
                  <Fact
                    label="Template"
                    value={`${notification.template_key ?? 'Unknown'} v${notification.template_version ?? '—'}`}
                  />
                  {notification.parent_notification_id ? (
                    <Fact
                      label="Resent From"
                      value={`Original SMS (${notification.parent_notification_id.slice(0, 8)}…)`}
                      detail={notification.parent_notification_id}
                    />
                  ) : null}
                  <Fact label="Created" value={formatSmsDate(notification.created_at)} />
                </div>
              </section>
              <section aria-labelledby="sms-message-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 id="sms-message-heading" className="text-sm font-semibold">
                    Message Snapshot
                  </h3>
                  <Badge variant="outline">Immutable</Badge>
                </div>
                <div className="rounded-2xl border bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-xs">
                  {notification.rendered_body}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Fact
                    label="Encoding"
                    value={notification.encoding === 'GSM_7' ? 'GSM-7' : 'Unicode'}
                  />
                  <Fact label="Characters" value={String(notification.character_count)} />
                  <Fact label="Encoding Units" value={String(notification.encoding_unit_count)} />
                  <Fact
                    label="Estimated Segments"
                    value={String(notification.estimated_segments)}
                  />
                </div>
                {notification.provider_reported_segments || notification.provider_reported_cost ? (
                  <div className="rounded-lg border p-3 text-xs">
                    <p className="font-medium">Provider-reported billing facts</p>
                    <p className="mt-1 text-muted-foreground">
                      Segments: {notification.provider_reported_segments ?? 'Unavailable'} · Cost:{' '}
                      {notification.provider_reported_cost
                        ? `${notification.provider_reported_cost} ${notification.provider_cost_currency ?? ''}`
                        : 'Unavailable'}
                    </p>
                  </div>
                ) : null}
              </section>
              <section
                aria-labelledby="sms-recommendation-heading"
                className="rounded-xl border p-4"
              >
                <h3 id="sms-recommendation-heading" className="text-sm font-semibold">
                  Recommended Action
                </h3>
                <p className="mt-1 text-sm">{notification.recommendedAction.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {notification.recommendedAction.explanation}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {notification.availableActions.canRetry ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAction('retry');
                        setReason('Technical SMS retry after operator review');
                      }}
                    >
                      <RotateCw aria-hidden="true" className="mr-1.5 size-3.5" />
                      Retry Delivery
                    </Button>
                  ) : null}
                  {notification.availableActions.canResend ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAction('resend');
                        setReason('Customer requested another transactional SMS copy');
                      }}
                    >
                      <Send aria-hidden="true" className="mr-1.5 size-3.5" />
                      Send Another Copy
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => void onRefresh(notification.id)}>
                    <RefreshCw aria-hidden="true" className="mr-1.5 size-3.5" />
                    Refresh
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {notification.availableActions.canRetry
                    ? notification.availableActions.retryReason
                    : notification.availableActions.resendReason}
                </p>
              </section>
              <Timeline events={notification.timeline} />
              <Attempts attempts={notification.attempts} />
              <ProviderEvents events={notification.providerEvents} />
              <Audit events={notification.auditEvents} />
              {notification.relatedNotifications.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Related SMS for This Order</h3>
                  {notification.relatedNotifications.slice(0, 8).map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      onClick={() => void onRefresh(row.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {smsEventLabel(row.notification_type)}
                          {row.id === notification.parent_notification_id ? ' (Original Copy)' : ''}
                          {row.parent_notification_id === notification.id ? ' (Resent Copy)' : ''}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatSmsDate(row.created_at)} · {row.trigger_type}
                        </span>
                      </span>
                      <SmsStatusBadge status={row.status} compact />
                    </button>
                  ))}
                </section>
              ) : null}
            </div>
          ) : (
            <div className="p-8 text-sm text-muted-foreground">
              Select an SMS notification to inspect it.
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(value) => {
          if (!value) setAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === 'retry' ? 'Retry Technical Delivery?' : 'Send Another SMS Copy?'}
            </DialogTitle>
            <DialogDescription>
              {action === 'retry'
                ? 'This continues the same logical SMS after a confirmed failure.'
                : 'This creates a new audited notification and may incur another provider charge.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sms-action-reason">Audit Reason</Label>
            <Input
              id="sms-action-reason"
              name="sms-action-reason"
              autoComplete="off"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this action is needed…"
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submitAction()} disabled={busy || reason.trim().length < 3}>
              {busy ? (
                <RefreshCw
                  aria-hidden="true"
                  className="mr-1.5 size-4 animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {action === 'retry' ? 'Retry Delivery' : 'Send Another Copy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({
  label,
  value,
  detail,
  href,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string | undefined;
  readonly href?: string | undefined;
}) {
  const content = (
    <>
      <p className="break-words font-medium">{value}</p>
      {detail ? (
        <p className="break-all font-mono text-[10px] text-muted-foreground">{detail}</p>
      ) : null}
    </>
  );
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {href ? (
        <Link
          href={href}
          className="group inline-flex max-w-full items-center gap-1 text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {content}
          <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
        </Link>
      ) : (
        content
      )}
    </div>
  );
}

function Timeline({ events }: { readonly events: SmsNotificationDetailDto['timeline'] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Lifecycle Timeline</h3>
      <ol className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="grid grid-cols-[20px_1fr] gap-3">
            <div className="relative flex justify-center">
              <span className="mt-1.5 size-2 rounded-full bg-primary" />
              <span className="absolute top-4 bottom-[-18px] w-px bg-border last:hidden" />
            </div>
            <div className="pb-2">
              <p className="text-sm font-medium">{event.event_type.replaceAll('_', ' ')}</p>
              <p className="text-xs text-muted-foreground">
                {formatSmsDate(event.event_at)} · {event.source}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
function Attempts({ attempts }: { readonly attempts: SmsNotificationDetailDto['attempts'] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Delivery Attempts</h3>
      {attempts.length ? (
        <div className="space-y-2">
          {attempts.map((attempt) => (
            <div key={attempt.id} className="rounded-lg border p-3 text-xs">
              <div className="flex justify-between gap-3">
                <strong>Attempt {attempt.attempt_number}</strong>
                <Badge variant="outline">{attempt.status.replaceAll('_', ' ')}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                {attempt.provider} · {formatSmsDate(attempt.started_at)}
              </p>
              {attempt.error_code ? (
                <p className="mt-2 text-destructive">
                  {attempt.error_code}
                  {attempt.next_retry_at
                    ? ` · Next retry ${formatSmsDate(attempt.next_retry_at)}`
                    : ''}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyLine text="No provider attempt has occurred." />
      )}
    </section>
  );
}
function ProviderEvents({
  events,
}: {
  readonly events: SmsNotificationDetailDto['providerEvents'];
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Provider Events</h3>
      {events.length ? (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border p-3 text-xs">
              <div className="flex justify-between gap-3">
                <strong>{event.normalized_status.replaceAll('_', ' ')}</strong>
                <span className="text-muted-foreground">
                  {event.processing_result ?? 'Received'}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Provider time: {formatSmsDate(event.provider_occurred_at)} · Received:{' '}
                {formatSmsDate(event.received_at)}
              </p>
              <p className="mt-1 break-all font-mono text-[10px]">{event.provider_event_id}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyLine text="No provider callback or polling event has been recorded." />
      )}
    </section>
  );
}
function Audit({ events }: { readonly events: SmsNotificationDetailDto['auditEvents'] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Operator Audit</h3>
      {events.length ? (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border p-3 text-xs">
              <p className="font-medium">
                {event.action.replaceAll('.', ' › ').replaceAll('_', ' ')}
              </p>
              <p className="mt-1 text-muted-foreground">
                {event.actor_name ?? 'System'} · {formatSmsDate(event.created_at)}
              </p>
              {event.reason ? <p className="mt-1">{event.reason}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyLine text="No manual operator action has been recorded for this notification." />
      )}
    </section>
  );
}
function EmptyLine({ text }: { readonly text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
      <Clock3 aria-hidden="true" className="size-4" />
      {text}
    </div>
  );
}
