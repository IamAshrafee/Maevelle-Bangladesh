'use client';

import { type FormEvent, useState } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ChallengeMode = 'totp' | 'recovery';

export default function TwoFactorChallengePage() {
  const [mode, setMode] = useState<ChallengeMode>('totp');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(undefined);
    try {
      const response = await fetch(
        mode === 'totp'
          ? '/api/auth/two-factor/verify-totp'
          : '/api/auth/two-factor/verify-backup-code',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code: code.trim(), trustDevice: false }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          { message?: string; code?: string } | undefined;
        setMessage(
          payload?.code === 'ACCOUNT_TEMPORARILY_LOCKED'
            ? 'Too many incorrect attempts. Wait for the temporary security lock to expire, then try again.'
            : 'That code could not be verified. Check the code and try again.',
        );
        return;
      }
      const context = await fetch('/api/admin/context', { credentials: 'include' });
      if (!context.ok) {
        setMessage('Your identity is verified, but it has no active Maevelle membership.');
        return;
      }
      window.location.assign('/admin');
    } catch {
      setMessage('Maevelle could not verify the code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="w-full space-y-5 rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8">
          <div className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary-subtle text-primary">
            {mode === 'totp' ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Second step
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {mode === 'totp' ? 'Enter your authenticator code' : 'Use a recovery code'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'totp'
                ? 'Open your authenticator app and enter the current six-digit Maevelle code.'
                : 'Enter one unused recovery code. It will be permanently consumed after sign-in.'}
            </p>
          </div>

          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="two-factor-code">
                {mode === 'totp' ? 'Six-digit code' : 'Recovery code'}
              </Label>
              <Input
                id="two-factor-code"
                name="code"
                inputMode={mode === 'totp' ? 'numeric' : 'text'}
                autoComplete="one-time-code"
                pattern={mode === 'totp' ? '[0-9]{6}' : undefined}
                maxLength={mode === 'totp' ? 6 : 64}
                required
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={submitting}>
              <LockKeyhole className="size-4" />
              {submitting ? 'Verifying…' : 'Verify and continue'}
            </Button>
          </form>

          {message ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {message}
            </p>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setMode((current) => (current === 'totp' ? 'recovery' : 'totp'));
              setCode('');
              setMessage(undefined);
            }}
          >
            {mode === 'totp' ? 'Use a recovery code instead' : 'Use authenticator code instead'}
          </Button>
        </div>
      </section>
    </main>
  );
}
