'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import type {
  ApiEnvelope,
  TwoFactorPolicyDto,
  TwoFactorEnforcementModeDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { SettingsCard } from '@/components/settings/settings-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { apiRequest, ApiRequestError } from '@/lib/api';

export function TwoFactorPolicyCard() {
  const canManage = useAdminCapability('admin.security.two_factor_policy.manage');
  const [policy, setPolicy] = useState<TwoFactorPolicyDto>();
  const [mode, setMode] = useState<TwoFactorEnforcementModeDto>('OPTIONAL');
  const [gracePeriodHours, setGracePeriodHours] = useState(168);
  const [reason, setReason] = useState('Scheduled authenticator policy update');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    try {
      const response = await apiRequest<ApiEnvelope<TwoFactorPolicyDto>>(
        '/admin/security/two-factor/policy',
      );
      setPolicy(response.data);
      setMode(response.data.mode);
      setGracePeriodHours(response.data.gracePeriodHours);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not load the authenticator policy.',
      );
    }
  }, []);

  useEffect(() => void load(), [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await apiRequest<ApiEnvelope<TwoFactorPolicyDto>>(
        '/admin/security/two-factor/policy',
        {
          method: 'PUT',
          body: JSON.stringify({
            expectedVersion: policy.version,
            mode,
            gracePeriodHours,
            reason,
            code,
          }),
        },
      );
      setPolicy(response.data);
      setCode('');
      setMessage('Authenticator policy updated and affected members were notified.');
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError
          ? error.message
          : 'The authenticator policy could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      title="Authenticator App Requirement"
      description="Require TOTP protection for privileged or all internal administrators without hardcoding role names."
      icon={ShieldCheck}
    >
      {!policy ? (
        <p className="text-xs text-muted-foreground">Loading authenticator policy…</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="two-factor-policy-mode">Enforcement</Label>
              <NativeSelect
                id="two-factor-policy-mode"
                className="w-full"
                value={mode}
                disabled={!canManage}
                onChange={(event) => setMode(event.target.value as TwoFactorEnforcementModeDto)}
              >
                <option value="OPTIONAL">Optional</option>
                <option value="CRITICAL_CAPABILITIES">Owners and critical capabilities</option>
                <option value="ALL_MEMBERS">All Admin Portal members</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="two-factor-grace-hours">Enrollment grace period (hours)</Label>
              <Input
                id="two-factor-grace-hours"
                type="number"
                min={0}
                max={720}
                disabled={!canManage || mode === 'OPTIONAL'}
                value={gracePeriodHours}
                onChange={(event) => setGracePeriodHours(Number(event.target.value))}
                className="font-mono tabular-nums"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The default remains optional. When a requirement starts, affected existing members can
            enroll during the configured grace period; after the deadline, server APIs allow only
            setup and sign-out.
          </p>
          {canManage ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="two-factor-policy-reason">Audited reason</Label>
                <Input
                  id="two-factor-policy-reason"
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="two-factor-policy-code">Current six-digit code</Label>
                <Input
                  id="two-factor-policy-code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
          ) : null}
          {message ? (
            <p className="text-xs text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
          {canManage ? (
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save authenticator policy'}
            </Button>
          ) : null}
        </form>
      )}
    </SettingsCard>
  );
}
