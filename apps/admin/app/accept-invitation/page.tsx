'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

type AcceptanceState =
  | { kind: 'form' }
  | { kind: 'accepted' }
  | { kind: 'already_accepted' }
  | { kind: 'expired'; message: string }
  | { kind: 'revoked'; message: string }
  | { kind: 'invalid'; message: string };

function InvitationAcceptanceForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [state, setState] = useState<AcceptanceState>({ kind: 'form' });
  const [submitting, setSubmitting] = useState(false);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(undefined);
    if (!token) {
      setState({
        kind: 'invalid',
        message: 'This invitation link is missing the required security token. Please ask an administrator to resend it.',
      });
      return;
    }
    if (password && password !== confirmation) {
      setErrorMessage('The password confirmation does not match.');
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
        data?: { alreadyAccepted?: boolean; expired?: boolean };
        error?: { code?: string; message?: string };
      };

      if (!response.ok) {
        const code = payload.error?.code;
        const msg = payload.error?.message ?? 'The invitation could not be accepted.';
        if (code === 'INVITATION_EXPIRED') {
          setState({
            kind: 'expired',
            message: msg || 'This invitation has passed its validity window and can no longer be used.',
          });
          return;
        }
        if (code === 'INVITATION_REVOKED') {
          setState({
            kind: 'revoked',
            message: msg || 'This invitation was revoked by an administrator before it was accepted.',
          });
          return;
        }
        if (code === 'INVITATION_INVALID' || response.status === 404) {
          setState({
            kind: 'invalid',
            message: 'This invitation token is invalid or does not exist.',
          });
          return;
        }
        setErrorMessage(msg);
        return;
      }

      if (payload.data?.expired) {
        setState({
          kind: 'expired',
          message: 'This invitation has expired. Please ask your administrator to send a new invitation.',
        });
        return;
      }

      if (payload.data?.alreadyAccepted) {
        setState({ kind: 'already_accepted' });
        return;
      }

      setState({ kind: 'accepted' });
    } catch {
      setErrorMessage('Unable to reach Maevelle. Please check your network and try again.');
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
          {state.kind === 'accepted' && (
            <>
              <div className="login-icon text-emerald-600"><CheckCircle2 className="h-8 w-8" /></div>
              <p className="eyebrow">Invitation accepted</p>
              <h2>Your membership is active</h2>
              <p>Sign in with your invited email address to access your organization workspace.</p>
              <Link href="/login" className="button primary mt-4 inline-flex items-center justify-center">
                Continue to sign in
              </Link>
            </>
          )}

          {state.kind === 'already_accepted' && (
            <>
              <div className="login-icon text-blue-600"><UserCheck className="h-8 w-8" /></div>
              <p className="eyebrow">Already activated</p>
              <h2>Membership already accepted</h2>
              <p>This invitation was previously accepted. You can sign in directly to your account.</p>
              <Link href="/login" className="button primary mt-4 inline-flex items-center justify-center">
                Sign in to your account
              </Link>
            </>
          )}

          {state.kind === 'expired' && (
            <>
              <div className="login-icon text-amber-600"><Clock className="h-8 w-8" /></div>
              <p className="eyebrow text-amber-600">Invitation expired</p>
              <h2>Link no longer valid</h2>
              <p>{state.message}</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                Please ask your organization administrator or Owner to reissue an invitation to your email.
              </div>
              <Link href="/login" className="button secondary mt-4 inline-flex items-center justify-center">
                Return to sign in
              </Link>
            </>
          )}

          {state.kind === 'revoked' && (
            <>
              <div className="login-icon text-rose-600"><ShieldAlert className="h-8 w-8" /></div>
              <p className="eyebrow text-rose-600">Access revoked</p>
              <h2>Invitation was cancelled</h2>
              <p>{state.message}</p>
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
                This invitation was recalled by an administrator. If you believe this is in error, contact your team lead.
              </div>
              <Link href="/login" className="button secondary mt-4 inline-flex items-center justify-center">
                Return to sign in
              </Link>
            </>
          )}

          {state.kind === 'invalid' && (
            <>
              <div className="login-icon text-rose-600"><AlertTriangle className="h-8 w-8" /></div>
              <p className="eyebrow text-rose-600">Invalid link</p>
              <h2>Invitation not found</h2>
              <p>{state.message}</p>
              <Link href="/login" className="button secondary mt-4 inline-flex items-center justify-center">
                Return to sign in
              </Link>
            </>
          )}

          {state.kind === 'form' && (
            <>
              <div className="login-icon"><KeyRound /></div>
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
                  placeholder="At least 12 characters (optional if existing user)"
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
                  placeholder="Re-enter password"
                  onChange={(event) => setConfirmation(event.target.value)}
                />
                <button type="submit" disabled={submitting || !token}>
                  {submitting ? 'Activating…' : 'Accept invitation securely'}
                </button>
              </form>
              {errorMessage ? <p className="login-error" role="alert">{errorMessage}</p> : null}
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
