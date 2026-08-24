'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

type Overview = {
  readonly metrics: readonly {
    readonly currencyCode: string;
    readonly grossSales: string;
    readonly discounts: string;
    readonly netSales: string;
    readonly recognizedCost: string | null;
    readonly grossMargin: string | null;
    readonly orderLines: string;
  }[];
  readonly refreshedAt: string | null;
};
type Snapshot = {
  readonly snapshot_date: string;
  readonly sku: string;
  readonly location_name: string;
  readonly sellable_quantity: string;
  readonly reserved_quantity: string;
  readonly available_to_sell: string;
};
type DashboardRow = Record<string, unknown>;
type Dashboards = {
  readonly overview: readonly DashboardRow[];
  readonly sales: readonly DashboardRow[];
  readonly products: readonly DashboardRow[];
  readonly customers: readonly DashboardRow[];
  readonly deliveryReturns: DashboardRow;
  readonly finance: readonly DashboardRow[];
  readonly metricCatalog: readonly DashboardRow[];
};

function ReportTable({ title, rows }: { title: string; rows: readonly DashboardRow[] }) {
  const columns = rows[0] ? Object.keys(rows[0]).slice(0, 7) : [];
  return (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? <p>No {title.toLowerCase()} facts projected.</p> : null}
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column.replaceAll('_', ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column}>
                      {Array.isArray(row[column])
                        ? row[column].join(', ')
                        : String(row[column] ?? '—')}
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('Analytics request was rejected.');
  return response.json() as Promise<T>;
}

export function AnalyticsConsole() {
  const [overview, setOverview] = useState<Overview>();
  const [snapshots, setSnapshots] = useState<readonly Snapshot[]>([]);
  const [dashboards, setDashboards] = useState<Dashboards>();
  const [message, setMessage] = useState('Loading analytical projections…');
  const reload = async () => {
    try {
      const [o, s, d] = await Promise.all([
        request<ApiEnvelope<Overview>>('/admin/analytics/overview'),
        request<ApiEnvelope<readonly Snapshot[]>>('/admin/analytics/inventory-snapshots'),
        request<ApiEnvelope<Dashboards>>('/admin/analytics/dashboards'),
      ]);
      setOverview(o.data);
      setSnapshots(s.data);
      setDashboards(d.data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load analytics.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  const rebuild = async () => {
    try {
      await request('/admin/analytics/rebuild', { method: 'POST' });
      setMessage('Reporting projections rebuilt from authoritative source facts.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Rebuild was rejected.');
    }
  };
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Operations / Reporting</p>
        <h1>Analytics</h1>
        <p>
          Rebuildable projections only. Financial and inventory source records remain authoritative.
        </p>
        <nav aria-label="Reporting navigation">
          <Link href="/finance">Finance</Link> · <Link href="/inventory/stock">Inventory</Link> ·{' '}
          <Link href="/costing">Costing</Link>
        </nav>
        <p role="status">{message}</p>
        <button type="button" onClick={() => void rebuild()}>
          Rebuild projections
        </button>
        <p>
          Last successful refresh:{' '}
          {overview?.refreshedAt
            ? new Date(overview.refreshedAt).toLocaleString()
            : 'Not yet rebuilt'}
        </p>
        <h2>Sales metrics by currency</h2>
        {overview?.metrics.length ? (
          <table>
            <thead>
              <tr>
                <th>Currency</th>
                <th>Gross sales</th>
                <th>Discounts</th>
                <th>Net sales</th>
                <th>Recognized cost</th>
                <th>Gross margin</th>
                <th>Order lines</th>
              </tr>
            </thead>
            <tbody>
              {overview.metrics.map((metric) => (
                <tr key={metric.currencyCode}>
                  <td>{metric.currencyCode}</td>
                  <td>{metric.grossSales}</td>
                  <td>{metric.discounts}</td>
                  <td>{metric.netSales}</td>
                  <td>{metric.recognizedCost ?? 'Awaiting recognized COGS'}</td>
                  <td>{metric.grossMargin ?? 'Awaiting recognized COGS'}</td>
                  <td>{metric.orderLines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No sales facts have been projected yet.</p>
        )}
        <h2>Inventory snapshots</h2>
        {snapshots.length ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>SKU</th>
                <th>Location</th>
                <th>Sellable</th>
                <th>Reserved</th>
                <th>Available to sell</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={`${snapshot.snapshot_date}-${snapshot.sku}-${snapshot.location_name}`}>
                  <td>{snapshot.snapshot_date}</td>
                  <td>{snapshot.sku}</td>
                  <td>{snapshot.location_name}</td>
                  <td>{snapshot.sellable_quantity}</td>
                  <td>{snapshot.reserved_quantity}</td>
                  <td>{snapshot.available_to_sell}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No inventory snapshot has been captured yet.</p>
        )}
        <ReportTable title="Products" rows={dashboards?.products ?? []} />
        <ReportTable title="Customers" rows={dashboards?.customers ?? []} />
        <ReportTable
          title="Delivery and returns"
          rows={dashboards ? [dashboards.deliveryReturns] : []}
        />
        <ReportTable title="Finance cash ledger" rows={dashboards?.finance ?? []} />
        <ReportTable title="Versioned metric catalog" rows={dashboards?.metricCatalog ?? []} />
        <p className="muted">
          Gross sales drills into Order snapshots; refunds use refund completion date; cash is
          sourced only from the Finance ledger; gross margin is shown only with recognized Costing
          facts.
        </p>
      </section>
    </main>
  );
}
