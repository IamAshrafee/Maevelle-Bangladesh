'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, MessageSquareText, RefreshCw, Send, Settings2, ShieldBan } from 'lucide-react';
import type { SmsDiagnosticsDto, SmsNotificationDetailDto, SmsNotificationRowDto, SmsPolicyDto, SmsPreviewDto, SmsSuppressionDto, SmsTemplateDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { fetchSmsApi, smsStatusTone } from './sms-api';

type Tab = 'overview' | 'activity' | 'templates' | 'policies' | 'test' | 'suppressions' | 'diagnostics';
const tabs: readonly { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'activity', label: 'Activity' }, { key: 'templates', label: 'Templates' },
  { key: 'policies', label: 'Policies' }, { key: 'test', label: 'Test send' }, { key: 'suppressions', label: 'Suppressions' }, { key: 'diagnostics', label: 'Diagnostics' },
];

export function SmsOperationsConsole() {
  const [tab, setTab] = useState<Tab>('overview');
  const [diagnostics, setDiagnostics] = useState<SmsDiagnosticsDto>();
  const [operations, setOperations] = useState<readonly SmsNotificationRowDto[]>([]);
  const [templates, setTemplates] = useState<readonly SmsTemplateDto[]>([]);
  const [policies, setPolicies] = useState<readonly SmsPolicyDto[]>([]);
  const [suppressions, setSuppressions] = useState<readonly SmsSuppressionDto[]>([]);
  const [selected, setSelected] = useState<SmsNotificationDetailDto>();
  const [preview, setPreview] = useState<SmsPreviewDto>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setBusy(true); setError(undefined);
    try {
      const [diag, activity, templateRows, policyRows, suppressionRows] = await Promise.all([
        fetchSmsApi<SmsDiagnosticsDto>('/admin/sms/diagnostics'),
        fetchSmsApi<{ items: readonly SmsNotificationRowDto[] }>('/admin/sms/operations?pageSize=50'),
        fetchSmsApi<readonly SmsTemplateDto[]>('/admin/sms/templates'),
        fetchSmsApi<readonly SmsPolicyDto[]>('/admin/sms/policies'),
        fetchSmsApi<readonly SmsSuppressionDto[]>('/admin/sms/suppressions'),
      ]);
      setDiagnostics(diag); setOperations(activity.items); setTemplates(templateRows); setPolicies(policyRows); setSuppressions(suppressionRows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'SMS data could not be loaded.'); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><MessageSquareText className="size-6" /> SMS Operations</h1><p className="mt-1 text-sm text-muted-foreground">Provider-neutral transactional SMS activity, templates, policies, safety controls, and diagnostics.</p></div>
        <Button variant="outline" onClick={() => void refresh()} disabled={busy}><RefreshCw className={`mr-2 size-4 ${busy ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="SMS operations sections">
        {tabs.map((item) => <Button key={item.key} size="sm" variant={tab === item.key ? 'default' : 'outline'} onClick={() => setTab(item.key)}>{item.label}</Button>)}
      </div>
      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {tab === 'overview' ? <Overview diagnostics={diagnostics} operations={operations} /> : null}
      {tab === 'activity' ? <ActivityList items={operations} selected={selected} onSelect={async (id) => { try { setSelected(await fetchSmsApi<SmsNotificationDetailDto>(`/admin/sms/operations/${id}`)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Detail could not be loaded.'); } }} /> : null}
      {tab === 'templates' ? <Templates templates={templates} preview={preview} onPreview={async (event) => { try { setPreview(await fetchSmsApi<SmsPreviewDto>(`/admin/sms/templates/${event}/preview`, { method: 'POST', body: '{}' })); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Preview failed.'); } }} /> : null}
      {tab === 'policies' ? <Policies policies={policies} onSaved={refresh} onError={setError} /> : null}
      {tab === 'test' ? <TestSend templates={templates} enabled={Boolean(diagnostics?.providerConfigured)} onSent={refresh} onError={setError} /> : null}
      {tab === 'suppressions' ? <Suppressions rows={suppressions} onSaved={refresh} onError={setError} /> : null}
      {tab === 'diagnostics' ? <Diagnostics {...(diagnostics ? { diagnostics } : {})} /> : null}
    </div>
  );
}

function Overview({ diagnostics, operations }: { diagnostics: SmsDiagnosticsDto | undefined; operations: readonly SmsNotificationRowDto[] }) {
  const metrics = [['Queued', diagnostics?.queued ?? 0], ['Accepted', diagnostics?.accepted ?? 0], ['Delivered', diagnostics?.delivered ?? 0], ['Failed', diagnostics?.failed ?? 0]] as const;
  return <div className="space-y-5">
    {!diagnostics?.providerConfigured ? <div className="flex gap-3 rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="size-5 shrink-0" /><div><p className="font-semibold">SMS provider not configured</p><p>Infrastructure is ready, but real sending remains disabled until Maevelle selects and installs a production provider adapter.</p></div></div> : null}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-3xl">{value}</CardTitle></CardHeader></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">Current delivery posture</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Fact label="Enabled" value={diagnostics?.enabled ? 'Yes' : 'No'} /><Fact label="Provider" value={diagnostics?.provider === 'none' ? 'Not configured' : diagnostics?.provider ?? 'Not configured'} /><Fact label="Environment" value={diagnostics?.environment ?? 'Unknown'} /><Fact label="Sender" value={diagnostics?.senderId ?? diagnostics?.senderType ?? 'Provider default'} /></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Recent activity</CardTitle><CardDescription>Latest {Math.min(operations.length, 8)} transactional SMS records.</CardDescription></CardHeader><CardContent><Rows items={operations.slice(0, 8)} /></CardContent></Card>
  </div>;
}

function ActivityList({ items, selected, onSelect }: { items: readonly SmsNotificationRowDto[]; selected: SmsNotificationDetailDto | undefined; onSelect: (id: string) => void }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]"><Card><CardHeader><CardTitle>SMS activity</CardTitle><CardDescription>Accepted is distinct from delivered; delivery requires a provider receipt.</CardDescription></CardHeader><CardContent><Rows items={items} onSelect={onSelect} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Notification detail</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{selected ? <><div className="flex items-center justify-between"><strong>{selected.notification_type.replaceAll('_',' ')}</strong><Status value={selected.status} /></div><p className="rounded-lg bg-muted p-3 whitespace-pre-wrap">{selected.rendered_body}</p><Fact label="Recipient" value={selected.intended_recipient ?? 'None'} /><Fact label="Encoding / segments" value={`${selected.encoding} · ${selected.estimated_segments}`} /><Fact label="Provider message ID" value={selected.provider_message_id ?? 'Not assigned'} /><div><p className="font-medium">Timeline</p><ul className="mt-2 space-y-2">{selected.timeline.map((event) => <li key={event.id} className="border-l-2 pl-3 text-xs"><strong>{event.event_type}</strong><br/><span className="text-muted-foreground">{new Date(event.event_at).toLocaleString('en-BD')}</span></li>)}</ul></div></> : <p className="text-muted-foreground">Select an activity row to inspect attempts, lifecycle events, content, and provider identity.</p>}</CardContent></Card></div>;
}

function Templates({ templates, preview, onPreview }: { templates: readonly SmsTemplateDto[]; preview: SmsPreviewDto | undefined; onPreview: (event: string) => void }) {
  return <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Code-backed templates</CardTitle><CardDescription>Version-controlled and channel-specific; preview never sends.</CardDescription></CardHeader><CardContent className="space-y-3">{templates.map((template) => <div key={template.key} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{template.key}</p><p className="text-xs text-muted-foreground">{template.event} · v{template.version} · {template.description}</p></div><Button size="sm" variant="outline" onClick={() => onPreview(template.event)}>Preview</Button></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Rendered preview</CardTitle></CardHeader><CardContent>{preview ? <div className="space-y-4"><div className="rounded-xl border bg-muted/40 p-4 text-sm whitespace-pre-wrap">{preview.renderedText}</div><div className="grid grid-cols-3 gap-3"><Fact label="Encoding" value={preview.encoding} /><Fact label="Characters" value={String(preview.characterCount)} /><Fact label="Segments" value={String(preview.segmentCount)} /></div>{preview.warnings.map((warning) => <p key={warning} className="text-sm text-amber-700">{warning}</p>)}</div> : <p className="text-sm text-muted-foreground">Choose a template to see its fixture output and estimated telecom segments.</p>}</CardContent></Card></div>;
}

function Policies({ policies, onSaved, onError }: { policies: readonly SmsPolicyDto[]; onSaved: () => Promise<void>; onError: (value?: string) => void }) {
  const [reason, setReason] = useState('SMS policy updated from Admin operations');
  const save = async (policy: SmsPolicyDto, patch: Partial<{ enabled: boolean; automatic_enabled: boolean; manual_allowed: boolean }>) => { try { await fetchSmsApi(`/admin/sms/policies/${policy.notification_type}`, { method: 'PATCH', body: JSON.stringify({ enabled: patch.enabled ?? policy.enabled, automaticEnabled: patch.automatic_enabled ?? policy.automatic_enabled, manualAllowed: patch.manual_allowed ?? policy.manual_allowed, reason }) }); await onSaved(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Policy update failed.'); } };
  return <Card><CardHeader><CardTitle>SMS event policies</CardTitle><CardDescription>SMS defaults are independent from Email. Automatic sending begins disabled until explicitly enabled.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="sms-policy-reason">Audit reason</Label><Input id="sms-policy-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>{policies.map((policy) => <div key={policy.notification_type} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto_auto_auto]"><div><p className="font-medium">{policy.notification_type.replaceAll('_',' ')}</p><p className="text-xs text-muted-foreground">{policy.template_key} · {policy.delivery_requirement}</p></div><Toggle label="Enabled" value={policy.enabled} onChange={(value) => void save(policy, { enabled: value })} /><Toggle label="Automatic" value={policy.automatic_enabled} onChange={(value) => void save(policy, { automatic_enabled: value })} /><Toggle label="Manual" value={policy.manual_allowed} onChange={(value) => void save(policy, { manual_allowed: value })} /></div>)}</CardContent></Card>;
}

function TestSend({ templates, enabled, onSent, onError }: { templates: readonly SmsTemplateDto[]; enabled: boolean; onSent: () => Promise<void>; onError: (value?: string) => void }) {
  const [orderId, setOrderId] = useState(''); const [recipient, setRecipient] = useState(''); const [event, setEvent] = useState('ORDER_CONFIRMED'); const [reason, setReason] = useState('SMS test from Admin'); const [result, setResult] = useState<string>();
  return <Card><CardHeader><CardTitle>Protected test send</CardTitle><CardDescription>Requires a real order snapshot, mock/configured provider, permission, and an environment allow-listed recipient.</CardDescription></CardHeader><CardContent className="grid max-w-2xl gap-4"><Field label="Order ID or number"><Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order UUID or MV…" /></Field><Field label="Allow-listed test recipient"><Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="+8801712345678" /></Field><Field label="Event"><NativeSelect value={event} onChange={(e) => setEvent(e.target.value)}>{templates.map((template) => <NativeSelectOption key={template.event} value={template.event}>{template.event.replaceAll('_',' ')}</NativeSelectOption>)}</NativeSelect></Field><Field label="Audit reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field><Button disabled={!enabled || !orderId || !recipient || reason.length < 3} onClick={async () => { try { const response = await fetchSmsApi<{ id: string }>(`/admin/sms/orders/${encodeURIComponent(orderId)}/test`, { method: 'POST', body: JSON.stringify({ notificationType: event, testRecipient: recipient, reason, idempotencyKey: `sms-test-${crypto.randomUUID()}` }) }); setResult(`Test SMS queued as ${response.id}.`); await onSent(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Test send failed.'); } }}><Send className="mr-2 size-4" />Queue test SMS</Button>{!enabled ? <p className="text-sm text-amber-700">Provider not configured. Mock test sending is available only when SMS_PROVIDER=mock and SMS_ENABLED=true.</p> : null}{result ? <p className="text-sm text-emerald-700">{result}</p> : null}</CardContent></Card>;
}

function Suppressions({ rows, onSaved, onError }: { rows: readonly SmsSuppressionDto[]; onSaved: () => Promise<void>; onError: (value?: string) => void }) {
  const [phone, setPhone] = useState(''); const [reason, setReason] = useState('Customer requested SMS suppression');
  const mutate = async (target: string, active: boolean) => { try { await fetchSmsApi('/admin/sms/suppressions', { method: 'POST', body: JSON.stringify({ phone: target, active, reason }) }); setPhone(''); await onSaved(); } catch (cause) { onError(cause instanceof Error ? cause.message : 'Suppression update failed.'); } };
  return <div className="grid gap-5 lg:grid-cols-[360px_1fr]"><Card><CardHeader><CardTitle>Add suppression</CardTitle><CardDescription>Transactional only. Temporary delivery failures do not automatically suppress.</CardDescription></CardHeader><CardContent className="space-y-4"><Field label="Bangladesh mobile"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01712345678" /></Field><Field label="Audit reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field><Button disabled={!phone || reason.length < 3} onClick={() => void mutate(phone, true)}><ShieldBan className="mr-2 size-4" />Suppress</Button></CardContent></Card><Card><CardHeader><CardTitle>Suppression registry</CardTitle></CardHeader><CardContent className="space-y-2">{rows.length ? rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><p className="font-mono">{row.normalized_phone}</p><p className="text-xs text-muted-foreground">{row.reason.replaceAll('_',' ')} · {row.active ? 'Active' : 'Cleared'}</p></div>{row.active ? <Button size="sm" variant="outline" onClick={() => void mutate(row.normalized_phone, false)}>Clear</Button> : null}</div>) : <p className="text-sm text-muted-foreground">No SMS suppressions.</p>}</CardContent></Card></div>;
}

function Diagnostics({ diagnostics }: { diagnostics?: SmsDiagnosticsDto }) { return <Card><CardHeader><CardTitle>Provider and worker diagnostics</CardTitle><CardDescription>No provider is a safe expected state, not a worker failure.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Fact label="Global sending" value={diagnostics?.enabled ? 'Enabled' : 'Disabled'} /><Fact label="Provider selected" value={diagnostics?.provider === 'none' ? 'Not configured' : diagnostics?.provider ?? 'Not configured'} /><Fact label="Credentials/config" value={diagnostics?.credentialsConfigured ? 'Configured' : 'Unavailable until provider configured'} /><Fact label="Capabilities" value={diagnostics?.capabilities.length ? diagnostics.capabilities.join(', ') : 'Unavailable until provider configured'} /><Fact label="Worker" value={diagnostics?.workerStatus ?? 'Unknown'} /><Fact label="Last callback" value={diagnostics?.lastDeliveryCallbackAt ? new Date(diagnostics.lastDeliveryCallbackAt).toLocaleString('en-BD') : 'None'} /><Fact label="Recipient override" value={diagnostics?.recipientOverride ?? 'Disabled'} /><Fact label="Oldest queued" value={diagnostics?.oldestQueuedAt ? new Date(diagnostics.oldestQueuedAt).toLocaleString('en-BD') : 'None'} /></CardContent></Card>; }

function Rows({ items, onSelect }: { items: readonly SmsNotificationRowDto[]; onSelect?: (id: string) => void }) { return items.length ? <div className="divide-y rounded-lg border">{items.map((item) => <button key={item.id} type="button" onClick={() => onSelect?.(item.id)} className="flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 disabled:pointer-events-none" disabled={!onSelect}><div className="min-w-0"><p className="truncate text-sm font-medium">{item.notification_type.replaceAll('_',' ')}</p><p className="truncate text-xs text-muted-foreground">{item.intended_recipient ?? 'No valid recipient'} · {item.template_key ?? 'No template'} · {new Date(item.created_at).toLocaleString('en-BD')}</p></div><Status value={item.status} /></button>)}</div> : <p className="text-sm text-muted-foreground">No transactional SMS activity yet.</p>; }
function Status({ value }: { value: string }) { return <Badge className={smsStatusTone(value)}>{value.replaceAll('_',' ')}</Badge>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="break-words font-medium">{value}</p></div>; }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2 text-xs"><Switch checked={value} onCheckedChange={onChange} />{label}</label>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
