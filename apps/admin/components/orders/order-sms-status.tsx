'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  MessageSquareText,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import type {
  OrderSmsEligibilityDto,
  SmsNotificationDetailDto,
  SmsPreviewDto,
} from '@/components/sms/sms-types';
import {
  formatBangladeshPhone,
  isPendingSmsStatus,
  smsEventLabel,
} from '@/components/sms/sms-types';
import { fetchSmsApi } from '@/components/sms/sms-api';
import { SmsDetailSheet } from '@/components/sms/sms-detail-sheet';
import { SmsMessagePreview } from '@/components/sms/sms-message-preview';
import { SmsStatusBadge } from '@/components/sms/sms-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type SmsOrderEvent = OrderSmsEligibilityDto['events'][number];

export function OrderSmsStatus({ orderId }: { readonly orderId: string }) {
  const [data, setData] = useState<OrderSmsEligibilityDto>();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewEvent, setPreviewEvent] = useState<SmsOrderEvent>();
  const [preview, setPreview] = useState<SmsPreviewDto>();
  const [sendEvent, setSendEvent] = useState<SmsOrderEvent>();
  const [reason, setReason] = useState('Customer requested this transactional SMS');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<SmsNotificationDetailDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await fetchSmsApi<OrderSmsEligibilityDto>(`/admin/sms/orders/${orderId}/eligibility`),
      );
      setMessage('');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'SMS status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (
      !data?.events.some(
        (event) => event.latestNotification && isPendingSmsStatus(event.latestNotification.status),
      )
    )
      return;
    const timer = setInterval(() => void load(), 7000);
    return () => clearInterval(timer);
  }, [data, load]);

  const renderPreview = async (event: SmsOrderEvent, forSend = false) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await fetchSmsApi<SmsPreviewDto>(
        `/admin/sms/templates/${event.notificationType}/preview`,
        { method: 'POST', body: JSON.stringify({ orderId }) },
      );
      setPreview(result);
      if (forSend) setSendEvent(event);
      else setPreviewEvent(event);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'SMS preview could not be rendered.');
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!sendEvent) return;
    setBusy(true);
    setMessage('');
    try {
      await fetchSmsApi(`/admin/sms/orders/${orderId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          notificationType: sendEvent.notificationType,
          reason,
          idempotencyKey: `order-sms-${crypto.randomUUID()}`,
        }),
      });
      setMessage('Order action remains successful. The SMS was queued separately for delivery.');
      setSendEvent(undefined);
      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'The SMS could not be queued. The order itself was not changed.',
      );
    } finally {
      setBusy(false);
    }
  };
  const inspect = async (id: string) => {
    try {
      setDetail(await fetchSmsApi<SmsNotificationDetailDto>(`/admin/sms/operations/${id}`));
      setDetailOpen(true);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'SMS detail could not be loaded.');
    }
  };
  const refreshDetail = useCallback(
    async (id: string) => {
      setDetail(await fetchSmsApi<SmsNotificationDetailDto>(`/admin/sms/operations/${id}`));
      await load();
    },
    [load],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquareText aria-hidden="true" className="size-5" />
                Customer Communications / SMS
              </CardTitle>
              <CardDescription>
                Uses the immutable order phone snapshot. SMS delivery never changes the order’s
                business state.
              </CardDescription>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Refresh SMS status"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!data?.providerConfigured ? (
            <div className="flex items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950 dark:bg-blue-950 dark:text-blue-100">
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Maevelle SMS Is Ready; Production Provider Not Connected
                </p>
                <p className="mt-1 text-xs">
                  Order processing continues normally. No real customer SMS is sent until a provider
                  is configured.
                </p>
              </div>
            </div>
          ) : null}
          {data?.recipientOverride ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              <div>
                <strong>TEST RECIPIENT OVERRIDE ACTIVE</strong>
                <p className="mt-1">
                  Intended: {formatBangladeshPhone(data.customerPhone)} · Actual:{' '}
                  {formatBangladeshPhone(data.recipientOverride)}
                </p>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <PhoneFact label="Order Phone" value={formatBangladeshPhone(data?.customerPhone)} />
            <PhoneFact label="Normalized" value={data?.normalizedPhone ?? 'Unavailable'} mono />
            <PhoneFact
              label="Validation"
              value={
                data?.phoneValidation === 'VALID'
                  ? 'Valid Bangladesh mobile'
                  : data?.phoneValidation === 'MISSING'
                    ? 'Missing'
                    : 'Invalid'
              }
            />
            <PhoneFact
              label="Suppression"
              value={
                data?.isSuppressed
                  ? `Blocked · ${data.suppressionReason?.replaceAll('_', ' ')}`
                  : 'None'
              }
            />
          </div>
          {message ? (
            <p aria-live="polite" className="rounded-lg border bg-muted/30 p-3 text-sm">
              {message}
            </p>
          ) : null}
          <div className="divide-y rounded-xl border">
            {data?.events.map((event) => (
              <div key={event.notificationType} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{smsEventLabel(event.notificationType)}</p>
                      {event.latestNotification ? (
                        <SmsStatusBadge status={event.latestNotification.status} />
                      ) : (
                        <Badge variant="outline">{eligibilityLabel(event.eligibilityCode)}</Badge>
                      )}
                      {!event.policy.automaticEnabled ? (
                        <Badge variant="secondary">Manual Only</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {eligibilityExplanation(event.eligibilityCode)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.permissions.canPreview ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void renderPreview(event)}
                      >
                        <Eye aria-hidden="true" className="mr-1.5 size-3.5" />
                        Preview
                      </Button>
                    ) : null}
                    {event.canSendManually ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void renderPreview(event, true)}
                      >
                        <Send aria-hidden="true" className="mr-1.5 size-3.5" />
                        Send SMS
                      </Button>
                    ) : null}
                    {event.latestNotification ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void inspect(event.latestNotification!.id)}
                      >
                        View Timeline
                      </Button>
                    ) : null}
                  </div>
                </div>
                <details className="mt-3 rounded-lg bg-muted/30 p-3 text-xs">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium focus-visible:ring-2 focus-visible:ring-ring">
                    Why was or wasn’t this SMS sent?
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  </summary>
                  <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                    {event.decisionSteps.map((step) => (
                      <li key={step.key} className="flex gap-2">
                        {step.passed ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-emerald-600"
                          />
                        ) : (
                          <XCircle
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-amber-600"
                          />
                        )}
                        <span>
                          <span className="font-medium">{step.label}</span>
                          <span className="mt-0.5 block text-muted-foreground">
                            {step.explanation}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(previewEvent)}
        onOpenChange={(open) => {
          if (!open) setPreviewEvent(undefined);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {previewEvent ? smsEventLabel(previewEvent.notificationType) : 'SMS'} Preview
            </DialogTitle>
            <DialogDescription>
              Rendered from the real order snapshot. No notification will be created.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <SmsMessagePreview text={preview.renderedText} analysis={preview} previewOnly />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewEvent(undefined)}>
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(sendEvent)}
        onOpenChange={(open) => {
          if (!open) setSendEvent(undefined);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Send {sendEvent ? smsEventLabel(sendEvent.notificationType) : 'Transactional'} SMS?
            </DialogTitle>
            <DialogDescription>
              This creates a real, audited customer notification. Provider charges may apply when
              production delivery is configured.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="space-y-4">
              <SmsMessagePreview text={preview.renderedText} analysis={preview} />
              <div className="grid gap-3 rounded-lg border p-3 text-xs sm:grid-cols-3">
                <PhoneFact
                  label="Recipient"
                  value={formatBangladeshPhone(preview.intendedRecipient)}
                />
                <PhoneFact
                  label="Template"
                  value={`${preview.templateKey} v${preview.templateVersion}`}
                />
                <PhoneFact label="Estimated Segments" value={String(preview.segmentCount)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-sms-send-reason">Audit Reason</Label>
                <Input
                  id="order-sms-send-reason"
                  name="order-sms-send-reason"
                  autoComplete="off"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this manual SMS needed…"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendEvent(undefined)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={busy || reason.trim().length < 3}>
              {busy ? (
                <RefreshCw
                  aria-hidden="true"
                  className="mr-1.5 size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Send aria-hidden="true" className="mr-1.5 size-4" />
              )}
              Confirm & Queue SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SmsDetailSheet
        notification={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={refreshDetail}
      />
    </>
  );
}

function PhoneFact({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
function eligibilityLabel(code: string) {
  return code === 'ELIGIBLE' ? 'Eligible' : code.replaceAll('_', ' ');
}
function eligibilityExplanation(code: string) {
  const values: Record<string, string> = {
    ELIGIBLE: 'Ready for an intentional manual transactional send.',
    NO_PHONE: 'The customer did not provide a phone number in this order snapshot.',
    INVALID_PHONE: 'The order snapshot is not a valid Bangladesh mobile number.',
    SMS_GLOBALLY_DISABLED: 'Global SMS sending is disabled; order processing is unaffected.',
    PROVIDER_NOT_CONFIGURED: 'The SMS platform is ready, but no production provider is connected.',
    RECIPIENT_SUPPRESSED: 'This recipient is actively blocked from transactional SMS.',
    EVENT_POLICY_DISABLED: 'The SMS policy for this event is disabled.',
    WAITING_FOR_ORDER_STATE: 'The order has not reached the authoritative event state.',
    PENDING_MANUAL: 'Automatic delivery is disabled; manual send may be available.',
    ACCEPTED: 'The provider accepted the SMS; delivery remains unconfirmed.',
    DELIVERED: 'The provider confirmed delivery.',
    FAILED: 'A confirmed technical failure occurred; inspect the timeline for a safe retry.',
    UNKNOWN_PROVIDER_OUTCOME: 'Provider acceptance is uncertain; unsafe resend is blocked.',
  };
  return values[code] ?? code.replaceAll('_', ' ').toLowerCase();
}
