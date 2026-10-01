'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';

function InvitationAcceptanceForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    if (!token) {
      setMessage('This invitation link is incomplete. Ask an administrator to resend it.');
      return;
    }
    if (password && password !== confirmation) {
      setMessage('The password confirmation does not match.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, ...(password ? { password } : {}) }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(payload.error?.message ?? 'The invitation could not be accepted.');
        return;
      }
      setAccepted(true);
    } catch {
      setMessage('Unable to reach Maevelle. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="login-introduction">
        <div className="login-brand">
          <span>M</span>
          <div>
            <strong>Maevelle</strong>
            <small>Business operations</small>
          </div>
        </div>
        <div>
          <p className="eyebrow">Team invitation</p>
          <h1>Join with protected access.</h1>
          <p>Your administrator selected your capabilities and organization access before sending this link.</p>
        </div>
        <ul>
          <li><CheckCircle2 /> Invite-only administrator membership</li>
          <li><CheckCircle2 /> Server-enforced capabilities</li>
          <li><CheckCircle2 /> Audited access changes</li>
        </ul>
        <small className="login-security-note"><ShieldCheck /> Invitation links are single-use and expire automatically.</small>
      </section>
      <section className="login-form-panel">
        <div className="login-form-card">
          <div className="login-icon"><KeyRound /></div>
          {accepted ? (
            <>
              <p className="eyebrow">Invitation accepted</p>
              <h2>Your membership is active</h2>
              <p>Sign in with the invited email address to continue.</p>
              <Link href="/login" className="button primary">Continue to sign in</Link>
            </>
          ) : (
            <>
              <p className="eyebrow">Accept access</p>
              <h2>Activate your membership</h2>
              <p>
                If this is your first Maevelle membership, create a password. Existing Maevelle users can leave both password fields blank.
              </p>
              <form onSubmit={accept}>
                <label htmlFor="password">New password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <label htmlFor="confirmation">Confirm new password</label>
                <input
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
                <button type="submit" disabled={submitting || !token}>
                  {submitting ? 'Activating…' : 'Accept invitation securely'}
                </button>
              </form>
              {message ? <p className="login-error" role="alert">{message}</p> : null}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<main className="admin-login-page" aria-busy="true" />}>
      <InvitationAcceptanceForm />
    </Suspense>
  );
}
