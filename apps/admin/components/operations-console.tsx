'use client';

import { Download, RefreshCw, Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

import { OperationalFeedback, OperationalPageHeader } from './operational-worklist';
import { StatusBadge } from './status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
type ProductType = { id: string; code: string; name: string };
type ImportPreview = { id: string; confirmable: boolean; valid: number; invalid: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? 'Operations request was rejected.'),
    );
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export function parseCatalogImportCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const first = rows[0]?.map((value) => value.toLocaleLowerCase());
  const hasHeader = first?.includes('title') && first.includes('handle');
  return (hasHeader ? rows.slice(1) : rows).map(([title = '', handle = '', description = '']) => ({
    title,
    handle,
    ...(description ? { description } : {}),
  }));
}

function downloadCsv(filename: string, rows: readonly unknown[]) {
  const records = rows.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    headers.map(escape).join(','),
    ...records.map((record) => headers.map((key) => escape(record[key])).join(',')),
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function OperationsConsole() {
  const [attention, setAttention] = useState<readonly Attention[]>([]);
  const [savedViews, setSavedViews] = useState<readonly SavedView[]>([]);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [imports, setImports] = useState<readonly Job[]>([]);
  const [exports, setExports] = useState<readonly Job[]>([]);
  const [productTypes, setProductTypes] = useState<readonly ProductType[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview>();
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const reload = useCallback(async () => {
    try {
      const [overview, views, importJobs, exportJobs, types] = await Promise.all([
        request<ApiEnvelope<readonly Attention[]>>('/admin/operations/overview'),
        request<ApiEnvelope<readonly SavedView[]>>('/admin/saved-views'),
        request<ApiEnvelope<readonly Job[]>>('/admin/imports'),
        request<ApiEnvelope<readonly Job[]>>('/admin/exports'),
        request<ApiEnvelope<readonly ProductType[]>>('/admin/catalog/product-types'),
      ]);
      setAttention(overview.data);
      setSavedViews(views.data);
      setImports(importJobs.data);
      setExports(exportJobs.data);
      setProductTypes(types.data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load operations.');
      setTone('danger');
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
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
      const file = data.get('file');
      if (!(file instanceof File) || file.size === 0)
        throw new Error('Choose a CSV file containing title, handle, and optional description.');
      const productTypeId = String(data.get('productTypeId') ?? '');
      const parsed = parseCatalogImportCsv(await file.text());
      if (parsed.length === 0) throw new Error('The CSV does not contain any Product rows.');
      const rows = parsed.map((row) => ({ ...row, productTypeId }));
      const response = await request<
        ApiEnvelope<{ id: string; confirmable: boolean; valid: number; invalid: number }>
      >('/admin/imports/catalog-products', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, rows }),
      });
      setImportPreview(response.data);
      setTone(response.data.confirmable ? 'success' : 'warning');
      setMessage(
        response.data.confirmable
          ? `Preview validated ${response.data.valid} rows. Review and confirm to queue the import.`
          : `Preview found ${response.data.invalid} invalid rows. Nothing was queued or imported.`,
      );
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import validation was rejected.');
      setTone('danger');
    }
  };
  const confirmImport = async () => {
    if (!importPreview?.confirmable) return;
    try {
      await request(`/admin/imports/${importPreview.id}/confirm`, { method: 'POST' });
      setMessage(
        `Import confirmed and queued for ${importPreview.valid} Product${importPreview.valid === 1 ? '' : 's'}.`,
      );
      setTone('success');
      setImportPreview(undefined);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import confirmation was rejected.');
      setTone('danger');
    }
  };
  const exportData = async (exportType: 'ORDERS' | 'CUSTOMERS' | 'INVENTORY') => {
    try {
      const response = await request<ApiEnvelope<{ rows: readonly unknown[] }>>('/admin/exports', {
        method: 'POST',
        body: JSON.stringify({ exportType }),
      });
      downloadCsv(
        `maevelle-${exportType.toLocaleLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
        response.data.rows,
      );
      setMessage(
        `${exportType} export completed and downloaded with ${response.data.rows.length} permission-safe rows.`,
      );
      setTone('success');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export was rejected.');
      setTone('danger');
    }
  };
  return (
    <main className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">
        <OperationalPageHeader
          eyebrow="Maevelle / Operations"
          title="Operations center"
          description="Review action queues, search business records, manage personal views, and run permission-safe data tools."
          actions={
            <Button variant="outline" size="sm" onClick={() => void reload()}>
            <RefreshCw className="size-3.5 mr-1.5" /> Refresh
          </Button>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Action queue</p>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Attention center</h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground">{attention.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {attention.map((item) => (
              <Link
                className="flex items-center gap-3 p-3.5 rounded-lg border border-border/70 bg-card hover:bg-muted/40 transition-colors shadow-2xs"
                href={item.href}
                key={`${item.domain}-${item.reason}`}
              >
                <strong>{item.count}</strong>
                <span>
                  {item.domain}: {item.reason}
                </span>
                <StatusBadge status={item.severity} />
              </Link>
            ))}
            {attention.length === 0 ? <p>No current operational attention items.</p> : null}
          </div>
        </section>
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <p className="eyebrow">Cross-domain lookup</p>
                <h2>Global search</h2>
              </div>
            </div>
            <form className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3" onSubmit={(event) => void search(event)}>
              <label className="flex-1 text-xs font-medium text-muted-foreground">
                Search
                <input
                  minLength={2}
                  name="q"
                  type="search"
                  placeholder="Order, customer, Product, or Delivery"
                  required
                />
              </label>
              <button className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary-hover transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center" type="submit">
                Search
              </button>
            </form>
            {results.length ? (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
                {results.map((result) => (
                  <Link href={result.href} key={`${result.kind}-${result.label}`}>
                    <StatusBadge status={result.kind} />
                    <span>
                      <strong>{result.label}</strong>
                      <small>{result.detail}</small>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p>Search results open their authoritative workspace.</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <p className="eyebrow">Personal productivity</p>
                <h2>Saved views</h2>
              </div>
            </div>
            <form className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3" onSubmit={(event) => void save(event)}>
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
              <button className="h-9 px-3 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center" type="submit">
                Save view
              </button>
            </form>
            {savedViews.length ? (
              <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
                {savedViews.map((view) => (
                  <li key={view.id}>
                    {view.resource_key}: {view.name} {view.is_default ? '(default)' : ''}{' '}
                    <button
                      className="h-9 px-3 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                      type="button"
                      onClick={() => void updateView(view.id, { isDefault: true })}
                    >
                      Make default
                    </button>{' '}
                    <button
                      className="h-9 px-3 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
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
          </div>
        </section>
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <p className="eyebrow">All-or-nothing</p>
                <h2>Catalog Product import</h2>
              </div>
              <Upload aria-hidden="true" />
            </div>
            <p>
              Choose a Product type, then upload CSV columns:{' '}
              <strong>title, handle, description</strong>. Validation is previewed before an
              explicit confirmation.
            </p>
            <form className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg bg-muted/20 border border-border/60" onSubmit={(event) => void uploadImport(event)}>
              <label>
                Product type
                <select name="productTypeId" required defaultValue="">
                  <option value="" disabled>
                    Choose Product type
                  </option>
                  {productTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CSV file
                <input name="file" type="file" accept=".csv,text/csv" required />
              </label>
              <button
                className="h-9 px-3 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                disabled={productTypes.length === 0}
                type="submit"
              >
                Validate import
              </button>
            </form>
            {importPreview ? (
              <OperationalFeedback tone={importPreview.confirmable ? 'success' : 'warning'}>
                {importPreview.valid} valid · {importPreview.invalid} invalid.{' '}
                {importPreview.confirmable ? (
                  <button
                    className="h-9 px-4 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary-hover transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                    type="button"
                    onClick={() => void confirmImport()}
                  >
                    Confirm and queue
                  </button>
                ) : (
                  'Correct the source file and validate again.'
                )}
              </OperationalFeedback>
            ) : null}
            {imports.length ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.map((job) => (
                      <tr key={job.id}>
                        <td>{job.import_type}</td>
                        <td>
                          <StatusBadge status={job.status} />
                        </td>
                        <td>
                          {job.validation_result
                            ? JSON.stringify(job.validation_result)
                            : 'Pending'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No import jobs.</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div>
                <p className="eyebrow">Current user scope</p>
                <h2>Permission-safe exports</h2>
              </div>
              <Download aria-hidden="true" />
            </div>
            <p>
              Exports are generated server-side from tenant-scoped read models and downloaded as
              CSV.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                className="h-9 px-3 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                type="button"
                onClick={() => void exportData('ORDERS')}
              >
                Export Orders
              </button>
              <button
                className="h-9 px-3 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                type="button"
                onClick={() => void exportData('CUSTOMERS')}
              >
                Export Customers
              </button>
              <button
                className="h-9 px-3 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                type="button"
                onClick={() => void exportData('INVENTORY')}
              >
                Export Inventory
              </button>
            </div>
            {exports.length ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <table>
                  <thead>
                    <tr>
                      <th>Export</th>
                      <th>Status</th>
                      <th className="numeric">Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exports.map((job) => (
                      <tr key={job.id}>
                        <td>{job.export_type}</td>
                        <td>
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="numeric">{job.row_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No export jobs.</p>
            )}
          </div>
        </section>
    </main>
  );
}
