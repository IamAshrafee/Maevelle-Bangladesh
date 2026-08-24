'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

type Notification = {
  id: string;
  notification_type: string;
  channel: string;
  status: string;
  rendered_body: string;
  created_at: string;
  source_domain: string;
  revision_number: number | null;
  attempts:
    | readonly { attemptNumber: number; status: string; provider: string; errorCode?: string }[]
    | null;
};
type Row = Record<string, unknown> & { id?: string; status?: string };
type Integrations = {
  health: readonly Row[];
  accounts: readonly Row[];
  operations: readonly Row[];
  providerEvents: readonly Row[];
  exceptions: readonly Row[];
  mappings: readonly Row[];
  webhooks: readonly Row[];
  webhookDeliveries: readonly Row[];
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('The protected request was rejected.');
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function OperationalTable({ title, rows }: { title: string; rows: readonly Row[] }) {
  const keys = rows[0]
    ? Object.keys(rows[0])
        .filter((key) => !key.includes('secret'))
        .slice(0, 7)
    : [];
  return (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="muted">No {title.toLowerCase()} records.</p> : null}
      {rows.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {keys.map((key) => (
                  <th key={key}>{key.replaceAll('_', ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? index}>
                  {keys.map((key) => (
                    <td key={key}>
                      {Array.isArray(row[key]) ? row[key].join(', ') : String(row[key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function NotificationsConsole({ integrations = false }: { integrations?: boolean }) {
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);
  const [integrationData, setIntegrationData] = useState<Integrations>();
  const [filter, setFilter] = useState('ALL');
  const [message, setMessage] = useState('Loading…');
  const reload = useCallback(async () => {
    try {
      if (integrations)
        setIntegrationData((await request<ApiEnvelope<Integrations>>('/admin/integrations')).data);
      else
        setNotifications(
          (await request<ApiEnvelope<readonly Notification[]>>('/admin/notifications')).data,
        );
      setMessage('');
    } catch {
      setMessage('Unable to load this protected operational view.');
    }
  }, [integrations]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const visible = useMemo(
    () =>
      notifications.filter(
        (item) => filter === 'ALL' || item.status === filter || item.channel === filter,
      ),
    [filter, notifications],
  );
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
        {integrations && integrationData ? (
          <>
            <OperationalTable title="Health" rows={integrationData.health} />
            <OperationalTable title="Accounts" rows={integrationData.accounts} />
            <OperationalTable
              title="Operations and reconciliation"
              rows={integrationData.operations}
            />
            <OperationalTable title="Provider events" rows={integrationData.providerEvents} />
            <OperationalTable title="Exceptions" rows={integrationData.exceptions} />
            <OperationalTable title="External mappings" rows={integrationData.mappings} />
            <OperationalTable title="Webhook subscriptions" rows={integrationData.webhooks} />
            <OperationalTable title="Webhook deliveries" rows={integrationData.webhookDeliveries} />
          </>
        ) : null}
        {!integrations ? (
          <>
            <label>
              Filter{' '}
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option>ALL</option>
                <option>IN_APP</option>
                <option>EMAIL</option>
                <option>PENDING</option>
                <option>SENT</option>
                <option>READ</option>
                <option>FAILED</option>
                <option>SUPPRESSED</option>
              </select>
            </label>
            {visible.length === 0 && !message ? <p>No matching notifications.</p> : null}
            {visible.map((item) => (
              <article key={item.id}>
                <h2>{item.notification_type}</h2>
                <p>
                  {item.channel} · {item.status} · revision {item.revision_number ?? 'missing'} ·{' '}
                  {new Date(item.created_at).toLocaleString()}
                </p>
                <p>{item.rendered_body}</p>
                <p className="muted">Source: {item.source_domain}</p>
                {item.attempts?.map((attempt) => (
                  <p key={attempt.attemptNumber} className="muted">
                    Attempt {attempt.attemptNumber}: {attempt.status} via {attempt.provider}
                    {attempt.errorCode ? ` (${attempt.errorCode})` : ''}
                  </p>
                ))}
                {item.channel === 'IN_APP' && item.status !== 'READ' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await request(`/admin/notifications/${item.id}/read`, { method: 'POST' });
                        await reload();
                      } catch {
                        setMessage('Unable to mark the notification as read.');
                      }
                    }}
                  >
                    Mark read
                  </button>
                ) : null}
              </article>
            ))}
          </>
        ) : null}
      </section>
    </main>
  );
}
