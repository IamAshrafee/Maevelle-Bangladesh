'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

type Attention = { label: string; count: string; href: string };
type SearchResult = { kind: string; label: string; detail: string; href: string };
type SavedView = { id: string; resource_key: string; name: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('Operations request was rejected.');
  return response.json() as Promise<T>;
}

export function OperationsConsole() {
  const [attention, setAttention] = useState<readonly Attention[]>([]);
  const [savedViews, setSavedViews] = useState<readonly SavedView[]>([]);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [message, setMessage] = useState('Loading operations…');
  const reload = async () => {
    try {
      const [overview, views] = await Promise.all([
        request<ApiEnvelope<readonly Attention[]>>('/admin/operations/overview'),
        request<ApiEnvelope<readonly SavedView[]>>('/admin/saved-views'),
      ]);
      setAttention(overview.data);
      setSavedViews(views.data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load operations.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') ?? '');
    try {
      setResults(
        (
          await request<ApiEnvelope<readonly SearchResult[]>>(
            `/admin/search?q=${encodeURIComponent(q)}`,
          )
        ).data,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search was rejected.');
    }
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request('/admin/saved-views', {
        method: 'POST',
        body: JSON.stringify({ resourceKey: data.get('resourceKey'), name: data.get('name') }),
      });
      event.currentTarget.reset();
      setMessage('Personal saved view stored. It does not alter shared operational truth.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Saved view was rejected.');
    }
  };
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Maevelle / Operations</p>
        <h1>Operations center</h1>
        <p>Action queues and health indicators link back to their authoritative workspaces.</p>
        <nav aria-label="Operations navigation">
          <Link href="/analytics">Analytics</Link> · <Link href="/settings">Settings</Link> ·{' '}
          <Link href="/notifications">Notifications</Link>
        </nav>
        <p role="status">{message}</p>
        <h2>Attention center</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attention.map((item) => (
            <Link className="rounded border p-4" href={item.href} key={item.label}>
              <strong>{item.count}</strong>
              <br />
              {item.label}
            </Link>
          ))}
        </div>
        <h2>Global search</h2>
        <form onSubmit={(event) => void search(event)}>
          <input minLength={2} name="q" placeholder="Order, customer, product, delivery" required />
          <button type="submit">Search</button>
        </form>
        {results.map((result) => (
          <Link href={result.href} key={`${result.kind}-${result.label}`}>
            <p>
              <strong>
                {result.kind}: {result.label}
              </strong>{' '}
              — {result.detail}
            </p>
          </Link>
        ))}
        <h2>Saved views</h2>
        <form onSubmit={(event) => void save(event)}>
          <select name="resourceKey" defaultValue="orders">
            <option value="orders">Orders</option>
            <option value="inventory">Inventory</option>
            <option value="customers">Customers</option>
            <option value="payments">Payments</option>
            <option value="deliveries">Deliveries</option>
            <option value="returns">Returns</option>
            <option value="purchases">Purchases</option>
            <option value="shipments">Shipments</option>
          </select>
          <input name="name" placeholder="View name" required maxLength={100} />
          <button type="submit">Save view</button>
        </form>
        {savedViews.length ? (
          <ul>
            {savedViews.map((view) => (
              <li key={view.id}>
                {view.resource_key}: {view.name}
              </li>
            ))}
          </ul>
        ) : (
          <p>No personal saved views.</p>
        )}
      </section>
    </main>
  );
}
