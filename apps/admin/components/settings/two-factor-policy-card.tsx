'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';

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
import { apiRequest, ApiRequestError } from '@/lib/api';
import { TotpCodeInput } from '@/components/security/totp-code-input';

const ENFORCEMENT_OPTIONS: readonly {
  id: TwoFactorEnforcementModeDto;
  title: string;
  description: string;
  badge: string;
}[] = [
  {
    id: 'OPTIONAL',
    title: 'Optional for all members',
    description: 'Members may voluntarily enable an authenticator app in their personal Account Security page.',
    badge: 'Recommended for staging',
  },
  {
    id: 'CRITICAL_CAPABILITIES',
    title: 'Owners and critical capabilities',
    description: 'Mandatory for organization owners and any role with financial, user management, or critical data access.',
    badge: 'Recommended for commerce',
  },
  {
    id: 'ALL_MEMBERS',
    title: 'All Admin Portal members',
    description: 'Every internal staff member and administrator must configure an authenticator app to access Maevelle.',
    badge: 'Maximum security',
  },
];

const GRACE_PERIOD_PRESETS = [
  { label: '24 hours (1 day)', hours: 24 },
  { label: '72 hours (3 days)', hours: 72 },
  { label: '7 days (168 hours)', hours: 168 },
  { label: '14 days (336 hours)', hours: 336 },
];

export function TwoFactorPolicyCard() {
  const canManage = useAdminCapability('admin.security.two_factor_policy.manage');
  const [policy, setPolicy] = useState<TwoFactorPolicyDto | null>(null);
  const [mode, setMode] = useState<TwoFactorEnforcementModeDto>('OPTIONAL');
  const [gracePeriodHours, setGracePeriodHours] = useState(168);
  const [reason, setReason] = useState('Scheduled security policy review');
  const [code, setCode] = useState('');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await apiRequest<ApiEnvelope<TwoFactorPolicyDto>>(
        '/admin/security/two-factor/policy',
      );
      setPolicy(response.data);
      setMode(response.data.mode);
      setGracePeriodHours(response.data.gracePeriodHours);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not load the authenticator policy.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;

    if (code.length !== 6) {
      setFeedback({
        type: 'error',
        message: 'Please enter your current 6-digit authenticator verification code.',
      });
      return;
    }

    if (!reason.trim()) {
      setFeedback({
        type: 'error',
        message: 'An audited reason is required for security policy modifications.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const response = await apiRequest<ApiEnvelope<TwoFactorPolicyDto>>(
        '/admin/security/two-factor/policy',
        {
          method: 'PUT',
          body: JSON.stringify({
            expectedVersion: policy.version,
            mode,
            gracePeriodHours,
            reason: reason.trim(),
            code: code.trim(),
          }),
        },
      );
      setPolicy(response.data);
      setCode('');
      setFeedback({
        type: 'success',
        message: 'Two-factor authentication policy successfully updated. Affected staff members have been notified.',
      });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === 'VERSION_CONFLICT') {
          setFeedback({
            type: 'error',
            message: 'The security policy was modified concurrently by another administrator. Please reload before saving.',
          });
        } else if (error.code === 'INVALID_TOTP' || error.status === 400) {
          setFeedback({
            type: 'error',
            message: 'Your verification code was incorrect. Please check your authenticator app and try again.',
          });
        } else {
          setFeedback({
            type: 'error',
            message: error.message,
          });
        }
      } else {
        setFeedback({
          type: 'error',
          message: 'The authenticator policy could not be updated. Please try again.',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading && !policy) {
    return (
      <SettingsCard
        title="Two-Factor Authentication Policy"
        description="Organization policy for standards-compatible authenticator apps."
        icon={ShieldCheck}
      >
        <div className="flex items-center justify-center p-8 gap-2 text-xs text-muted-foreground">
          <RefreshCw className="size-4 animate-spin text-primary" />
          <span>Loading security policy…</span>
        </div>
      </SettingsCard>
    );
  }

  const isDirty = Boolean(
    policy && (mode !== policy.mode || gracePeriodHours !== policy.gracePeriodHours),
  );

  return (
    <SettingsCard
      title="Two-Factor Authentication Policy"
      description="Require TOTP authenticator app protection across internal administrator accounts."
      icon={ShieldCheck}
    >
      <form onSubmit={handleSave} className="space-y-6">
        {feedback && (
          <div
            role="status"
            className={`p-3.5 rounded-lg text-xs flex items-center justify-between border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
                : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="size-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Enforcement Mode Cards */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-foreground">Enforcement Level</Label>
          <div className="grid grid-cols-1 gap-2.5">
            {ENFORCEMENT_OPTIONS.map((opt) => {
              const selected = mode === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/80 bg-card hover:bg-muted/30'
                  } ${!canManage ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="two-factor-mode"
                    value={opt.id}
                    checked={selected}
                    disabled={!canManage}
                    onChange={() => setMode(opt.id)}
                    className="mt-1 text-primary focus:ring-primary"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{opt.title}</span>
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Grace Period Configuration */}
        {mode !== 'OPTIONAL' && (
          <div className="space-y-3 p-4 rounded-xl border border-border/80 bg-muted/20">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <Label htmlFor="grace-period-input" className="text-xs font-semibold text-foreground">
                Enrollment Grace Period
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              When this policy takes effect, existing operators matching the policy will have this many hours to set up an authenticator before their access is restricted.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {GRACE_PERIOD_PRESETS.map((preset) => (
                <Button
                  key={preset.hours}
                  type="button"
                  variant={gracePeriodHours === preset.hours ? 'secondary' : 'outline'}
                  size="sm"
                  disabled={!canManage}
                  className={`text-xs h-7 px-2.5 ${
                    gracePeriodHours === preset.hours
                      ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                      : ''
                  }`}
                  onClick={() => setGracePeriodHours(preset.hours)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Input
                id="grace-period-input"
                type="number"
                min={0}
                max={720}
                disabled={!canManage}
                value={gracePeriodHours}
                onChange={(e) => setGracePeriodHours(Math.max(0, Math.min(720, Number(e.target.value))))}
                className="w-24 text-xs h-8 font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground font-medium">hours</span>
              <span className="text-[11px] text-muted-foreground ml-2">
                (= {(gracePeriodHours / 24).toFixed(1)} days)
              </span>
            </div>
          </div>
        )}

        {/* Authorizing Form for Privileged Admins */}
        {canManage ? (
          <div className="space-y-4 pt-4 border-t border-border/60">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
              <KeyRound className="size-4 text-primary shrink-0" />
              <span>
                To protect system integrity, policy changes require entering your current 6-digit verification code and an audited explanation.
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="policy-audit-reason" className="text-xs font-medium">
                  Audit reason (required)
                </Label>
                <Input
                  id="policy-audit-reason"
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Enforcing multi-factor authentication for annual compliance audit"
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="policy-totp-code" className="text-xs font-medium block text-center sm:text-left">
                  Your 6-digit authenticator code
                </Label>
                <TotpCodeInput
                  id="policy-totp-code"
                  value={code}
                  onChange={setCode}
                  disabled={busy}
                  autoFocus={false}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-muted-foreground">
                Current version: <span className="font-mono">{policy?.version ?? 0}</span>
              </p>

              <Button
                type="submit"
                disabled={busy || code.length !== 6 || !reason.trim()}
                className="h-9 text-xs font-semibold"
              >
                {busy ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin mr-1.5" /> Saving policy…
                  </>
                ) : (
                  'Save authenticator policy'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            You have read-only access to organizational security policies.
          </p>
        )}
      </form>
    </SettingsCard>
  );
}
