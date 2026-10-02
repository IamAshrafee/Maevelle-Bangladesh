'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/status-badge';

type Diagnostic = {
  provider: string;
  environment: string;
  enabled: boolean;
  from: string;
  replyTo: string;
  providerConfigured: boolean;
  webhookConfigured: boolean;
  testRecipientOverride: string | null;
  queued: number;
  processing: number;
  failed: number;
  delivered: number;
  suppressed: number;
  last_webhook_at: string | null;
};
type Policy = {
  notification_type: string;
  delivery_requirement: string;
  template_key: string;
  enabled: boolean;
  automatic_enabled: boolean;
  manual_allowed: boolean;
};
type EmailRow = {
  id: string;
  notification_type: string;
  status: string;
  intended_recipient: string | null;
  effective_recipient: string | null;
  rendered_subject: string | null;
  source_id: string;
  provider: string | null;
  provider_message_id: string | null;
  trigger_type: string;
  created_at: string;
  skip_reason: string | null;
  failure_code: string | null;
};
type Template = { key: string; version: number; subject: string; description: string };
type Suppression = {
  id: string;
  normalized_email: string;
  reason: string;
  source: string;
  active: boolean;
  created_at: string;
};
type EmailDetail = EmailRow & {
  attempts: readonly { id: number; attempt_number: number; status: string; error_code: string | null; next_retry_at: string | null }[];
  timeline: readonly { id: number; event_type: string; event_at: string; source: string }[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => undefined)) as
    | T
    | { error?: { message?: string } }
    | undefined;
  if (!response.ok)
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && payload.error?.message
        ? payload.error.message
        : 'Email operation failed.',
    );
  return payload as T;
}

function when(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Never';
}

export function EmailOperationsConsole() {
  const [diagnostic, setDiagnostic] = useState<Diagnostic>();
  const [policies, setPolicies] = useState<readonly Policy[]>([]);
  const [emails, setEmails] = useState<readonly EmailRow[]>([]);
  const [templates, setTemplates] = useState<readonly Template[]>([]);
  const [suppressions, setSuppressions] = useState<readonly Suppression[]>([]);
  const [selected, setSelected] = useState<EmailRow>();
  const [detail, setDetail] = useState<EmailDetail>();
  const [orderId, setOrderId] = useState('');
  const [notificationType, setNotificationType] = useState('ORDER_CONFIRMED');
  const [testRecipient, setTestRecipient] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string }>();
  const [message, setMessage] = useState('Loading email operations…');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [d, p, e, t, s] = await Promise.all([
        api<{ data: Diagnostic }>('/admin/email/diagnostics'),
        api<{ data: Policy[] }>('/admin/email/policies'),
        api<{ data: EmailRow[] }>('/admin/email/operations?page=1&pageSize=50'),
        api<{ data: Template[] }>('/admin/email/templates'),
        api<{ data: Suppression[] }>('/admin/email/suppressions'),
      ]);
      setDiagnostic(d.data);
      setPolicies(p.data);
      setEmails(e.data);
      setTemplates(t.data);
      setSuppressions(s.data);
      setMessage('');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Email operations could not be loaded.');
      setMessage('');
    }
  }, []);

  useEffect(() => void reload(), [reload]);

  const changePolicy = async (item: Policy, field: 'enabled' | 'automatic_enabled' | 'manual_allowed', value: boolean) => {
    try {
      await api(`/admin/email/policies/${item.notification_type}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: field === 'enabled' ? value : item.enabled,
          automaticEnabled: field === 'automatic_enabled' ? value : item.automatic_enabled,
          manualAllowed: field === 'manual_allowed' ? value : item.manual_allowed,
          reason: 'Changed from Email Operations',
        }),
      });
      setMessage(`${item.notification_type.replaceAll('_', ' ')} policy updated.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Policy update failed.');
    }
  };

  const previewTemplate = async () => {
    try {
      const result = await api<{ data: { subject: string; html: string; text: string } }>(
        `/admin/email/templates/${notificationType}/preview`,
        { method: 'POST', body: JSON.stringify({ orderId }) },
      );
      setPreview(result.data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview failed.');
    }
  };

  const send = async (test = false) => {
    try {
      await api(`/admin/email/orders/${orderId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          notificationType,
          idempotencyKey: crypto.randomUUID(),
          reason: 'Manual send from Email Operations',
          ...(test ? { testRecipient: testRecipient.trim() } : {}),
        }),
      });
      setMessage('Transactional email queued. Delivery continues in the worker.');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Email could not be queued.');
    }
  };

  const inspect = async (item: EmailRow) => {
    setSelected(item);
    try {
      const result = await api<{ data: EmailDetail }>(`/admin/email/operations/${item.id}`);
      setDetail(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Email detail could not be loaded.');
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Email operations</h1>
          {diagnostic ? <Badge variant={diagnostic.enabled ? 'default' : 'secondary'}>{diagnostic.enabled ? 'Sending enabled' : 'Sending disabled'}</Badge> : null}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">Transactional delivery, policy controls, templates, provider lifecycle, retries and suppressions. Deployment secrets are never shown here.</p>
      </header>
      {message ? <p className="rounded-md border bg-muted/50 p-3 text-sm">{message}</p> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {diagnostic ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[['Queued', diagnostic.queued], ['Processing', diagnostic.processing], ['Failed', diagnostic.failed], ['Delivered', diagnostic.delivered], ['Suppressed', diagnostic.suppressed]].map(([label, value]) => (
            <Card key={String(label)}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{value}</CardTitle></CardHeader></Card>
          ))}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Provider diagnostics</CardTitle><CardDescription>Application, deployment and external provider facts are shown separately.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Provider</span><p className="font-medium capitalize">{diagnostic?.provider ?? '—'} · {diagnostic?.environment ?? '—'}</p></div>
            <div><span className="text-muted-foreground">Configuration</span><p>{diagnostic?.providerConfigured ? 'Provider configured' : 'Provider not configured'} · {diagnostic?.webhookConfigured ? 'Webhook configured' : 'Webhook not configured'}</p></div>
            <div><span className="text-muted-foreground">From</span><p>{diagnostic?.from ?? '—'}</p></div>
            <div><span className="text-muted-foreground">Reply-To</span><p>{diagnostic?.replyTo ?? '—'}</p></div>
            <div><span className="text-muted-foreground">Last webhook</span><p>{when(diagnostic?.last_webhook_at ?? null)}</p></div>
            <div><span className="text-muted-foreground">Test redirect</span><p>{diagnostic?.testRecipientOverride ?? 'None'}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Preview or send</CardTitle><CardDescription>Uses a real order snapshot and the same renderer as automatic delivery.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="email-order-id">Order ID</Label><Input id="email-order-id" value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="Paste an order ID" /></div>
            <div className="space-y-2"><Label htmlFor="email-template">Event</Label><select id="email-template" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={notificationType} onChange={(event) => setNotificationType(event.target.value)}>{policies.map((item) => <option key={item.notification_type} value={item.notification_type}>{item.notification_type.replaceAll('_', ' ')}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="email-test-recipient">Allow-listed test recipient</Label><Input id="email-test-recipient" type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="Development and staging only" /></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={previewTemplate} disabled={!orderId}>Preview</Button><Button onClick={() => void send(false)} disabled={!orderId}>Queue manual email</Button><Button variant="secondary" onClick={() => void send(true)} disabled={!orderId || !testRecipient.trim()}>Send safe test copy</Button></div>
          </CardContent>
        </Card>
      </section>

      {preview ? <Card><CardHeader><CardTitle>{preview.subject}</CardTitle><CardDescription>Preview only — no provider call was made.</CardDescription></CardHeader><CardContent><div className="max-h-[560px] overflow-auto rounded-md border bg-white p-2" dangerouslySetInnerHTML={{ __html: preview.html }} /><details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Plain-text fallback</summary><pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-4 text-xs">{preview.text}</pre></details></CardContent></Card> : null}

      <Card>
        <CardHeader><CardTitle>Automatic and manual policy</CardTitle><CardDescription>Disabling automatic delivery never blocks the underlying order transition.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {policies.map((item) => <div key={item.notification_type} className="rounded-lg border p-4"><div className="mb-4"><p className="font-medium">{item.notification_type.replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{item.template_key} · {item.delivery_requirement.replaceAll('_', ' ')}</p></div><div className="grid gap-3 text-sm sm:grid-cols-3">{([['enabled', 'Enabled'], ['automatic_enabled', 'Automatic'], ['manual_allowed', 'Manual']] as const).map(([field, label]) => <label key={field} className="flex items-center justify-between gap-2 sm:flex-col sm:items-start"><span>{label}</span><Switch checked={item[field]} onCheckedChange={(value) => void changePolicy(item, field, value)} /></label>)}</div></div>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent email lifecycle</CardTitle><CardDescription>Select a row to inspect provider identity and the intended/effective recipient distinction.</CardDescription></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="border-y bg-muted/50 text-left"><tr><th className="p-3">Created</th><th className="p-3">Event</th><th className="p-3">Recipient</th><th className="p-3">Status</th><th className="p-3">Trigger</th><th className="p-3">Provider ID</th></tr></thead><tbody>{emails.map((item) => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/40" onClick={() => void inspect(item)}><td className="p-3">{when(item.created_at)}</td><td className="p-3 font-medium">{item.notification_type.replaceAll('_', ' ')}</td><td className="p-3">{item.intended_recipient ?? item.skip_reason ?? 'No email'}</td><td className="p-3"><StatusBadge status={item.status} /></td><td className="p-3">{item.trigger_type}</td><td className="max-w-48 truncate p-3">{item.provider_message_id ?? '—'}</td></tr>)}</tbody></table></div>{emails.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No transactional emails yet.</p> : null}</CardContent>
      </Card>

      {selected ? <Card><CardHeader><CardTitle>{selected.rendered_subject ?? selected.notification_type}</CardTitle><CardDescription>Notification {selected.id}</CardDescription></CardHeader><CardContent className="grid gap-5 text-sm lg:grid-cols-[1fr_1.3fr]"><div className="grid content-start gap-3 sm:grid-cols-2"><div><span className="text-muted-foreground">Intended</span><p>{selected.intended_recipient ?? '—'}</p></div><div><span className="text-muted-foreground">Effective</span><p>{selected.effective_recipient ?? '—'}</p></div><div><span className="text-muted-foreground">Provider</span><p>{selected.provider ?? 'Not submitted'}</p></div><div><span className="text-muted-foreground">Failure</span><p>{selected.failure_code ?? 'None'}</p></div><div className="flex flex-wrap gap-2 sm:col-span-2">{selected.status === 'FAILED' ? <Button variant="outline" onClick={async () => { await api(`/admin/email/operations/${selected.id}/retry`, { method: 'POST', body: JSON.stringify({ reason: 'Retry from Email Operations' }) }); setMessage('Retry queued.'); await reload(); }}>Retry technical failure</Button> : null}{selected.intended_recipient ? <Button variant="outline" onClick={async () => { await api(`/admin/email/operations/${selected.id}/resend`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), reason: 'Intentional resend from Email Operations' }) }); setMessage('A new audited copy was queued.'); await reload(); }}>Send another copy</Button> : null}</div></div><div><h3 className="mb-3 font-medium">Delivery timeline</h3><ol className="space-y-3 border-l pl-4">{detail?.timeline.map((event) => <li key={event.id}><div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={event.event_type} /><span className="text-xs text-muted-foreground">{when(event.event_at)}</span></div><p className="mt-1 text-xs text-muted-foreground">Source: {event.source}</p></li>)}{detail && detail.timeline.length === 0 ? <li className="text-muted-foreground">No timeline events recorded.</li> : null}</ol></div></CardContent></Card> : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Template registry</CardTitle><CardDescription>Version-controlled HTML and plain-text templates.</CardDescription></CardHeader><CardContent className="space-y-3">{templates.map((item) => <div key={item.key} className="rounded-md border p-3"><div className="flex justify-between gap-3"><p className="font-medium">{item.key}</p><Badge variant="outline">v{item.version}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.description}</p></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Active suppressions</CardTitle><CardDescription>Hard bounces, complaints, provider and administrator blocks.</CardDescription></CardHeader><CardContent className="space-y-3">{suppressions.filter((item) => item.active).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><p className="font-medium">{item.normalized_email}</p><p className="text-xs text-muted-foreground">{item.reason.replaceAll('_', ' ')} · {item.source}</p></div><Button variant="outline" size="sm" onClick={async () => { await api('/admin/email/suppressions', { method: 'POST', body: JSON.stringify({ email: item.normalized_email, active: false, reason: 'Cleared from Email Operations after review' }) }); await reload(); }}>Clear</Button></div>)}{suppressions.every((item) => !item.active) ? <p className="text-sm text-muted-foreground">No active suppressions.</p> : null}</CardContent></Card>
      </section>
    </main>
  );
}
