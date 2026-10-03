'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquareText, RefreshCw, Send } from 'lucide-react';
import type { OrderSmsEligibilityDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchSmsApi, smsStatusTone } from '@/components/sms/sms-api';

export function OrderSmsStatus({ orderId }: { readonly orderId: string }) {
  const [data, setData] = useState<OrderSmsEligibilityDto>();
  const [reason, setReason] = useState('Transactional SMS requested from order detail');
  const [busyType, setBusyType] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    try { setData(await fetchSmsApi<OrderSmsEligibilityDto>(`/admin/sms/orders/${orderId}/eligibility`)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'SMS status could not be loaded.'); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  const send = async (notificationType: string) => {
    setBusyType(notificationType); setMessage(undefined);
    try {
      await fetchSmsApi(`/admin/sms/orders/${orderId}/send`, { method: 'POST', body: JSON.stringify({ notificationType, reason, idempotencyKey: `order-sms-${crypto.randomUUID()}` }) });
      setMessage('SMS queued successfully.'); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'SMS could not be queued.'); }
    finally { setBusyType(undefined); }
  };

  return <Card>
    <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><MessageSquareText className="size-5" />SMS notifications</CardTitle><CardDescription>Uses the immutable order contact phone snapshot. Provider acceptance is not customer delivery.</CardDescription></div><Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw className="size-4" /><span className="sr-only">Refresh SMS status</span></Button></div></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-2 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Order phone snapshot</p><p className="font-mono">{data?.customerPhone || 'Missing'}</p></div><div><p className="text-xs text-muted-foreground">Normalized recipient</p><p className="font-mono">{data?.normalizedPhone || 'Unavailable'}</p></div><div><p className="text-xs text-muted-foreground">Provider</p><p>{data?.providerConfigured ? 'Configured' : 'Not configured'}</p></div></div>
      <div className="space-y-1.5"><Label htmlFor="order-sms-reason">Reason for manual send</Label><Input id="order-sms-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
      <div className="divide-y rounded-lg border">{data?.events.map((event) => <div key={event.notificationType} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{event.notificationType.replaceAll('_',' ')}</p><p className="text-xs text-muted-foreground">{explain(event.eligibilityCode)}</p></div><div className="flex items-center gap-2"><Badge className={smsStatusTone(event.latestNotification?.status ?? event.eligibilityCode)}>{(event.latestNotification?.status ?? event.eligibilityCode).replaceAll('_',' ')}</Badge>{event.canSendManually ? <Button size="sm" onClick={() => void send(event.notificationType)} disabled={busyType === event.notificationType || reason.length < 3}><Send className="mr-1.5 size-3.5" />Send SMS</Button> : null}</div></div>)}</div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </CardContent>
  </Card>;
}

function explain(code: string) {
  const explanations: Record<string, string> = {
    ELIGIBLE: 'Ready for an intentional manual transactional send.', NO_PHONE: 'Customer phone was missing from the order snapshot.',
    INVALID_PHONE: 'Order snapshot is not a valid Bangladesh mobile number.', SMS_GLOBALLY_DISABLED: 'Global SMS sending is disabled.',
    PROVIDER_NOT_CONFIGURED: 'No SMS provider is configured.', RECIPIENT_SUPPRESSED: 'Recipient is actively suppressed.',
    EVENT_POLICY_DISABLED: 'This event is disabled by SMS policy.', WAITING_FOR_ORDER_STATE: 'Order has not reached the authoritative event state.',
    ACCEPTED: 'Accepted by provider; awaiting a delivery report.', DELIVERED: 'Provider confirmed delivery.', FAILED: 'Technical or provider failure; review activity for retry details.',
    PENDING_MANUAL: 'Automatic sending is disabled; manual send may be available.',
  };
  return explanations[code] ?? code.replaceAll('_',' ').toLowerCase();
}
