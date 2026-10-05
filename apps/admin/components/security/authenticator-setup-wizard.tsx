'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import type { ApiEnvelope } from '@maevelle/contracts';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TotpCodeInput } from './totp-code-input';
import { RecoveryCodesPanel } from './recovery-codes-panel';

export type SetupStep =
  | 'intro'
  | 'confirm_identity'
  | 'scan_qr'
  | 'verify_code'
  | 'save_recovery'
  | 'success';

interface EnrollmentData {
  readonly totpUri: string;
  readonly setupKey: string;
  readonly issuer: string;
}

export interface AuthenticatorSetupWizardProps {
  readonly userEmail?: string | undefined;
  readonly isMandatory?: boolean | undefined;
  readonly onComplete: () => void;
  readonly onCancel?: (() => void) | undefined;
  readonly className?: string | undefined;
}

export function AuthenticatorSetupWizard({
  userEmail,
  isMandatory = false,
  onComplete,
  onCancel,
  className,
}: AuthenticatorSetupWizardProps) {
  const [step, setStep] = useState<SetupStep>('intro');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showManualKey, setShowManualKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedVerification, setHasAttemptedVerification] = useState(false);
  const [showTimeHelp, setShowTimeHelp] = useState(false);

  // Generate QR code locally from enrollment URI when available
  useEffect(() => {
    let active = true;
    if (!enrollment?.totpUri) {
      setQrDataUrl(null);
      return;
    }

    void import('qrcode').then(async ({ default: QRCode }) => {
      try {
        const url = await QRCode.toDataURL(enrollment.totpUri, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 280,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
        if (active) setQrDataUrl(url);
      } catch {
        if (active) setQrDataUrl(null);
      }
    });

    return () => {
      active = false;
    };
  }, [enrollment]);

  // Clean sensitive state on unmount
  useEffect(() => {
    return () => {
      setPassword('');
      setTotpCode('');
      setEnrollment(null);
      setRecoveryCodes(null);
    };
  }, []);

  // Step 2: Confirm password & begin enrollment
  const handleBeginEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<ApiEnvelope<EnrollmentData>>(
        '/admin/security/two-factor/enrollment',
        {
          method: 'POST',
          body: JSON.stringify({ password }),
        },
      );

      setEnrollment(response.data);
      setPassword('');
      setStep('scan_qr');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 401 || err.code === 'INVALID_PASSWORD') {
          setError('Incorrect password. Please verify your current password.');
        } else if (err.code === 'TWO_FACTOR_ALREADY_ENABLED') {
          setError('Two-factor authentication is already enabled for this account.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Unable to initiate two-factor enrollment. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Verify first TOTP code
  const handleVerifyEnrollment = async (codeToVerify = totpCode) => {
    if (codeToVerify.length !== 6) return;

    setLoading(true);
    setError(null);
    setHasAttemptedVerification(true);

    try {
      const response = await apiRequest<
        ApiEnvelope<{ enabled: true; backupCodes: readonly string[] }>
      >('/admin/security/two-factor/enrollment/verify', {
        method: 'POST',
        body: JSON.stringify({ code: codeToVerify }),
      });

      setRecoveryCodes(response.data.backupCodes);
      setEnrollment(null);
      setTotpCode('');
      setStep('save_recovery');
    } catch (err) {
      setShowTimeHelp(true);
      if (err instanceof ApiRequestError) {
        if (err.status === 400 || err.code === 'INVALID_TOTP' || err.code === 'INVALID_CODE') {
          setError('That verification code is not valid. Check the code in your authenticator app and try again.');
        } else if (err.code === 'ACCOUNT_TEMPORARILY_LOCKED') {
          setError('Too many unsuccessful attempts. Verification is temporarily locked for security. Please try again later.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Verification failed. Check your network connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopySetupKey = async () => {
    if (!enrollment?.setupKey) return;
    try {
      await navigator.clipboard.writeText(enrollment.setupKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } catch {
      // Ignore
    }
  };

  return (
    <div className={`space-y-6 ${className ?? ''}`}>
      {/* Progress Indicator */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Authenticator App Setup
            </h2>
            <p className="text-xs text-muted-foreground">
              {step === 'intro' && 'Step 1 of 5: Overview'}
              {step === 'confirm_identity' && 'Step 2 of 5: Confirm identity'}
              {step === 'scan_qr' && 'Step 3 of 5: Scan QR code'}
              {step === 'verify_code' && 'Step 4 of 5: Verify code'}
              {step === 'save_recovery' && 'Step 5 of 5: Save recovery codes'}
              {step === 'success' && 'Setup complete'}
            </p>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {(['intro', 'confirm_identity', 'scan_qr', 'verify_code', 'save_recovery'] as const).map(
            (s, index) => {
              const stepIndex = [
                'intro',
                'confirm_identity',
                'scan_qr',
                'verify_code',
                'save_recovery',
                'success',
              ].indexOf(step);
              const isActive = stepIndex === index;
              const isPast = stepIndex > index;

              return (
                <div
                  key={s}
                  className={`size-2 rounded-full transition-colors duration-150 ${
                    isActive
                      ? 'bg-primary scale-125'
                      : isPast
                        ? 'bg-primary/50'
                        : 'bg-muted-foreground/30'
                  }`}
                />
              );
            },
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-start gap-2.5"
        >
          <div className="size-4 shrink-0 mt-0.5">⚠️</div>
          <div className="flex-1 leading-relaxed font-medium">{error}</div>
        </div>
      )}

      {/* STEP 1: INTRO */}
      {step === 'intro' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">
              Protect your account with an Authenticator App
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When you sign in to Maevelle, you will enter a temporary 6-digit verification code generated on your phone in addition to your password.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-border/80 bg-card p-4 space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <Smartphone className="size-4" />
                <span>Works on any smartphone</span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Use Google Authenticator, Microsoft Authenticator, Apple Passwords, 1Password, or any standard TOTP app.
              </p>
            </div>

            <div className="rounded-xl border border-border/80 bg-card p-4 space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <Clock className="size-4" />
                <span>Works without internet</span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Codes are generated directly on your device. You do not need SMS or cellular reception to log in.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-1">
            <span className="font-semibold text-foreground">What you will need:</span>
            <p className="text-[11px]">
              Your phone or tablet with an authenticator app installed, and your current Maevelle account password.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            {onCancel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {isMandatory ? 'Return to sign in' : 'Cancel'}
              </Button>
            ) : <div />}

            <Button
              type="button"
              onClick={() => {
                setError(null);
                setStep('confirm_identity');
              }}
              className="h-9 text-xs font-semibold gap-1.5"
            >
              Continue <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: CONFIRM IDENTITY */}
      {step === 'confirm_identity' && (
        <form onSubmit={handleBeginEnrollment} className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Confirm your identity
            </h3>
            <p className="text-xs text-muted-foreground">
              Enter your current account password to begin authenticator setup.
            </p>
          </div>

          <div className="space-y-1.5 max-w-md">
            <Label htmlFor="setup-password" className="text-xs font-medium">
              Current password
            </Label>
            <div className="relative">
              <Input
                id="setup-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your current password"
                className="pr-10 text-xs h-9"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setPassword('');
                setStep('intro');
              }}
              className="text-xs gap-1.5"
            >
              <ArrowLeft className="size-3.5" /> Back
            </Button>

            <Button
              type="submit"
              disabled={loading || !password}
              className="h-9 text-xs font-semibold gap-1.5"
            >
              {loading ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" /> Verifying…
                </>
              ) : (
                <>
                  Verify and continue <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* STEP 3: SCAN QR CODE */}
      {step === 'scan_qr' && enrollment && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Scan the QR code
            </h3>
            <p className="text-xs text-muted-foreground">
              Open your authenticator app, tap the add (+) button, and scan this QR code with your camera.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl border border-border/80 bg-card shadow-2xs">
            {/* High-contrast QR Container (Always white background for phone camera compatibility) */}
            <div className="flex size-60 sm:size-64 shrink-0 items-center justify-center rounded-xl bg-white p-3 border-2 border-slate-200 shadow-xs">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  width={240}
                  height={240}
                  alt="Maevelle Authenticator Setup QR Code"
                  className="rounded-lg"
                  unoptimized
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
                  <RefreshCw className="size-6 animate-spin text-primary" />
                  <span>Generating secure QR…</span>
                </div>
              )}
            </div>

            <div className="space-y-3 text-xs flex-1">
              <div className="space-y-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <QrCode className="size-4 text-primary" />
                  Scan instructions:
                </span>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-[11px] leading-relaxed">
                  <li>Open Google Authenticator or your preferred app.</li>
                  <li>Select <strong>Add account</strong> or tap <strong>+</strong>.</li>
                  <li>Point your phone&apos;s camera at this screen.</li>
                </ol>
              </div>

              {/* Collapsible Manual Setup Key */}
              <div className="pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setShowManualKey((prev) => !prev)}
                  className="text-primary hover:underline text-xs font-medium flex items-center gap-1"
                >
                  <KeyRound className="size-3.5" />
                  {showManualKey
                    ? 'Hide manual setup key'
                    : "Can't scan or on this phone? Enter key manually"}
                </button>

                {showManualKey && (
                  <div className="mt-2.5 p-3 rounded-lg border border-border bg-muted/40 space-y-2 text-xs">
                    <span className="text-[11px] text-muted-foreground block">
                      Account name: <strong>{userEmail ?? 'Maevelle'}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-xs tabular-nums p-2 bg-card rounded border border-border break-all select-all text-foreground font-semibold">
                        {enrollment.setupKey}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopySetupKey}
                        className="h-8 shrink-0 text-xs gap-1"
                      >
                        {copiedKey ? (
                          <>
                            <Check className="size-3 text-success" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" /> Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-warning flex items-center gap-1 font-medium">
                      ⚠️ Keep this key private. Never share it with anyone.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setStep('confirm_identity');
              }}
              className="text-xs gap-1.5"
            >
              <ArrowLeft className="size-3.5" /> Back
            </Button>

            <Button
              type="button"
              onClick={() => {
                setError(null);
                setStep('verify_code');
              }}
              className="h-9 text-xs font-semibold gap-1.5"
            >
              I&apos;ve scanned it <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: VERIFY CODE */}
      {step === 'verify_code' && (
        <div className="space-y-5">
          <div className="space-y-1 text-center max-w-sm mx-auto">
            <h3 className="text-base font-semibold text-foreground">
              Enter the verification code
            </h3>
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit verification code currently displayed in your authenticator app.
            </p>
          </div>

          <div className="py-2">
            <TotpCodeInput
              value={totpCode}
              onChange={(val) => {
                setTotpCode(val);
                setError(null);
              }}
              onComplete={(val) => {
                void handleVerifyEnrollment(val);
              }}
              disabled={loading}
              hasError={Boolean(error)}
              autoFocus
            />
          </div>

          {/* Time synchronization / troubleshoot helper */}
          {showTimeHelp && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 text-xs space-y-1.5 max-w-md mx-auto">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <HelpCircle className="size-3.5 text-primary" />
                Having trouble verifying the code?
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Verification codes change every 30 seconds and require accurate clock synchronization. Ensure your device&apos;s date and time are set to <strong>Automatic</strong>, then enter the newest code shown.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setStep('scan_qr');
              }}
              className="text-xs gap-1.5"
            >
              <ArrowLeft className="size-3.5" /> Scan QR again
            </Button>

            <Button
              type="button"
              disabled={loading || totpCode.length !== 6}
              onClick={() => void handleVerifyEnrollment()}
              className="h-9 text-xs font-semibold gap-1.5"
            >
              {loading ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" /> Verifying…
                </>
              ) : (
                <>
                  Verify code <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5: SAVE RECOVERY CODES */}
      {step === 'save_recovery' && recoveryCodes && (
        <div className="space-y-4">
          <RecoveryCodesPanel
            codes={recoveryCodes}
            userEmail={userEmail}
            requireAcknowledgement={true}
            confirmLabel="Finish setup"
            onConfirmed={() => {
              setStep('success');
            }}
          />
        </div>
      )}

      {/* STEP 6: SUCCESS */}
      {step === 'success' && (
        <div className="space-y-5 text-center py-4">
          <div className="size-12 rounded-full bg-success/15 text-success mx-auto flex items-center justify-center">
            <CheckCircle2 className="size-6" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              Two-factor authentication is enabled
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Your Maevelle account is now protected with an Authenticator App. You will be asked for a verification code when signing in.
            </p>
          </div>

          <div className="pt-3">
            <Button
              type="button"
              onClick={onComplete}
              className="h-9 px-6 text-xs font-semibold"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
