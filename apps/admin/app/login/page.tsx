'use client';

import { type FormEvent, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { AuthSplitShell } from '@/components/auth/auth-split-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeAdminReturnUrl } from '@/lib/auth/access-policy';
import { toBrowserUrl } from '@/lib/navigation/route-registry';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setMessage(undefined);
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const rawRedirect = searchParams.get('redirect');
      const safeRedirect = safeAdminReturnUrl(rawRedirect);

      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setMessage('Unable to sign in. Check your credentials and try again.');
        return;
      }
      const result = (await response.json()) as { twoFactorRedirect?: boolean };
      if (result.twoFactorRedirect) {
        const dest = rawRedirect
          ? toBrowserUrl(`/two-factor?redirect=${encodeURIComponent(safeRedirect)}`)
          : toBrowserUrl('/two-factor');
        window.location.assign(dest);
        return;
      }
      const context = await fetch('/api/admin/context', { credentials: 'include' });
      if (!context.ok) {
        setMessage(
          context.status === 403
            ? 'Your account has no active Maevelle Admin membership.'
            : context.status === 401
              ? 'Your session could not be established. Please sign in again.'
              : 'Maevelle could not verify your access. Please try again.',
        );
        return;
      }
      window.location.assign(safeRedirect);
    } catch {
      setMessage('Unable to reach Maevelle. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitShell
      eyebrow="Internal workspace"
      heading="Run the day with clarity."
      summary="Orders, stock, supply, payments, delivery, finance, and integrity—connected to one authoritative operating system."
      bullets={[
        'Action-first operating queues',
        'Organization & capability scoped permissions',
        'Transaction-safe business operations',
      ]}
      securityNote="Restricted to authorized Maevelle operators."
    >
      <div className="space-y-1.5">
        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 border border-primary/20">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Welcome back</p>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in to Admin</h2>
        <p className="text-xs text-muted-foreground">
          Use your invited internal account to continue.
        </p>
      </div>

      <form onSubmit={signIn} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="operator@maevelle.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 md:h-10 mt-2 font-medium"
        >
          {submitting ? 'Signing in…' : 'Sign in securely'}
          {!submitting ? <ArrowRight className="size-4 ml-1.5" aria-hidden="true" /> : null}
        </Button>
      </form>

      {message ? (
        <div
          className="p-3 rounded-lg border border-destructive/30 bg-destructive-subtle text-xs text-destructive font-medium"
          role="alert"
        >
          {message}
        </div>
      ) : null}

      <p className="text-[11px] text-center text-muted-foreground pt-2">
        Authentication, session policies, and audit logging are enforced by Maevelle Security.
      </p>
    </AuthSplitShell>
  );
}
