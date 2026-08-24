'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
type Member = {
  id: string;
  name: string;
  email: string;
  two_factor_enabled: boolean;
  membership_type: string;
  status: string;
  capabilities: readonly string[];
};
async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok)
    throw new Error(
      ((await response.json().catch(() => ({}))) as { error?: string }).error ??
        'Team operation was rejected.',
    );
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
export function TeamConsole() {
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [message, setMessage] = useState('Loading team access…');
  const reload = useCallback(async () => {
    try {
      setMembers((await request<ApiEnvelope<readonly Member[]>>('/admin/team')).data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load team access.');
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const change = async (memberId: string, body: object) => {
    try {
      await request(`/admin/team/${memberId}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMessage('Team access updated.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Team change was rejected.');
    }
  };
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Settings / IAM</p>
        <h1>Team & access</h1>
        <p>
          Owner protection, cross-organization scoping, and self-escalation prevention are enforced
          by the server.
        </p>
        <nav>
          <Link href="/operations">Operations</Link> · <Link href="/settings">Settings</Link> ·{' '}
          <Link href="/integrity">Integrity</Link>
        </nav>
        <p role="status">{message}</p>
        {members.length === 0 && !message ? <p>No organization members.</p> : null}
        {members.map((member) => (
          <article key={member.id}>
            <h2>{member.name}</h2>
            <p>
              {member.email} · {member.membership_type} · {member.status} · MFA{' '}
              {member.two_factor_enabled ? 'enabled' : 'not enabled'}
            </p>
            <p className="muted">{member.capabilities.join(', ') || 'No direct capabilities'}</p>
            {member.membership_type !== 'OWNER' ? (
              <p>
                <button
                  type="button"
                  onClick={() =>
                    void change(member.id, {
                      status: member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                    })
                  }
                >
                  {member.status === 'ACTIVE' ? 'Disable' : 'Reactivate'}
                </button>
              </p>
            ) : (
              <p>Protected Owner</p>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
