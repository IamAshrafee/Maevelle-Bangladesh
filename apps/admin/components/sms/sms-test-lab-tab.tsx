'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, RefreshCw, Send } from 'lucide-react';
import type {
  SmsDiagnosticsDto,
  SmsMockScenario,
  SmsNotificationDetailDto,
  SmsPreviewDto,
  SmsTemplateDto,
} from './sms-types';
import { formatBangladeshPhone, smsEventLabel } from './sms-types';
import { SmsMessagePreview } from './sms-message-preview';
import { SmsStatusBadge } from './sms-status-badge';
import { fetchSmsApi } from './sms-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

const scenarios: readonly { key: SmsMockScenario; label: string; explanation: string }[] = [
  {
    key: 'ACCEPTED',
    label: 'Accepted',
    explanation: 'Provider accepts the SMS; delivery remains unconfirmed.',
  },
  {
    key: 'DELIVERED',
    label: 'Delivered',
    explanation: 'Accepted, then confirmed delivered through normalized provider status.',
  },
  {
    key: 'DELAYED',
    label: 'Delayed',
    explanation: 'Accepted, then reported as still attempting delivery.',
  },
  {
    key: 'TRANSIENT_FAILURE',
    label: 'Temporary Failure',
    explanation: 'Creates a retryable attempt with a scheduled retry.',
  },
  {
    key: 'PERMANENT_FAILURE',
    label: 'Permanent Failure',
    explanation: 'Fails without an automatic retry.',
  },
  {
    key: 'RATE_LIMITED',
    label: 'Rate Limited',
    explanation: 'Schedules a bounded retry using normal worker rules.',
  },
  {
    key: 'UNKNOWN_OUTCOME',
    label: 'Unknown Outcome',
    explanation: 'Blocks unsafe retry/resend while reconciliation is required.',
  },
  {
    key: 'UNDELIVERABLE',
    label: 'Undeliverable',
    explanation: 'Accepted, then receives an undeliverable provider event.',
  },
];

export function SmsTestLabTab({
  diagnostics,
  templates,
  onInspect,
  onRefresh,
}: {
  readonly diagnostics: SmsDiagnosticsDto | undefined;
  readonly templates: readonly SmsTemplateDto[];
  readonly onInspect: (id: string) => void;
  readonly onRefresh: () => Promise<void>;
}) {
  const [orderId, setOrderId] = useState('');
  const [event, setEvent] = useState(templates[0]?.event ?? 'ORDER_CONFIRMED');
  const [recipient, setRecipient] = useState(diagnostics?.allowedTestRecipients[0] ?? '');
  const [scenario, setScenario] = useState<SmsMockScenario>('DELIVERED');
  const [reason, setReason] = useState('Controlled mock SMS lifecycle test');
  const [preview, setPreview] = useState<SmsPreviewDto>();
  const [result, setResult] = useState<SmsNotificationDetailDto>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = diagnostics?.mode === 'MOCK' && diagnostics.environment !== 'production';

  const previewOrder = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await fetchSmsApi<SmsPreviewDto>(`/admin/sms/templates/${event}/preview`, {
          method: 'POST',
          body: JSON.stringify({ orderId: orderId.trim() }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview failed.');
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      const detail = await fetchSmsApi<SmsNotificationDetailDto>('/admin/sms/test-lab', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderId.trim(),
          notificationType: event,
          testRecipient: recipient,
          scenario,
          reason,
          idempotencyKey: `sms-lab-${crypto.randomUUID()}`,
        }),
      });
      setResult(detail);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mock lifecycle test failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${available ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100' : 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`}
      >
        {available ? (
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
        ) : (
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
        )}
        <div>
          <p className="font-semibold">
            {available ? 'Mock Provider Lab Ready' : 'Mock Provider Lab Unavailable'}
          </p>
          <p className="mt-1 text-xs">
            {available
              ? 'Scenarios create authentic notification, attempt, timeline, provider-event, and audit records without contacting a telecom network.'
              : 'Set SMS_PROVIDER=mock, SMS_ENABLED=true, and SMS_TEST_MODE=true in a non-production environment. Test recipients must also be allow-listed.'}
          </p>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical aria-hidden="true" className="size-5" />
              Controlled Test
            </CardTitle>
            <CardDescription>
              Uses a real order snapshot and approved template. Arbitrary production text and
              recipients are not supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sms-lab-order">Order Number or UUID</Label>
              <div className="flex gap-2">
                <Input
                  id="sms-lab-order"
                  name="sms-lab-order"
                  autoComplete="off"
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value)}
                  placeholder="MV… or order UUID…"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!orderId.trim() || busy}
                  onClick={() => void previewOrder()}
                >
                  Preview
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sms-lab-template">Template</Label>
              <NativeSelect
                id="sms-lab-template"
                value={event}
                onChange={(change) => {
                  setEvent(change.target.value);
                  setPreview(undefined);
                }}
              >
                {templates.map((template) => (
                  <NativeSelectOption key={template.event} value={template.event}>
                    {smsEventLabel(template.event)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sms-lab-recipient">Allow-Listed Test Recipient</Label>
              <NativeSelect
                id="sms-lab-recipient"
                value={recipient}
                onChange={(change) => setRecipient(change.target.value)}
              >
                <NativeSelectOption value="">Choose recipient…</NativeSelectOption>
                {diagnostics?.allowedTestRecipients.map((phone) => (
                  <NativeSelectOption key={phone} value={phone}>
                    {formatBangladeshPhone(phone)} · {phone}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {diagnostics?.allowedTestRecipients.length ? null : (
                <p className="text-xs text-amber-700">
                  No test recipient is configured in SMS_ALLOWED_TEST_RECIPIENTS.
                </p>
              )}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Mock Outcome</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {scenarios.map((item) => (
                  <label
                    key={item.key}
                    className={`flex cursor-pointer gap-2 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring ${scenario === item.key ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <input
                      type="radio"
                      name="sms-mock-scenario"
                      value={item.key}
                      checked={scenario === item.key}
                      onChange={() => setScenario(item.key)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-[11px] leading-relaxed text-muted-foreground">
                        {item.explanation}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="sms-lab-reason">Audit Reason</Label>
              <Textarea
                id="sms-lab-reason"
                name="sms-lab-reason"
                autoComplete="off"
                value={reason}
                onChange={(change) => setReason(change.target.value)}
                placeholder="Explain the controlled test…"
              />
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <Button
              className="w-full"
              disabled={
                !available || !orderId.trim() || !recipient || reason.trim().length < 3 || busy
              }
              onClick={() => void run()}
            >
              {busy ? (
                <RefreshCw
                  aria-hidden="true"
                  className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Send aria-hidden="true" className="mr-2 size-4" />
              )}
              Run Mock Lifecycle
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-6">
          {preview ? (
            <Card>
              <CardHeader>
                <CardTitle>Order Preview</CardTitle>
                <CardDescription>
                  <Badge variant="outline">PREVIEW ONLY</Badge> · Intended for{' '}
                  {formatBangladeshPhone(preview.intendedRecipient)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SmsMessagePreview text={preview.renderedText} analysis={preview} previewOnly />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Preview a real order before running a scenario.
              </CardContent>
            </Card>
          )}
          {result ? (
            <Card className="border-primary/40">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Latest Test Result</CardTitle>
                    <CardDescription>
                      Authentic persisted lifecycle for this controlled test.
                    </CardDescription>
                  </div>
                  <SmsStatusBadge status={result.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-muted/40 p-3 text-sm">
                  <p className="font-medium">{smsEventLabel(result.notification_type)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Intended {formatBangladeshPhone(result.intended_recipient)} · Actual{' '}
                    {formatBangladeshPhone(result.effective_recipient)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {result.recommendedAction.explanation}
                </p>
                <Button variant="outline" onClick={() => onInspect(result.id)}>
                  Inspect Full Timeline
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
