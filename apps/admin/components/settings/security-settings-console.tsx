'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { SettingStatusBadge, RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { SettingsNav } from '@/components/settings/settings-nav';
import { fetchApiData } from '@/lib/api';
import type { ModuleSettingsResponseDto } from '@maevelle/contracts';

interface SecuritySettingsDto {
  readonly sessionTimeoutMinutes: number;
}

export function SecuritySettingsConsole() {
  const [initialData, setInitialData] = useState<ModuleSettingsResponseDto<SecuritySettingsDto>>();
  const [timeoutMinutes, setTimeoutMinutes] = useState(1440);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchApiData<ModuleSettingsResponseDto<SecuritySettingsDto>>(
        '/admin/settings/security',
      );
      if (res) {
        setInitialData(res);
        setTimeoutMinutes(Number(res.settings.sessionTimeoutMinutes) || 1440);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load security settings.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isDirty = Boolean(initialData && timeoutMinutes !== initialData.settings.sessionTimeoutMinutes);

  const handleDiscard = () => {
    if (!initialData) return;
    setTimeoutMinutes(initialData.settings.sessionTimeoutMinutes);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    if (timeoutMinutes < 15 || timeoutMinutes > 43200) {
      setFeedback({ type: 'error', message: 'Session timeout must be between 15 and 43200 minutes (30 days).' });
      setSaving(false);
      return;
    }

    try {
      const updated = await fetchApiData<ModuleSettingsResponseDto<SecuritySettingsDto>>(
        '/admin/settings/security',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              'security.sessionTimeoutMinutes': Number(timeoutMinutes),
            },
            expectedVersion: initialData.version,
            reason: `Updated operator session inactivity timeout to ${timeoutMinutes} minutes`,
          }),
        },
      );

      if (updated) {
        setInitialData(updated);
        setFeedback({
          type: 'success',
          message: 'Security settings updated successfully.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update security settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    setSaving(true);
    try {
      const resetRes = await fetchApiData<ModuleSettingsResponseDto<SecuritySettingsDto>>(
        '/admin/settings/security/reset',
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Administrator reset security settings to defaults' }),
        },
      );
      if (resetRes) {
        setInitialData(resetRes);
        setTimeoutMinutes(resetRes.settings.sessionTimeoutMinutes);
        setResetConfirmOpen(false);
        setFeedback({ type: 'success', message: 'Security settings restored to defaults (24 hours).' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not reset security settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !initialData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading Security Settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      <SettingsNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Security Settings</h1>
            <SettingStatusBadge status="ready" label="Enforced" />
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Session expiration rules, authentication policy verification, and infrastructure isolation boundaries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAuditDrawerOpen(true)}
            className="text-xs h-8 gap-1.5"
          >
            <History className="size-3.5 text-muted-foreground" />
            History
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
            className="text-xs h-8 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5 mr-1" />
            Reset to default
          </Button>
        </div>
      </div>

      {feedback && (
        <div
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFeedback(null)}
            className="size-6 p-0 hover:bg-transparent"
          >
            ×
          </Button>
        </div>
      )}

      {/* Session Policies */}
      <SettingsSection
        title="Operator Session Inactivity"
        description="Configure inactivity timeout boundaries for administrative browser sessions."
      >
        <SettingsCard title="Session Lifetime" icon={Clock}>
          <div className="space-y-4">
            <SettingField
              id="session-timeout-minutes-input"
              label="Session Inactivity Timeout"
              description="Minutes of idle time before an administrative operator is automatically logged out."
              consequenceHint="Shorter timeouts improve security on shared workstations; longer timeouts reduce re-login friction."
              required
            >
              <div className="flex items-center gap-2">
                <Input
                  id="session-timeout-minutes-input"
                  type="number"
                  min={15}
                  max={43200}
                  value={timeoutMinutes}
                  onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                  className="text-xs h-9 max-w-[120px]"
                />
                <span className="text-xs font-semibold text-muted-foreground">Minutes</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Currently configured: {(timeoutMinutes / 60).toFixed(1)} hours ({timeoutMinutes} minutes)
              </p>
            </SettingField>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Access Control & RBAC Link */}
      <SettingsSection
        title="Role-Based Access Control"
        description="Fine-grained permissions and membership governance."
      >
        <div className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Operator Accounts & Roles</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Manage team members, grant role capabilities, and configure workspace permissions.
            </p>
          </div>
          <Link
            href="/team"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-8 shrink-0' })}
          >
            Open Team & Access
          </Link>
        </div>
      </SettingsSection>

      {/* Infrastructure-Managed Secrets Protection */}
      <SettingsSection
        title="Infrastructure Secrets & Root Cryptography"
        description="Authoritative security boundaries managed outside application storage."
      >
        <SettingsCard
          title="Root Infrastructure Credentials"
          description="These root cryptographic keys protect all application data and are strictly deployment-managed."
          icon={ShieldCheck}
        >
          <div className="space-y-3">
            <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Auth Encryption Master Key (256-bit AES-GCM)</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  <Lock className="size-2.5 mr-1" />
                  Deployment Managed
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Used to encrypt third-party integration secrets before persisting to PostgreSQL. The plaintext key
                is injected via server environment and is never accessible through APIs or rendered to browsers.
              </p>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Better Auth Signing Secret</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  <Lock className="size-2.5 mr-1" />
                  Deployment Managed
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Signs and verifies cryptographic HTTP session cookies and authorization tokens. Kept in server memory
                only to prevent session forgery.
              </p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Sticky Save Bar */}
      <SettingsSaveBar
        dirty={isDirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Reset Confirmation */}
      <SettingsConfirmationDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Security Settings to Defaults?"
        description="This will restore the operator session inactivity timeout to 1440 minutes (24 hours)."
        confirmLabel="Reset to defaults"
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirmReset}
      />

      {/* Audit Drawer */}
      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="security"
        title="Security Settings History"
      />
    </div>
  );
}
