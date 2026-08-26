'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

import { StatusBadge } from './status-badge';

type Notification = {
  id: string;
  notification_type: string;
  channel: string;
  status: string;
  rendered_subject: string | null;
  rendered_body: string;
  created_at: string;
  read_at: string | null;
  source_domain: string;
  source_id: string;
  revision_number: number | null;
  attempts:
    | readonly {
        attemptNumber: number;
        status: string;
        provider: string;
        errorCode?: string;
        nextRetryAt?: string;
      }[]
    | null;
};
type Preference = { notification_type: string; channel: string; enabled: boolean };
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
  const payload = (await response.json().catch(() => undefined)) as
    { error?: { message?: string } | string } | undefined;
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(
      typeof error === 'object' && error?.message
        ? error.message
        : 'The protected operation could not be completed.',
    );
  }
  return (response.status === 204 ? undefined : payload) as T;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return Object.keys(value as object).join(', ');
  return String(value).replaceAll('_', ' ');
}

function OperationalTable({
  title,
  rows,
  action,
}: {
  title: string;
  rows: readonly Row[];
  action?: (row: Row) => React.ReactNode;
}) {
  const keys = rows[0]
    ? Object.keys(rows[0])
        .filter(
          (key) =>
            !key.toLocaleLowerCase().includes('secret') &&
            !key.toLocaleLowerCase().includes('credential'),
        )
        .slice(0, 7)
    : [];
  return (
    <section className="integration-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <span>
          {rows.length} record{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state compact">
          <p>No {title.toLowerCase()} records.</p>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {keys.map((key) => (
                  <th key={key}>{key.replaceAll('_', ' ')}</th>
                ))}
                {action ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? index}>
                  {keys.map((key) => (
                    <td key={key}>
                      {key === 'status' ? (
                        <StatusBadge status={String(row[key])} />
                      ) : (
                        displayValue(row[key])
                      )}
                    </td>
                  ))}
                  {action ? <td>{action(row)}</td> : null}
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
  const [preferences, setPreferences] = useState<readonly Preference[]>([]);
  const [integrationData, setIntegrationData] = useState<Integrations>();
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('Loading…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState('');

  const reload = useCallback(async () => {
    try {
      if (integrations) {
        setIntegrationData((await request<ApiEnvelope<Integrations>>('/admin/integrations')).data);
      } else {
        const [inbox, preferenceRows] = await Promise.all([
          request<ApiEnvelope<readonly Notification[]>>('/admin/notifications'),
          request<ApiEnvelope<readonly Preference[]>>('/admin/notifications/preferences/me'),
        ]);
        setNotifications(inbox.data);
        setPreferences(preferenceRows.data);
      }
      setMessage('');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load this operational view.');
      setMessage('');
    }
  }, [integrations]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return notifications.filter((item) => {
      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'UNREAD'
          ? !item.read_at
          : filter === 'REQUIRED'
            ? item.status === 'PENDING' || item.status === 'FAILED'
            : item.status === filter || item.channel === filter);
      return (
        matchesFilter &&
        (!term ||
          [item.notification_type, item.rendered_subject, item.rendered_body, item.source_domain]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(term)))
      );
    });
  }, [filter, notifications, search]);

  const reconcile = async (row: Row, outcome: string) => {
    if (
      !row.id ||
      !window.confirm(
        `Record ${outcome.replaceAll('_', ' ').toLowerCase()} as the reconciled provider outcome?`,
      )
    )
      return;
    setBusy(true);
    try {
      await request(`/admin/integrations/operations/${row.id}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      });
      setMessage('Provider operation reconciled; raw provider history remains preserved.');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reconciliation was rejected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Operations / Communication</p>
          <h1>{integrations ? 'Integrations' : 'Notifications'}</h1>
          <p>
            {integrations
              ? 'Provider health, unknown outcomes, mappings, and webhook delivery without exposing credentials.'
              : 'An operational inbox for required action, delivery failures, and team communication preferences.'}
          </p>
        </div>
        <nav aria-label="Communication operations">
          <Link href="/notifications">Notifications</Link> ·{' '}
          <Link href="/integrations">Integrations</Link> · <Link href="/reviews">Reviews</Link>
        </nav>
      </header>
      {message ? (
        <p className="success-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="error-panel" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}

      {integrations && integrationData ? (
        <>
          <section className="metric-grid">
            <article>
              <strong>
                {integrationData.health.filter((row) => row.status === 'HEALTHY').length}
              </strong>
              <span>Healthy accounts</span>
            </article>
            <article>
              <strong>
                {
                  integrationData.operations.filter((row) => row.status === 'UNKNOWN_OUTCOME')
                    .length
                }
              </strong>
              <span>Unknown outcomes</span>
            </article>
            <article>
              <strong>{integrationData.exceptions.length}</strong>
              <span>Exceptions</span>
            </article>
            <article>
              <strong>
                {integrationData.webhookDeliveries.filter((row) => row.status === 'FAILED').length}
              </strong>
              <span>Failed webhooks</span>
            </article>
          </section>
          {oneTimeSecret ? (
            <aside className="warning-callout" role="status">
              <strong>Copy the webhook signing secret now.</strong>
              <p>
                This is the only time it is displayed. Store it in the receiving system&apos;s
                secret manager.
              </p>
              <code>{oneTimeSecret}</code>
              <button type="button" onClick={() => setOneTimeSecret('')}>
                I have stored it safely
              </button>
            </aside>
          ) : null}
          <form
            className="command-panel integration-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              setBusy(true);
              try {
                const result = await request<ApiEnvelope<{ id: string; secret: string }>>(
                  '/admin/integrations/webhooks',
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      name: String(data.get('name')),
                      endpointUrl: String(data.get('endpointUrl')),
                      eventTypes: String(data.get('eventTypes'))
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    }),
                  },
                );
                setOneTimeSecret(result.data.secret);
                setMessage('Webhook endpoint created.');
                form.reset();
                await reload();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Webhook creation was rejected.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <p className="eyebrow">Webhook setup</p>
              <h2>Create an outbound webhook</h2>
              <p>
                Destinations are validated server-side against SSRF policy. Enter event types
                supported by the current event catalog.
              </p>
            </div>
            <label>
              Name
              <input name="name" required maxLength={160} />
            </label>
            <label>
              HTTPS endpoint
              <input
                name="endpointUrl"
                required
                type="url"
                placeholder="https://partner.example/webhooks/maevelle"
              />
            </label>
            <label>
              Event types, comma separated
              <input
                name="eventTypes"
                required
                placeholder="orders.order.created, payments.payment.completed"
              />
            </label>
            <button disabled={busy} type="submit">
              Create webhook
            </button>
          </form>
          <OperationalTable title="Provider health" rows={integrationData.health} />
          <OperationalTable title="Accounts" rows={integrationData.accounts} />
          <OperationalTable
            title="Operations and reconciliation"
            rows={integrationData.operations}
            action={(row) =>
              row.status === 'UNKNOWN_OUTCOME' || row.status === 'RECONCILIATION_REQUIRED' ? (
                <div className="inline-actions">
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => void reconcile(row, 'CONFIRMED_SUCCESS')}
                  >
                    Confirm success
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => void reconcile(row, 'CONFIRMED_FAILURE')}
                  >
                    Confirm failure
                  </button>
                </div>
              ) : null
            }
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
          <section className="metric-grid">
            <article>
              <strong>{notifications.filter((item) => !item.read_at).length}</strong>
              <span>Unread</span>
            </article>
            <article>
              <strong>{notifications.filter((item) => item.status === 'FAILED').length}</strong>
              <span>Failed delivery</span>
            </article>
            <article>
              <strong>{notifications.filter((item) => item.status === 'PENDING').length}</strong>
              <span>Pending</span>
            </article>
            <article>
              <strong>{notifications.length}</strong>
              <span>Recent total</span>
            </article>
          </section>
          <section className="worklist-toolbar">
            <label>
              View
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="ALL">All</option>
                <option value="UNREAD">Unread</option>
                <option value="REQUIRED">Action required</option>
                <option value="FAILED">Failed delivery</option>
                <option value="IN_APP">In-app</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>
            <label>
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Notification, source, or content"
              />
            </label>
          </section>
          {visible.length === 0 && !error ? (
            <div className="empty-state">
              <h2>No matching notifications</h2>
              <p>Choose another view or clear the search.</p>
            </div>
          ) : null}
          <section className="notification-list">
            {visible.map((item) => (
              <article key={item.id}>
                <div className="detail-panel-header">
                  <div>
                    <p className="eyebrow">
                      {item.source_domain.replaceAll('_', ' ')} ·{' '}
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                    <h2>{item.rendered_subject ?? item.notification_type.replaceAll('_', ' ')}</h2>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <p>{item.rendered_body}</p>
                <p className="muted">
                  {item.channel.replaceAll('_', ' ')} · template revision{' '}
                  {item.revision_number ?? 'unversioned'} · {item.attempts?.length ?? 0} delivery
                  attempt(s)
                </p>
                {item.attempts?.map((attempt) => (
                  <p key={attempt.attemptNumber} className="attempt-line">
                    <StatusBadge status={attempt.status} /> Attempt {attempt.attemptNumber} via{' '}
                    {attempt.provider}
                    {attempt.errorCode ? ` · ${attempt.errorCode.replaceAll('_', ' ')}` : ''}
                    {attempt.nextRetryAt
                      ? ` · retry ${new Date(attempt.nextRetryAt).toLocaleString()}`
                      : ''}
                  </p>
                ))}
                {item.channel === 'IN_APP' && !item.read_at ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await request(`/admin/notifications/${item.id}/read`, { method: 'POST' });
                        await reload();
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : 'Unable to mark as read.',
                        );
                      }
                    }}
                  >
                    Mark read
                  </button>
                ) : null}
              </article>
            ))}
          </section>
          <form
            className="command-panel"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              setBusy(true);
              try {
                await request('/admin/notifications/preferences/me', {
                  method: 'POST',
                  body: JSON.stringify({
                    notificationType: String(data.get('notificationType')),
                    channel: String(data.get('channel')),
                    enabled: data.get('enabled') === 'true',
                  }),
                });
                setMessage('Your notification preference was saved.');
                await reload();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Preference could not be saved.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <p className="eyebrow">My preferences</p>
              <h2>Choose how the Admin contacts you</h2>
              <p>
                Operationally required messages may still appear in-app where the business workflow
                requires them.
              </p>
            </div>
            <label>
              Notification type
              <input
                name="notificationType"
                list="known-notification-types"
                required
                placeholder="orders.order.created"
              />
              <datalist id="known-notification-types">
                {[...new Set(notifications.map((item) => item.notification_type))].map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </label>
            <label>
              Channel
              <select name="channel">
                <option value="IN_APP">In-app</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>
            <label>
              Delivery
              <select name="enabled">
                <option value="true">Enabled</option>
                <option value="false">Muted</option>
              </select>
            </label>
            <button disabled={busy} type="submit">
              Save preference
            </button>
            <ul className="preference-list">
              {preferences.map((item) => (
                <li key={`${item.notification_type}-${item.channel}`}>
                  <span>
                    {item.notification_type.replaceAll('_', ' ')} ·{' '}
                    {item.channel.replaceAll('_', ' ')}
                  </span>
                  <StatusBadge status={item.enabled ? 'ENABLED' : 'DISABLED'} />
                </li>
              ))}
            </ul>
          </form>
        </>
      ) : null}
    </main>
  );
}
