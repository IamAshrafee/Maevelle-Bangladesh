'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SmsDiagnosticsDto, SmsPolicyDto } from './sms-types';
import { smsEventLabel } from './sms-types';
import { fetchSmsApi } from './sms-api';
import { useAdminCapability } from '@/components/admin-capabilities';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function SmsPoliciesTab({
  policies,
  diagnostics,
  onRefresh,
}: {
  readonly policies: readonly SmsPolicyDto[];
  readonly diagnostics: SmsDiagnosticsDto | undefined;
  readonly onRefresh: () => Promise<void>;
}) {
  const canManage = useAdminCapability('notifications.sms.configure_policy');
  const [reason, setReason] = useState('Reviewed transactional SMS policy');
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const save = async (
    policy: SmsPolicyDto,
    patch: Partial<{ enabled: boolean; automatic_enabled: boolean; manual_allowed: boolean }>,
  ) => {
    setSaving(policy.notification_type);
    setMessage('');
    try {
      await fetchSmsApi(`/admin/sms/policies/${policy.notification_type}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: patch.enabled ?? policy.enabled,
          automaticEnabled: patch.automatic_enabled ?? policy.automatic_enabled,
          manualAllowed: patch.manual_allowed ?? policy.manual_allowed,
          reason,
        }),
      });
      setMessage(`${smsEventLabel(policy.notification_type)} policy saved.`);
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Policy could not be saved.');
    } finally {
      setSaving('');
    }
  };
  return (
    <div className="space-y-6">
      {!diagnostics?.providerConfigured || diagnostics.provider === 'mock' ? (
        <div className="flex items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950 dark:bg-blue-950 dark:text-blue-100">
          <ShieldCheck aria-hidden="true" className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">Policies Are Ready Before Provider Connection</p>
            <p className="mt-1 text-xs">
              You can review policy intent now. A configured automatic policy still cannot send real
              customer SMS until a production provider is connected and global SMS sending is
              enabled.
            </p>
          </div>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Policy Change Audit</CardTitle>
          <CardDescription>
            Every change records your operator identity, before/after values, and this reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="sms-policy-reason">Reason for Changes</Label>
          <Input
            id="sms-policy-reason"
            name="sms-policy-reason"
            autoComplete="off"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why are these SMS policies changing…"
            disabled={!canManage}
          />
          {!canManage ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Your role can review policies but cannot modify them.
            </p>
          ) : null}
          {message ? (
            <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {policies.map((policy) => (
          <Card key={policy.notification_type}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    {smsEventLabel(policy.notification_type)}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Triggers from the authoritative{' '}
                    {policy.notification_type.replaceAll('_', ' ').toLowerCase()} business event.
                  </CardDescription>
                </div>
                <Badge variant={policy.enabled ? 'default' : 'secondary'}>
                  {policy.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <PolicyToggle
                id={`${policy.notification_type}-enabled`}
                label="SMS Event Enabled"
                description="Allows this business event to create or send SMS according to the remaining rules."
                checked={policy.enabled}
                disabled={
                  !canManage || saving === policy.notification_type || reason.trim().length < 3
                }
                onChange={(enabled) => void save(policy, { enabled })}
              />
              <PolicyToggle
                id={`${policy.notification_type}-automatic`}
                label="Automatic Sending"
                description="Creates an SMS automatically when the authoritative event occurs."
                checked={policy.automatic_enabled}
                disabled={
                  !canManage ||
                  saving === policy.notification_type ||
                  reason.trim().length < 3 ||
                  !policy.enabled
                }
                onChange={(automatic_enabled) => void save(policy, { automatic_enabled })}
              />
              <PolicyToggle
                id={`${policy.notification_type}-manual`}
                label="Manual Send Allowed"
                description="Lets authorized operators deliberately create this template-based customer communication."
                checked={policy.manual_allowed}
                disabled={
                  !canManage ||
                  saving === policy.notification_type ||
                  reason.trim().length < 3 ||
                  !policy.enabled
                }
                onChange={(manual_allowed) => void save(policy, { manual_allowed })}
              />
              <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                <p className="font-medium">Eligibility Path</p>
                <ol className="mt-2 space-y-1.5 text-muted-foreground">
                  <Decision
                    passed={Boolean(diagnostics?.enabled)}
                    text="Global SMS sending enabled"
                  />
                  <Decision passed={policy.enabled} text="Event policy enabled" />
                  <Decision passed={policy.automatic_enabled} text="Automatic sending enabled" />
                  <Decision
                    passed={Boolean(
                      diagnostics?.providerConfigured && diagnostics.provider !== 'mock',
                    )}
                    text="Production provider connected"
                  />
                </ol>
                <p className="mt-3 font-medium">
                  Result:{' '}
                  {diagnostics?.enabled &&
                  policy.enabled &&
                  policy.automatic_enabled &&
                  diagnostics.providerConfigured &&
                  diagnostics.provider !== 'mock'
                    ? 'Ready for automatic production delivery'
                    : 'Production automatic delivery is not active'}
                </p>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                {policy.template_key} · {policy.delivery_requirement}
              </p>
              {saving === policy.notification_type ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RefreshCw
                    aria-hidden="true"
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                  />
                  Saving audited policy…
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PolicyToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  const controlId = `sms-policy-${id.toLowerCase()}`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={controlId}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={controlId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </div>
  );
}
function Decision({ passed, text }: { readonly passed: boolean; readonly text: string }) {
  return (
    <li className="flex items-center gap-2">
      {passed ? (
        <CheckCircle2 aria-hidden="true" className="size-3.5 text-emerald-600" />
      ) : (
        <AlertTriangle aria-hidden="true" className="size-3.5 text-amber-600" />
      )}
      <span>{text}</span>
    </li>
  );
}
