'use client';

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { wishlistStore } from '@/features/wishlist/wishlist-store';

type Mode = 'sign-in' | 'register' | 'forgot' | 'reset';

async function authRequest(path: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`/api/shopper-auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const detail = error.error && typeof error.error === 'object'
      ? error.error as Record<string, unknown> : error;
    throw new Error(
      typeof detail.message === 'string' ? detail.message : 'The request could not be completed.',
    );
  }
  return value;
}

export function ShopperAccount() {
  const wishlist = useSyncExternalStore(wishlistStore.subscribe,
    wishlistStore.getSnapshot, wishlistStore.getServerSnapshot);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [token, setToken] = useState('');

  async function loadSession() {
    const response = await fetch('/api/storefront/v1/shopper/session', {
      credentials: 'include',
      cache: 'no-store',
    });
    setSignedIn(response.ok);
    setChecking(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'reset') setMode('reset');
    if (params.get('verified') === '1') setMessage('Email verified. Sign in to continue.');
    if (params.get('error')) setError('This link is invalid or expired. Request a new one.');
    const resetToken = params.get('token');
    setToken(resetToken ?? '');
    if (resetToken) window.history.replaceState(null, '', '/account?view=reset');
    void loadSession().catch(() => {
      setSignedIn(false);
      setChecking(false);
    });
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
    setPassword('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'register') {
        await authRequest('sign-up/email', {
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: `${window.location.origin}/account?verified=1`,
        });
        setMessage('Check your email for a verification link, then sign in.');
        setMode('sign-in');
      } else if (mode === 'sign-in') {
        await authRequest('sign-in/email', { email: email.trim(), password });
        await loadSession();
        await wishlistStore.afterSignIn();
        setMessage('You are signed in. Your saved products are synchronizing.');
      } else if (mode === 'forgot') {
        await authRequest('request-password-reset', {
          email: email.trim(),
          redirectTo: `${window.location.origin}/account?view=reset`,
        });
        setMessage('If this email has an account, a reset link is on its way.');
      } else {
        if (!token) throw new Error('This reset link is invalid or expired.');
        await authRequest('reset-password', { token, newPassword: password });
        setMessage('Password changed. Sign in with your new password.');
        setMode('sign-in');
        setToken('');
        window.history.replaceState(null, '', '/account');
      }
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await authRequest('sign-out', {});
      wishlistStore.signOut();
      setSignedIn(false);
      setPassword('');
      setMessage('You are signed out.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-out failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-[65vh] max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="rounded-2xl border border-border bg-surface-container-lowest p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Maevelle</p>
        <h1 className="mt-2 text-3xl font-semibold text-on-surface">Your account</h1>
        {checking ? (
          <p role="status" className="mt-6 text-on-surface-variant">
            Checking your session…
          </p>
        ) : signedIn ? (
          <>
            <p className="mt-5 text-on-surface-variant">
              You are signed in. Your saved products are private to your account.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-white"
                href="/wishlist"
              >
                View wishlist
              </Link>
              <Button disabled={busy} onClick={() => void signOut()} variant="outline">
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-on-surface-variant">
              {mode === 'register'
                ? 'Create an account to keep your favorites across devices.'
                : mode === 'forgot'
                  ? 'We will email a secure password reset link.'
                  : mode === 'reset'
                    ? 'Choose a new password for your account.'
                    : 'Sign in to access your private account wishlist.'}
            </p>
            <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)}>
              {mode === 'register' ? (
                <label className="block space-y-2 text-sm font-medium text-on-surface">
                  Name
                  <Input
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              ) : null}
              {mode !== 'reset' ? (
                <label className="block space-y-2 text-sm font-medium text-on-surface">
                  Email
                  <Input
                    autoComplete="email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
              ) : null}
              {mode !== 'forgot' ? (
                <label className="block space-y-2 text-sm font-medium text-on-surface">
                  {mode === 'reset' ? 'New password' : 'Password'}
                  <Input
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    type="password"
                    showPasswordToggle
                    required
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
              ) : null}
              <Button fullWidth loading={busy} type="submit">
                {mode === 'register'
                  ? 'Create account'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : mode === 'reset'
                      ? 'Change password'
                      : 'Sign in'}
              </Button>
            </form>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm">
              {mode !== 'sign-in' ? (
                <button
                  className="min-h-10 text-primary underline"
                  onClick={() => changeMode('sign-in')}
                  type="button"
                >
                  Sign in
                </button>
              ) : null}
              {mode !== 'register' ? (
                <button
                  className="min-h-10 text-primary underline"
                  onClick={() => changeMode('register')}
                  type="button"
                >
                  Create account
                </button>
              ) : null}
              {mode === 'sign-in' ? (
                <button
                  className="min-h-10 text-primary underline"
                  onClick={() => changeMode('forgot')}
                  type="button"
                >
                  Forgot password?
                </button>
              ) : null}
              {mode === 'sign-in' && email ? (
                <button
                  className="min-h-10 text-primary underline"
                  disabled={busy}
                  onClick={() =>
                    void authRequest('send-verification-email', {
                      email: email.trim(),
                      callbackURL: `${window.location.origin}/account?verified=1`,
                    })
                      .then(() => setMessage('If verification is needed, check your email.'))
                      .catch(() => setError('Verification email could not be sent. Try again.'))
                  }
                  type="button"
                >
                  Resend verification
                </button>
              ) : null}
            </div>
          </>
        )}
        {message ? (
          <p
            role="status"
            aria-live="polite"
            className="mt-5 rounded-lg bg-primary-subtle p-3 text-sm text-on-surface"
          >
            {message}
          </p>
        ) : null}
        {signedIn && wishlist.message ? (
          <p role={wishlist.sync === 'error' || wishlist.sync === 'conflicted' ? 'alert' : 'status'}
            className="mt-4 rounded-lg border border-border p-3 text-sm text-on-surface">
            {wishlist.message}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-error-container p-3 text-sm text-on-error-container"
          >
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
