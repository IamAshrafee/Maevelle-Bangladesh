'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ApiEnvelope } from '@maevelle/contracts';
type Notification = {
  id: string;
  notification_type: string;
  channel: string;
  status: string;
  rendered_body: string;
  created_at: string;
};
type Integration = {
  id: string;
  name: string;
  provider_code: string;
  status: string;
  unresolved_operations: number;
  open_exceptions: number;
};
async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('Request rejected.');
  return response.json() as Promise<T>;
}
export function NotificationsConsole({ integrations = false }: { integrations?: boolean }) {
  const [items, setItems] = useState<readonly Notification[] | readonly Integration[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      setItems(
        (
          await request<ApiEnvelope<readonly Notification[] | readonly Integration[]>>(
            integrations ? '/admin/integrations' : '/admin/notifications',
          )
        ).data,
      );
      setMessage('');
    } catch {
      setMessage('Unable to load this protected operational view.');
    }
  };
  useEffect(() => {
    void reload();
  }, [integrations]);
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Operations</p>
        <h1>{integrations ? 'Integrations' : 'Notifications'}</h1>
        <nav>
          <Link href="/notifications">Notifications</Link> ·{' '}
          <Link href="/integrations">Integrations</Link> · <Link href="/reviews">Reviews</Link>
        </nav>
        {message ? <p role="status">{message}</p> : null}
        {items.length === 0 ? <p>No operational records yet.</p> : null}
        {integrations
          ? (items as readonly Integration[]).map((item) => (
              <article key={item.id}>
                <h2>{item.name}</h2>
                <p>
                  {item.provider_code} · {item.status} · unresolved operations{' '}
                  {item.unresolved_operations} · exceptions {item.open_exceptions}
                </p>
              </article>
            ))
          : (items as readonly Notification[]).map((item) => (
              <article key={item.id}>
                <h2>{item.notification_type}</h2>
                <p>
                  {item.channel} · {item.status} · {new Date(item.created_at).toLocaleString()}
                </p>
                <p>{item.rendered_body}</p>
              </article>
            ))}
      </section>
    </main>
  );
}
