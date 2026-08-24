'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

type Attention = { domain: string; reason: string; severity: string; count: string; href: string };
type SearchResult = { kind: string; label: string; detail: string; href: string };
type SavedView = { id: string; resource_key: string; name: string; is_default: boolean };
type Job = {
  id: string;
  status: string;
  import_type?: string;
  export_type?: string;
  row_count?: number;
  validation_result?: object;
};

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
  const [imports, setImports] = useState<readonly Job[]>([]);
  const [exports, setExports] = useState<readonly Job[]>([]);
  const [message, setMessage] = useState('Loading operations…');
  const reload = async () => {
    try {
      const [overview, views, importJobs, exportJobs] = await Promise.all([
        request<ApiEnvelope<readonly Attention[]>>('/admin/operations/overview'),
        request<ApiEnvelope<readonly SavedView[]>>('/admin/saved-views'),
        request<ApiEnvelope<readonly Job[]>>('/admin/imports'),
        request<ApiEnvelope<readonly Job[]>>('/admin/exports'),
      ]);
      setAttention(overview.data);
      setSavedViews(views.data);
      setImports(importJobs.data);
      setExports(exportJobs.data);
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
  const updateView = async (id: string, body: object) => {
    try {
      await request(`/admin/saved-views/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMessage('Saved view updated.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Saved view update was rejected.');
    }
  };
  const uploadImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const rows = JSON.parse(String(data.get('rows') ?? '[]')) as unknown;
      const response = await request<
        ApiEnvelope<{ id: string; confirmable: boolean; valid: number; invalid: number }>
      >('/admin/imports/catalog-products', {
        method: 'POST',
        body: JSON.stringify({ filename: String(data.get('filename')), rows }),
      });
      if (response.data.confirmable)
        await request(`/admin/imports/${response.data.id}/confirm`, { method: 'POST' });
      setMessage(
        response.data.confirmable
          ? `Import validated and queued (${response.data.valid} rows).`
          : `Import preview found ${response.data.invalid} invalid rows; nothing was imported.`,
      );
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import validation was rejected.');
    }
  };
  const exportData = async (exportType: 'ORDERS' | 'CUSTOMERS' | 'INVENTORY') => {
    try {
      const response = await request<ApiEnvelope<{ rows: readonly unknown[] }>>('/admin/exports', {
        method: 'POST',
        body: JSON.stringify({ exportType }),
      });
      setMessage(
        `${exportType} export completed with ${response.data.rows.length} permission-safe rows.`,
      );
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export was rejected.');
    }
  };
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Maevelle / Operations</p>
        <h1>Operations center</h1>
        <p>Action queues and health indicators link back to their authoritative workspaces.</p>
        <nav aria-label="Operations navigation">
          <Link href="/analytics">Analytics</Link> · <Link href="/integrity">Integrity</Link> ·{' '}
          <Link href="/team">Team & access</Link> · <Link href="/settings">Settings</Link> ·{' '}
          <Link href="/notifications">Notifications</Link> ·{' '}
          <Link href="/integrations">Integrations</Link>
        </nav>
        <p role="status">{message}</p>
        <h2>Attention center</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attention.map((item) => (
            <Link
              className="rounded border p-4"
              href={item.href}
              key={`${item.domain}-${item.reason}`}
            >
              <strong>{item.count}</strong>
              <br />
              {item.domain}: {item.reason} ({item.severity})
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
                {view.resource_key}: {view.name} {view.is_default ? '(default)' : ''}{' '}
                <button type="button" onClick={() => void updateView(view.id, { isDefault: true })}>
                  Make default
                </button>{' '}
                <button
                  type="button"
                  onClick={() => void updateView(view.id, { status: 'ARCHIVED' })}
                >
                  Archive
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No personal saved views.</p>
        )}
        <h2>Catalog Product import</h2>
        <p>
          Upload, validation preview, and confirmation are all-or-nothing. Confirmed rows run
          through Catalog domain commands asynchronously.
        </p>
        <form onSubmit={(event) => void uploadImport(event)}>
          <input name="filename" defaultValue="catalog-products.json" required />
          <textarea
            name="rows"
            rows={6}
            defaultValue={'[{"productTypeId":"UUID","title":"Example","handle":"example"}]'}
            required
          />
          <button type="submit">Validate and confirm import</button>
        </form>
        {imports.length ? (
          <ul>
            {imports.map((job) => (
              <li key={job.id}>
                {job.import_type}: {job.status}{' '}
                {job.validation_result ? JSON.stringify(job.validation_result) : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No import jobs.</p>
        )}
        <h2>Permission-safe exports</h2>
        <p>
          <button type="button" onClick={() => void exportData('ORDERS')}>
            Export Orders
          </button>{' '}
          <button type="button" onClick={() => void exportData('CUSTOMERS')}>
            Export Customers
          </button>{' '}
          <button type="button" onClick={() => void exportData('INVENTORY')}>
            Export Inventory
          </button>
        </p>
        {exports.length ? (
          <ul>
            {exports.map((job) => (
              <li key={job.id}>
                {job.export_type}: {job.status} · {job.row_count ?? 0} rows
              </li>
            ))}
          </ul>
        ) : (
          <p>No export jobs.</p>
        )}
      </section>
    </main>
  );
}
