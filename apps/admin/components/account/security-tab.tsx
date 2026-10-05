'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type {
  ApiEnvelope,
  TwoFactorStatusDto,
  UserAccountOverviewDto,
} from '@maevelle/contracts';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/status-badge';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuthenticatorSetupWizard } from '@/components/security/authenticator-setup-wizard';
import {
  TwoFactorManagementDialog,
  type ManagementMode,
} from '@/components/security/two-factor-management-dialog';
import { getAccountErrorMessage } from './account-utils';

interface SecurityTabProps {
  readonly overview: UserAccountOverviewDto;
  readonly onReload: () => Promise<void>;
}

export function SecurityTab({ overview, onReload }: SecurityTabProps) {
  const router = useRouter();
  const { profile, security } = overview;

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // 2FA detailed status state
  const [detailed2faStatus, setDetailed2faStatus] = useState<TwoFactorStatusDto | null>(null);
  const [loading2fa, setLoading2fa] = useState(false);
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [managementMode, setManagementMode] = useState<ManagementMode | null>(null);
  const [securityFeedback, setSecurityFeedback] = useState<string | null>(null);

  // Load detailed 2FA status
  const load2faStatus = useCallback(async () => {
    setLoading2fa(true);
    try {
      const res = await apiRequest<ApiEnvelope<TwoFactorStatusDto>>(
        '/admin/security/two-factor/status',
      );
      setDetailed2faStatus(res.data);
    } catch {
      // Non-critical; fallback to overview state
    } finally {
      setLoading2fa(false);
    }
  }, []);

  useEffect(() => {
    void load2faStatus();
  }, [load2faStatus]);

  // Handle password submission
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      setPasswordFeedback({ type: 'error', text: 'Current password is required.' });
      return;
    }

    if (newPassword.length < 12) {
      setPasswordFeedback({
        type: 'error',
        text: 'New password must be at least 12 characters long.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSubmittingPassword(true);
    setPasswordFeedback(null);

    try {
      await apiRequest('/admin/account/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions,
        }),
      });

      setPasswordFeedback({
        type: 'success',
        text: revokeOtherSessions
          ? 'Password updated successfully. Other active sessions and devices were signed out.'
          : 'Password updated successfully.',
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await onReload();
    } catch (err) {
      setPasswordFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to update password.'),
      });
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleSetupComplete = async () => {
    setSetupWizardOpen(false);
    setSecurityFeedback('Two-factor authentication has been successfully configured.');
    await Promise.all([load2faStatus(), onReload()]);
  };

  const handleManagementSuccess = async () => {
    setManagementMode(null);
    setSecurityFeedback('Security settings updated successfully.');
    await Promise.all([load2faStatus(), onReload()]);
  };

  // Determine effective 2FA status
  const is2faEnabled = detailed2faStatus ? detailed2faStatus.isEnabled : security.twoFactorEnabled;
  const is2faRequired = detailed2faStatus ? detailed2faStatus.isRequired : security.twoFactorRequired;

  return (
    <div className="space-y-6">
      {/* SECTION 1: TWO-FACTOR AUTHENTICATION */}
      <PageSection
        title="Two-Factor Authentication (2FA)"
        description="Add a strong second verification factor using an authenticator app and backup recovery codes."
      >
        <PagePanel>
          <div className="space-y-5 max-w-xl">
            {/* Status card */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      is2faEnabled
                        ? 'bg-success/10 text-success'
                        : is2faRequired
                          ? 'bg-warning/10 text-warning'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {is2faEnabled ? (
                      <ShieldCheck className="size-5" />
                    ) : (
                      <Smartphone className="size-5" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <strong className="text-sm font-semibold text-foreground block">
                      Authenticator App (TOTP)
                    </strong>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {is2faEnabled
                        ? 'Your account is secured with a time-based one-time password (TOTP) from an authenticator app and offline recovery codes.'
                        : 'Protect your account by requiring a temporary verification code from your mobile device when signing in.'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 self-start">
                  <StatusBadge
                    status={
                      is2faEnabled
                        ? 'ENABLED'
                        : is2faRequired
                          ? 'REQUIRED'
                          : 'NOT ENABLED'
                    }
                    tone={is2faEnabled ? 'success' : is2faRequired ? 'warning' : 'neutral'}
                  />
                </div>
              </div>

              {/* Policy requirement banner */}
              {is2faRequired && !is2faEnabled ? (
                <div className="p-3 rounded-lg border border-warning/30 bg-warning/10 text-xs text-warning flex items-start gap-2">
                  <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold text-foreground">Action required:</strong> Maevelle organization policy requires you to configure an authenticator app.
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {!is2faEnabled ? (
                    <Button
                      type="button"
                      onClick={() => setSetupWizardOpen(true)}
                    >
                      Set up authenticator app
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loading2fa}
                        onClick={() => setManagementMode('regenerate')}
                      >
                        Regenerate recovery codes
                      </Button>

                      {!is2faRequired && detailed2faStatus ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={loading2fa}
                          onClick={() => setManagementMode('disable')}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          Disable 2FA
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/account/security')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Full 2FA Console <ArrowRight className="size-3 ml-1" />
                </Button>
              </div>
            </div>

            {/* Recovery Codes Info */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs text-muted-foreground space-y-1">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-primary" />
                Recovery Codes Safeguard
              </span>
              <p className="leading-relaxed">
                Emergency recovery codes can be used to sign in if you lose access to your phone or authenticator app. Maevelle does not store unhashed codes and cannot retrieve lost codes on your behalf.
              </p>
            </div>

            {/* Feedback alert */}
            {securityFeedback ? (
              <div
                role="status"
                className="p-3 rounded-lg border border-success/30 bg-success/10 text-xs text-success"
              >
                {securityFeedback}
              </div>
            ) : null}
          </div>
        </PagePanel>
      </PageSection>

      {/* SECTION 2: PASSWORD CHANGE */}
      <PageSection
        title="Account Password"
        description="Update your credentials. For security, other signed-in sessions are revoked by default."
      >
        <PagePanel>
          <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-4 max-w-lg">
            {/* Current Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="sec-current-pwd" className="text-xs font-semibold text-foreground">
                  Current password
                </label>
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  <span>{showCurrentPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <Input
                id="sec-current-pwd"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                disabled={submittingPassword}
              />
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="sec-new-pwd" className="text-xs font-semibold text-foreground">
                  New password
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  <span>{showNewPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <Input
                id="sec-new-pwd"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                minLength={12}
                autoComplete="new-password"
                required
                disabled={submittingPassword}
              />
              <p className="text-[11px] text-muted-foreground">
                Must be at least 12 characters long. Use a passphrase with mixed letters, numbers, and symbols.
              </p>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="sec-confirm-pwd" className="text-xs font-semibold text-foreground">
                  Confirm new password
                </label>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  <span>{showConfirmPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <Input
                id="sec-confirm-pwd"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                minLength={12}
                autoComplete="new-password"
                required
                disabled={submittingPassword}
              />
            </div>

            {/* Consequence Checkbox: Revoke others */}
            <div className="flex items-start gap-2.5 pt-1 p-3 rounded-lg bg-muted/30 border border-border/60">
              <Checkbox
                id="sec-revoke-others"
                checked={revokeOtherSessions}
                onCheckedChange={(checked) => setRevokeOtherSessions(checked === true)}
                className="mt-0.5"
              />
              <label
                htmlFor="sec-revoke-others"
                className="text-xs text-foreground cursor-pointer select-none space-y-0.5 block"
              >
                <span className="font-medium block">
                  Sign out of all other active sessions and devices
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  Recommended. Your current browser session remains signed in while all other devices must authenticate again.
                </span>
              </label>
            </div>

            {/* Feedback Alert */}
            {passwordFeedback ? (
              <div
                role="status"
                className={`p-3 rounded-lg text-xs border ${
                  passwordFeedback.type === 'success'
                    ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                {passwordFeedback.text}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={
                submittingPassword ||
                !currentPassword ||
                !newPassword ||
                newPassword.length < 12 ||
                newPassword !== confirmPassword
              }
            >
              {submittingPassword ? (
                <>
                  <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                  Updating password…
                </>
              ) : (
                'Update password'
              )}
            </Button>
          </form>
        </PagePanel>
      </PageSection>

      {/* Setup Wizard Modal Dialog */}
      <Dialog open={setupWizardOpen} onOpenChange={setSetupWizardOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Two-Factor Authentication Setup</DialogTitle>
          </DialogHeader>
          <AuthenticatorSetupWizard
            userEmail={profile.email}
            isMandatory={is2faRequired}
            onComplete={() => void handleSetupComplete()}
            onCancel={() => setSetupWizardOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 2FA Management Modal Dialog (Regenerate / Disable) */}
      {detailed2faStatus && managementMode ? (
        <TwoFactorManagementDialog
          open={Boolean(managementMode)}
          mode={managementMode}
          status={detailed2faStatus}
          userEmail={profile.email}
          onOpenChange={(open) => {
            if (!open) setManagementMode(null);
          }}
          onSuccess={() => void handleManagementSuccess()}
        />
      ) : null}
    </div>
  );
}
