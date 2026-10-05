'use client';

import { Suspense, type FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Clock,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TotpCodeInput } from '@/components/security/totp-code-input';

type ChallengeMode = 'totp' | 'recovery';

function getSafeRedirect(rawRedirect: string | null): string {
  if (!rawRedirect) return '/admin';
  // Prevent protocol-relative URLs (//evil.com) and backslash bypasses (/\evil.com)
  if (!rawRedirect.startsWith('/') || rawRedirect.startsWith('//') || rawRedirect.startsWith('/\\')) {
    return '/admin';
  }
  // Prevent javascript: or other URL schemes
  if (rawRedirect.includes(':')) {
    return '/admin';
  }
  if (rawRedirect.startsWith('/admin')) {
    return rawRedirect;
  }
  return `/admin${rawRedirect}`;
}

function TwoFactorChallengeContent() {
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const safeRedirect = getSafeRedirect(rawRedirect);

  const [mode, setMode] = useState<ChallengeMode>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  async function handleVerify(codeToSubmit?: string) {
    const code = (codeToSubmit ?? (mode === 'totp' ? totpCode : recoveryCode)).trim();
    if (!code) return;
    if (mode === 'totp' && code.length !== 6) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        mode === 'totp'
          ? '/api/auth/two-factor/verify-totp'
          : '/api/auth/two-factor/verify-backup-code',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, trustDevice: false }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          | { message?: string; code?: string }
          | undefined;

        if (payload?.code === 'ACCOUNT_TEMPORARILY_LOCKED') {
          setIsLocked(true);
          setMessage(
            'Too many incorrect attempts. For security, verification is temporarily locked. Wait a few minutes or use an unused recovery code.',
          );
        } else if (
          payload?.code === 'INVALID_TOTP' ||
          payload?.code === 'INVALID_BACKUP_CODE' ||
          payload?.code === 'INVALID_CODE'
        ) {
          setShowTroubleshooting(true);
          setMessage(
            mode === 'totp'
              ? 'That verification code is not valid. Check the code in your authenticator app and try again.'
              : 'That recovery code is not valid or has already been used. Please try another code.',
          );
        } else {
          setMessage(
            payload?.message ??
              'The verification code could not be confirmed. Please try again.',
          );
        }
        return;
      }

      // Check admin context
      const context = await fetch('/api/admin/context', { credentials: 'include' });
      if (!context.ok) {
        setMessage('Your identity is verified, but has no active Maevelle membership.');
        return;
      }

      window.location.assign(safeRedirect);
    } catch {
      setMessage('Unable to connect to Maevelle. Check your network connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    } finally {
      window.location.assign('/admin/login');
    }
  };

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* Brand Section */}
      <section className="hidden lg:flex flex-col justify-between p-12 lg:p-16 bg-muted/40 border-r border-border relative overflow-hidden">
        <div className="absolute -top-32 -left-32 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center text-base shadow-xs tracking-tight">
            M
          </div>
          <div className="flex flex-col leading-tight">
            <strong className="text-base font-bold tracking-tight text-foreground">Maevelle</strong>
            <span className="text-xs text-muted-foreground font-normal">Business operations</span>
          </div>
        </div>

        <div className="relative space-y-6 max-w-lg my-auto py-12">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Identity Verification
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
              Two-factor protection.
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every Maevelle administrator account is secured with multi-factor verification to safeguard customer privacy, financial operations, and inventory records.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-3 backdrop-blur-xs text-xs">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <ShieldCheck className="size-4 text-primary" />
              <span>Cryptographic time-based verification</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Codes are calculated locally on your device without cellular network reliance.
            </p>
          </div>
        </div>

        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4 text-primary" />
            <span>Encrypted administrative session.</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </section>

      {/* Challenge Form Section */}
      <section className="flex flex-col items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm shadow-xs">
                M
              </div>
              <div className="flex flex-col leading-tight">
                <strong className="text-sm font-bold text-foreground">Maevelle</strong>
                <span className="text-xs text-muted-foreground">Identity verification</span>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-xs text-muted-foreground"
            >
              <LogOut className="size-3.5 mr-1" /> Sign out
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 text-card-foreground shadow-sm space-y-6">
            <div className="space-y-1.5">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 border border-primary/20">
                {mode === 'totp' ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Step 2 of 2
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {mode === 'totp' ? 'Authenticator verification' : 'Use a recovery code'}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {mode === 'totp'
                  ? 'Enter the 6-digit code shown in your authenticator app.'
                  : 'Enter one of your saved recovery codes. Each code can only be used once.'}
              </p>
            </div>

            {/* Error Message */}
            {message && (
              <div
                role="alert"
                className={`p-3.5 rounded-lg border text-xs leading-relaxed font-medium flex items-start gap-2.5 ${
                  isLocked
                    ? 'border-warning/30 bg-warning/10 text-warning'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                }`}
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{message}</span>
              </div>
            )}

            {mode === 'totp' ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="challenge-totp-input" className="text-xs font-medium block text-center">
                    Six-digit code
                  </Label>
                  <TotpCodeInput
                    id="challenge-totp-input"
                    value={totpCode}
                    onChange={(val) => {
                      setTotpCode(val);
                      setMessage(null);
                    }}
                    onComplete={(val) => {
                      void handleVerify(val);
                    }}
                    disabled={submitting || isLocked}
                    hasError={Boolean(message)}
                    autoFocus
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={submitting || totpCode.length !== 6 || isLocked}
                  className="w-full h-10 font-medium text-xs gap-1.5"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" /> Verifying code…
                    </>
                  ) : (
                    <>
                      Verify and continue <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>

                {/* Clock Drift Troubleshooting */}
                {showTroubleshooting && (
                  <div className="p-3 rounded-lg border border-border/80 bg-muted/30 text-[11px] text-muted-foreground space-y-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Clock className="size-3 text-primary" />
                      Tip for verification codes:
                    </span>
                    <p className="leading-relaxed">
                      Make sure automatic date and time are enabled on your phone, then try the newest code shown in your authenticator app.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <form
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void handleVerify();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="challenge-recovery-input" className="text-xs font-medium">
                    Recovery code
                  </Label>
                  <Input
                    id="challenge-recovery-input"
                    name="recovery-code"
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. ABCD-EFGH"
                    value={recoveryCode}
                    onChange={(e) => {
                      setRecoveryCode(e.target.value);
                      setMessage(null);
                    }}
                    className="font-mono tabular-nums text-sm h-10 uppercase"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Format: 8–16 characters. Spaces and hyphens will be normalized.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={submitting || !recoveryCode.trim()}
                  className="w-full h-10 font-medium text-xs gap-1.5"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" /> Verifying recovery code…
                    </>
                  ) : (
                    <>
                      Verify recovery code <ArrowRight className="size-3.5" />
                    </>
                  )}
                </Button>
              </form>
            )}

            {/* Alternates & Recovery */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs h-8 text-primary hover:text-primary hover:bg-primary/10"
                onClick={() => {
                  setMode((prev) => (prev === 'totp' ? 'recovery' : 'totp'));
                  setTotpCode('');
                  setRecoveryCode('');
                  setMessage(null);
                }}
              >
                {mode === 'totp'
                  ? 'Use a recovery code instead'
                  : 'Use authenticator verification code instead'}
              </Button>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <button
                  type="button"
                  onClick={() => setHelpDialogOpen(true)}
                  className="hover:text-foreground text-[11px] flex items-center gap-1 underline underline-offset-3"
                >
                  <HelpCircle className="size-3" /> Lost access to authenticator?
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="hover:text-foreground text-[11px] flex items-center gap-1"
                >
                  <ArrowLeft className="size-3" /> Back to sign in
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lost Authenticator Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Lost access to your authenticator?
            </DialogTitle>
            <DialogDescription>
              Available legitimate recovery options for your Maevelle account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 text-xs text-muted-foreground py-2 leading-relaxed">
            <div className="space-y-1 rounded-lg border border-border/80 bg-muted/30 p-3">
              <strong className="text-foreground block">Option 1: Use a Recovery Code</strong>
              <p>
                When you set up two-factor authentication, Maevelle provided a set of recovery codes. You can select <strong>&quot;Use a recovery code instead&quot;</strong> and sign in using one of those codes.
              </p>
            </div>

            <div className="space-y-1 rounded-lg border border-border/80 bg-muted/30 p-3">
              <strong className="text-foreground block">Option 2: Contact an Administrator</strong>
              <p>
                If you no longer have access to both your authenticator app and recovery codes, contact an authorized Maevelle organization administrator with security reset privileges. They can verify your identity and safely reset your two-factor configuration.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground italic">
              Note: For security reasons, Maevelle support cannot bypass or disable two-factor authentication over email or chat.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default function TwoFactorChallengePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <RefreshCw className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <TwoFactorChallengeContent />
    </Suspense>
  );
}
