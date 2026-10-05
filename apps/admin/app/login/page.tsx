'use client';

import { type FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      const safeRedirect =
        rawRedirect &&
        rawRedirect.startsWith('/') &&
        !rawRedirect.startsWith('//') &&
        !rawRedirect.startsWith('/\\') &&
        !rawRedirect.includes(':')
          ? rawRedirect.startsWith('/admin')
            ? rawRedirect
            : `/admin${rawRedirect}`
          : '/admin';

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
          ? `/admin/two-factor?redirect=${encodeURIComponent(safeRedirect)}`
          : '/admin/two-factor';
        window.location.assign(dest);
        return;
      }
      const context = await fetch('/api/admin/context', { credentials: 'include' });
      if (!context.ok) {
        setMessage('Your identity is authenticated, but it has no active Maevelle membership.');
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
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* Brand Introduction Section */}
      <section className="hidden lg:flex flex-col justify-between p-12 lg:p-16 bg-muted/40 border-r border-border relative overflow-hidden">
        {/* Subtle Brand Background Accent */}
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
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Internal workspace</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
              Run the day with clarity.
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Orders, stock, supply, payments, delivery, finance, and integrity—connected to one authoritative operating system.
            </p>
          </div>

          <ul className="space-y-3 pt-2">
            <li className="flex items-center gap-2.5 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-primary shrink-0" />
              <span>Action-first operating queues</span>
            </li>
            <li className="flex items-center gap-2.5 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-primary shrink-0" />
              <span>Organization & capability scoped permissions</span>
            </li>
            <li className="flex items-center gap-2.5 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-primary shrink-0" />
              <span>Transaction-safe business operations</span>
            </li>
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary shrink-0" />
          <span>Restricted to authorized Maevelle operators.</span>
        </div>
      </section>

      {/* Form Section */}
      <section className="flex flex-col items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm shadow-xs">
              M
            </div>
            <div className="flex flex-col leading-tight">
              <strong className="text-sm font-bold text-foreground">Maevelle</strong>
              <span className="text-xs text-muted-foreground">Business operations</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 text-card-foreground shadow-sm space-y-6">
            <div className="space-y-1.5">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 border border-primary/20">
                <LockKeyhole className="size-5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Welcome back</p>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in to Admin</h2>
              <p className="text-xs text-muted-foreground">Use your invited internal account to continue.</p>
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
                  autoFocus
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

              <Button type="submit" disabled={submitting} className="w-full h-10 mt-2 font-medium">
                {submitting ? 'Signing in…' : 'Sign in securely'}
                {!submitting ? <ArrowRight className="size-4 ml-1.5" /> : null}
              </Button>
            </form>

            {message ? (
              <div
                className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 font-medium"
                role="alert"
              >
                {message}
              </div>
            ) : null}

            <p className="text-[11px] text-center text-muted-foreground pt-2">
              Authentication, session policies, and audit logging are enforced by Maevelle Security.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
