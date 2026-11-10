'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { safeAdminReturnUrl } from '@/lib/auth/access-policy';

export function AdminAccessFeedback({
  reason,
  returnTo = '/admin',
}: {
  reason: 'ACCESS_DENIED' | 'AUTH_UNAVAILABLE' | 'CHECKING';
  returnTo?: string;
}) {
  const checking = reason === 'CHECKING';
  const denied = reason === 'ACCESS_DENIED';
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string>();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <section
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground"
        aria-busy={checking}
      >
        <p className="text-sm font-semibold text-primary">Maevelle</p>
        <h1 className="text-xl font-semibold">
          {checking
            ? 'Checking your session…'
            : denied
              ? 'Access denied'
              : 'Unable to verify your session'}
        </h1>
        <p className="text-sm text-muted-foreground" role="status">
          {checking
            ? 'Please wait while we confirm your access.'
            : denied
              ? 'Your account does not currently have access to this workspace. Contact your organization owner if you need access.'
              : 'Maevelle could not confirm your access. Please try again.'}
        </p>
        {!checking ? (
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                window.location.assign(denied ? '/admin' : safeAdminReturnUrl(returnTo))
              }
            >
              {denied ? 'Go to dashboard' : 'Retry'}
            </Button>
            <Button
              variant="outline"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                setMessage(undefined);
                try {
                  const response = await fetch('/api/auth/sign-out', {
                    method: 'POST',
                    credentials: 'include',
                  });
                  if (!response.ok) throw new Error('Sign out unavailable');
                  window.location.assign('/admin/login');
                } catch {
                  setMessage('Unable to sign out. Please try again.');
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        ) : null}
        {message ? (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
