'use client';

import { type FormEvent, useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';

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
      const context = await fetch('/api/admin/context', { credentials: 'include' });
      if (!context.ok) {
        setMessage('Your identity is authenticated, but it has no active Maevelle membership.');
        return;
      }
      window.location.assign('/admin');
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
          <p className="eyebrow">Internal workspace</p>
          <h1>Run the day with clarity.</h1>
          <p>
            Orders, stock, supply, payments, delivery, finance, and integrity—connected to one
            authoritative operating system.
          </p>
        </div>
        <ul>
          <li>
            <CheckCircle2 /> Action-first operating queues
          </li>
          <li>
            <CheckCircle2 /> Organization and capability scoped
          </li>
          <li>
            <CheckCircle2 /> Transaction-safe business commands
          </li>
        </ul>
        <small className="login-security-note">
          <ShieldCheck /> Restricted to invited Maevelle team members.
        </small>
      </section>
      <section className="login-form-panel">
        <div className="login-form-card">
          <div className="login-icon">
            <LockKeyhole />
          </div>
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to Admin</h2>
          <p>Use your invited internal account to continue.</p>
          <form onSubmit={signIn}>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in securely'}
              {!submitting ? <ArrowRight /> : null}
            </button>
          </form>
          {message ? (
            <p className="login-error" role="alert">
              {message}
            </p>
          ) : null}
          <small>Authentication, MFA, and session policy are enforced by Maevelle Security.</small>
        </div>
      </section>
    </main>
  );
}
