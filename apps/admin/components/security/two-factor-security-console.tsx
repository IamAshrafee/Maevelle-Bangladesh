'use client';

import Image from 'next/image';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';

import type { ApiEnvelope, TwoFactorStatusDto } from '@maevelle/contracts';

import { apiRequest, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AdminPage,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';

type Enrollment = { readonly totpUri: string; readonly setupKey: string; readonly issuer: string };

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return 'The security operation could not be completed. Try again.';
}

export function TwoFactorSecurityConsole() {
  const [status, setStatus] = useState<TwoFactorStatusDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[]>();
  const [managementAction, setManagementAction] = useState<'regenerate' | 'disable'>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await apiRequest<ApiEnvelope<TwoFactorStatusDto>>(
        '/admin/security/two-factor/status',
      );
      setStatus(response.data);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    let active = true;
    if (!enrollment) {
      setQrDataUrl(undefined);
      return;
    }
    void import('qrcode').then(async ({ default: QRCode }) => {
      const url = await QRCode.toDataURL(enrollment.totpUri, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 256,
      });
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [enrollment]);

  async function beginEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await apiRequest<ApiEnvelope<Enrollment>>(
        '/admin/security/two-factor/enrollment',
        { method: 'POST', body: JSON.stringify({ password }) },
      );
      setEnrollment(response.data);
      setPassword('');
      setMessage('Scan the QR code, then verify the first code from your authenticator app.');
    } catch (operationError) {
      setError(errorMessage(operationError));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await apiRequest<
        ApiEnvelope<{ enabled: true; backupCodes: readonly string[] }>
      >('/admin/security/two-factor/enrollment/verify', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode }),
      });
      setRecoveryCodes(response.data.backupCodes);
      setEnrollment(undefined);
      setTotpCode('');
      setMessage('Authenticator protection is enabled. Save the recovery codes before leaving.');
      await load();
    } catch (operationError) {
      setError(errorMessage(operationError));
    } finally {
      setBusy(false);
    }
  }

  async function manage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managementAction) return;
    setBusy(true);
    setError(undefined);
    try {
      if (managementAction === 'regenerate') {
        const response = await apiRequest<ApiEnvelope<{ backupCodes: readonly string[] }>>(
          '/admin/security/two-factor/backup-codes',
          { method: 'POST', body: JSON.stringify({ password, code: totpCode }) },
        );
        setRecoveryCodes(response.data.backupCodes);
        setMessage('New recovery codes created. Every previous recovery code is now invalid.');
      } else {
        await apiRequest('/admin/security/two-factor/disable', {
          method: 'POST',
          body: JSON.stringify({ password, code: totpCode }),
        });
        window.location.assign('/admin/login');
        return;
      }
      setManagementAction(undefined);
      setPassword('');
      setTotpCode('');
      await load();
    } catch (operationError) {
      setError(errorMessage(operationError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState message="Loading account security…" />;
  if (!status)
    return <ErrorState {...(error ? { message: error } : {})} onRetry={() => void load()} />;

  return (
    <AdminPage>
      <PageHeader
        eyebrow="My account"
        title="Account security"
        description="Protect this Maevelle administrator account with a standards-compatible authenticator app."
        actions={
          <StatusBadge
            status={
              status.isEnabled
                ? '2FA enabled'
                : status.isRequired
                  ? 'Setup required'
                  : '2FA not enabled'
            }
            tone={status.isEnabled ? 'success' : status.isRequired ? 'warning' : 'neutral'}
          />
        }
      />

      {status.enrollmentRequired ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
          <strong>Authenticator enrollment is required.</strong>{' '}
          {status.policy.enrollmentDeadline
            ? `Complete setup before ${new Date(status.policy.enrollmentDeadline).toLocaleString()}.`
            : 'Complete setup to continue using protected Admin Portal functions.'}
        </div>
      ) : null}
      {message ? (
        <div
          className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-foreground"
          role="status"
        >
          {message}
        </div>
      ) : null}
      {error ? <ErrorState title="Security action failed" message={error} /> : null}

      {recoveryCodes ? (
        <PageSection
          title="Save your recovery codes"
          description="Each code works once. Store them outside Maevelle in a secure password manager or offline location."
        >
          <PagePanel className="space-y-4 border-warning/30">
            <div className="grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map((code) => (
                <code
                  key={code}
                  className="rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm tabular-nums"
                >
                  {code}
                </code>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigator.clipboard.writeText(recoveryCodes.join('\n'))}
              >
                <Copy className="size-4" /> Copy codes
              </Button>
              <Button type="button" onClick={() => setRecoveryCodes(undefined)}>
                I stored them safely
              </Button>
            </div>
          </PagePanel>
        </PageSection>
      ) : null}

      <PageSection
        title="Authenticator app"
        description="Works with Google Authenticator and other compatible TOTP apps. Codes are generated locally on your device."
      >
        <PagePanel className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">
                {status.isEnabled
                  ? 'Authenticator protection is active'
                  : 'Set up an authenticator app'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {status.isEnabled
                  ? 'Your password alone cannot complete a new Maevelle Admin sign-in.'
                  : 'Confirm your password to create a private setup code.'}
              </p>
            </div>
          </div>

          {!status.isEnabled && !enrollment ? (
            <form onSubmit={beginEnrollment} className="max-w-md space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="enrollment-password">Current password</Label>
                <Input
                  id="enrollment-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                <KeyRound className="size-4" /> {busy ? 'Starting…' : 'Set up authenticator'}
              </Button>
            </form>
          ) : null}

          {enrollment ? (
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
              <div className="flex min-h-64 min-w-64 items-center justify-center rounded-xl border border-border bg-white p-3">
                {qrDataUrl ? (
                  <Image
                    src={qrDataUrl}
                    width={256}
                    height={256}
                    alt="Maevelle authenticator setup QR code"
                    unoptimized
                  />
                ) : (
                  <RefreshCw className="size-5 animate-spin text-primary" />
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Manual setup key</p>
                  <code className="mt-1 block break-all rounded-lg border border-border bg-muted p-3 font-mono text-sm">
                    {enrollment.setupKey}
                  </code>
                </div>
                <form onSubmit={verifyEnrollment} className="max-w-sm space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="enrollment-code">Six-digit code</Label>
                    <Input
                      id="enrollment-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={totpCode}
                      onChange={(event) => setTotpCode(event.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    <CheckCircle2 className="size-4" /> {busy ? 'Verifying…' : 'Verify and enable'}
                  </Button>
                </form>
              </div>
            </div>
          ) : null}

          {status.isEnabled && !managementAction ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setManagementAction('regenerate')}
              >
                Regenerate recovery codes
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={status.isRequired}
                onClick={() => setManagementAction('disable')}
              >
                Disable authenticator
              </Button>
            </div>
          ) : null}

          {status.isEnabled && managementAction ? (
            <form
              onSubmit={manage}
              className="max-w-md space-y-3 rounded-xl border border-border p-4"
            >
              <h3 className="font-semibold text-foreground">
                {managementAction === 'regenerate'
                  ? 'Create new recovery codes'
                  : 'Disable authenticator protection'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Confirm both your password and current authenticator code. This is a sensitive
                account change.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="manage-password">Current password</Label>
                <Input
                  id="manage-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manage-code">Current six-digit code</Label>
                <Input
                  id="manage-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant={managementAction === 'disable' ? 'destructive' : 'default'}
                  disabled={busy}
                >
                  <LockKeyhole className="size-4" />{' '}
                  {busy ? 'Confirming…' : 'Confirm security change'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setManagementAction(undefined)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </PagePanel>
      </PageSection>
    </AdminPage>
  );
}
