'use client';

import { type FormEvent, useState } from 'react';

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
    <main>
      <section className="shell">
        <h1>Maevelle Admin</h1>
        <p>Sign in with your invited internal account.</p>
        <form onSubmit={signIn}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
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
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {message ? <p role="alert">{message}</p> : null}
      </section>
    </main>
  );
}
