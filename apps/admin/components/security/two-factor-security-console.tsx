'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  KeyRound,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';

import type { ApiEnvelope, TwoFactorStatusDto } from '@maevelle/contracts';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  AdminPage,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuthenticatorSetupWizard } from './authenticator-setup-wizard';
import {
  TwoFactorManagementDialog,
  type ManagementMode,
} from './two-factor-management-dialog';

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return 'The security configuration could not be loaded. Please try again.';
}

export function TwoFactorSecurityConsole() {
  const [status, setStatus] = useState<TwoFactorStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [managementMode, setManagementMode] = useState<ManagementMode | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<ApiEnvelope<TwoFactorStatusDto>>(
        '/admin/security/two-factor/status',
      );
      setStatus(response.data);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (loading && !status) {
    return <LoadingState message="Loading account security posture…" />;
  }

  if (!status) {
    return (
      <ErrorState
        title="Could not load security settings"
        message={error ?? 'Please check your connection and try again.'}
        onRetry={() => void loadStatus()}
      />
    );
  }

  const isEnabled = status.isEnabled;
  const isRequired = status.isRequired;
  const enrollmentRequired = status.enrollmentRequired;
  const deadlineFormatted = status.policy.enrollmentDeadline
    ? new Date(status.policy.enrollmentDeadline).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <AdminPage>
      <PageHeader
        eyebrow="My Account"
        title="Account Security"
        description="Manage your authentication credentials, authenticator app protection, and recovery codes."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge
              status={
                isEnabled
                  ? '2FA Enabled'
                  : enrollmentRequired
                    ? 'Setup Required'
                    : '2FA Not Enabled'
              }
              tone={isEnabled ? 'success' : enrollmentRequired ? 'warning' : 'neutral'}
            />
          </div>
        }
      />

      {/* Mandatory or Grace Period Requirement Banner */}
      {enrollmentRequired && (
        <div
          role="alert"
          className="rounded-xl border border-warning/40 bg-warning/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="size-5 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Authenticator app enrollment is required
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {deadlineFormatted
                  ? `Organization policy requires authenticator protection for your account before ${deadlineFormatted}.`
                  : 'Organization policy requires two-factor authentication for your account access.'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setSetupWizardOpen(true)}
            size="sm"
            className="shrink-0 text-xs font-semibold h-9"
          >
            Set up authenticator now
          </Button>
        </div>
      )}

      {/* Transient Action Feedback */}
      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-success/30 bg-success/10 p-4 text-xs text-foreground flex items-center justify-between"
        >
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 text-success shrink-0" />
            <span>{feedback}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFeedback(null)}
            className="size-6 p-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
          >
            ×
          </Button>
        </div>
      )}

      {/* Setup Wizard Active Modal */}
      {setupWizardOpen ? (
        <PageSection
          title="Authenticator App Setup"
          description="Follow the guided steps to connect your device and save recovery codes."
        >
          <PagePanel className="p-6">
            <AuthenticatorSetupWizard
              isMandatory={status.accessRestricted}
              onCancel={() => setSetupWizardOpen(false)}
              onComplete={() => {
                setSetupWizardOpen(false);
                setFeedback('Two-factor authentication has been successfully enabled.');
                void loadStatus();
              }}
            />
          </PagePanel>
        </PageSection>
      ) : (
        <>
          {/* Main 2FA Card */}
          <PageSection
            title="Two-Factor Authentication"
            description="Add an extra layer of protection to your Maevelle account."
          >
            <PagePanel className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                      isEnabled
                        ? 'bg-success/15 text-success border border-success/20'
                        : 'bg-primary/10 text-primary border border-primary/20'
                    }`}
                  >
                    {isEnabled ? <ShieldCheck className="size-6" /> : <Smartphone className="size-6" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">
                        Authenticator App
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        (Google Authenticator, Microsoft Authenticator, 1Password)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isEnabled
                        ? 'Your account requires a temporary 6-digit verification code from your authenticator app when signing in.'
                        : 'Generate temporary verification codes on your phone to secure your account against compromised passwords.'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setHelpDialogOpen(true)}
                    className="text-xs gap-1.5 h-8"
                  >
                    <HelpCircle className="size-3.5" />
                    <span>How it works</span>
                  </Button>

                  {!isEnabled && (
                    <Button
                      type="button"
                      onClick={() => setSetupWizardOpen(true)}
                      size="sm"
                      className="text-xs font-semibold h-8"
                    >
                      Set up authenticator
                    </Button>
                  )}
                </div>
              </div>

              {/* Status & Policy Metadata Box */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-border/70 bg-muted/20 text-xs">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">
                    Protection Status
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        isEnabled ? 'bg-success' : 'bg-muted-foreground'
                      }`}
                    />
                    <span className="font-semibold text-foreground">
                      {isEnabled ? 'Active & Protected' : 'Not Configured'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">
                    Organization Policy
                  </span>
                  <span className="font-medium text-foreground">
                    {isRequired
                      ? status.policy.mode === 'ALL_MEMBERS'
                        ? 'Required for all members'
                        : 'Required for your role'
                      : 'Optional for your role'}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">
                    Recovery Codes
                  </span>
                  <span className="font-medium text-foreground">
                    {status.hasRecoveryCodes ? 'Generated & Stored' : 'Not available'}
                  </span>
                </div>
              </div>

              {/* Benefits Checklist (When not enabled) */}
              {!isEnabled && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <h4 className="text-xs font-semibold text-foreground">
                    Why enable an Authenticator App?
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-primary shrink-0" />
                      <span>Protects your account even if your password is stolen</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-primary shrink-0" />
                      <span>Does not rely on SMS or cellular reception</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-primary shrink-0" />
                      <span>Codes are generated securely and locally on your phone</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-primary shrink-0" />
                      <span>Compatible with Google Authenticator and standard apps</span>
                    </li>
                  </ul>
                </div>
              )}

              {/* Management Controls (When enabled) */}
              {isEnabled && (
                <div className="space-y-4 pt-4 border-t border-border/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-semibold text-foreground">
                        Recovery Codes
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        If you ever misplace your phone, you can use a one-time recovery code to access your account.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setManagementMode('regenerate')}
                      className="text-xs h-8 shrink-0 gap-1.5"
                    >
                      <KeyRound className="size-3.5" />
                      Regenerate recovery codes
                    </Button>
                  </div>

                  {/* Danger Zone: Disable */}
                  <div className="pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-semibold text-destructive">
                        Disable Authenticator Protection
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        {isRequired
                          ? 'Two-factor authentication cannot be disabled because organization security policy requires it for your account.'
                          : 'Remove authenticator app verification. Your account will be protected by password only.'}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRequired}
                      onClick={() => setManagementMode('disable')}
                      className="text-xs h-8 shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      <ShieldOff className="size-3.5 mr-1" />
                      Disable authenticator
                    </Button>
                  </div>
                </div>
              )}
            </PagePanel>
          </PageSection>
        </>
      )}

      {/* Educational "How it works" Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              How Two-Factor Authentication Works
            </DialogTitle>
            <DialogDescription>
              Understand how verification codes protect your Maevelle administrator access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 text-xs text-muted-foreground py-2 leading-relaxed">
            <div className="space-y-1">
              <strong className="text-foreground block">1. What is an Authenticator App?</strong>
              <p>
                An authenticator app is a secure application on your smartphone (such as Google Authenticator, Microsoft Authenticator, or 1Password) that produces a temporary 6-digit code.
              </p>
            </div>

            <div className="space-y-1">
              <strong className="text-foreground block">2. Do I need cellular service or internet?</strong>
              <p>
                No. Authenticator codes are computed mathematically on your device using precise time synchronization. They work even in airplane mode with no Wi-Fi or cellular connection.
              </p>
            </div>

            <div className="space-y-1">
              <strong className="text-foreground block">3. What if I lose my phone?</strong>
              <p>
                When you set up two-factor authentication, Maevelle generates one-time recovery codes. If you ever lose your phone, you can sign in with any unused recovery code.
              </p>
            </div>

            <div className="space-y-1">
              <strong className="text-foreground block">4. What if I lose my recovery codes too?</strong>
              <p>
                An authorized Maevelle organization administrator with security privileges can verify your identity and safely reset your two-factor authentication.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Management Dialog (Regenerate / Disable) */}
      {managementMode && (
        <TwoFactorManagementDialog
          open={Boolean(managementMode)}
          mode={managementMode}
          status={status}
          onOpenChange={(open) => !open && setManagementMode(null)}
          onSuccess={() => {
            setManagementMode(null);
            setFeedback(
              managementMode === 'regenerate'
                ? 'New recovery codes generated successfully.'
                : 'Two-factor authentication disabled.',
            );
            void loadStatus();
          }}
        />
      )}
    </AdminPage>
  );
}
