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
  const [metric, setMetric] = useState<
    'GROSS_SALES' | 'NET_SALES' | 'REFUNDS' | 'GROSS_MARGIN' | 'CASH' | 'INVENTORY'
  >('NET_SALES');
  const [drilldown, setDrilldown] = useState<readonly DashboardRow[]>([]);
  const [busy, setBusy] = useState(false);
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
    if (
      !window.confirm(
        'Rebuild analytics projections from authoritative Orders, Inventory, Costing, Returns, Payments, and Finance facts?',
      )
    )
      return;
    setBusy(true);
    try {
      await request('/admin/analytics/rebuild', { method: 'POST' });
      setMessage('Reporting projections rebuilt from authoritative source facts.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Rebuild was rejected.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    void request<ApiEnvelope<readonly DashboardRow[]>>(`/admin/analytics/drilldown/${metric}`)
      .then((response) => {
        if (active) setDrilldown(response.data);
      })
      .catch(() => {
        if (active) setDrilldown([]);
      });
    return () => {
      active = false;
    };
  }, [metric]);
  return (
    <main className="admin-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Operations / Reporting</p>
          <h1>Analytics</h1>
          <p>
            Business metrics with explicit currency and source truth. Reporting projections never
            replace transactional records.
          </p>
        </div>
        <nav aria-label="Reporting navigation">
          <Link href="/finance">Finance</Link> · <Link href="/inventory/stock">Inventory</Link> ·{' '}
          <Link href="/costing">Costing</Link>
        </nav>
      </header>
      {message ? (
        <p className="status-message" role="status">
          {message}
        </p>
      ) : null}
      <section className="analytics-controls">
        <div>
          <strong>Projection freshness</strong>
          <span>
            {overview?.refreshedAt
              ? new Date(overview.refreshedAt).toLocaleString()
              : 'Not yet rebuilt'}
          </span>
        </div>
        <button disabled={busy} type="button" onClick={() => void rebuild()}>
          Rebuild projections
        </button>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Sales by currency</h2>
          </div>
          <p className="muted">All-time committed Order facts in the current projection.</p>
        </div>
        {overview?.metrics.length ? (
          <div className="metric-card-grid">
            {overview.metrics.map((item) => (
              <article key={item.currencyCode}>
                <span>{item.currencyCode}</span>
                <strong>{item.netSales}</strong>
                <small>Net sales</small>
                <dl>
                  <div>
                    <dt>Gross</dt>
                    <dd>{item.grossSales}</dd>
                  </div>
                  <div>
                    <dt>Discounts</dt>
                    <dd>{item.discounts}</dd>
                  </div>
                  <div>
                    <dt>Recognized cost</dt>
                    <dd>{item.recognizedCost ?? 'Pending'}</dd>
                  </div>
                  <div>
                    <dt>Gross margin</dt>
                    <dd>{item.grossMargin ?? 'Pending'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No sales facts yet</h3>
            <p>Complete an Order or rebuild projections after staging fixtures are loaded.</p>
          </div>
        )}
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Drill-down</p>
            <h2>Trace a metric to source facts</h2>
          </div>
          <label>
            Metric
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as typeof metric)}
            >
              <option value="GROSS_SALES">Gross sales</option>
              <option value="NET_SALES">Net sales</option>
              <option value="REFUNDS">Refunds</option>
              <option value="GROSS_MARGIN">Gross margin</option>
              <option value="CASH">Cash</option>
              <option value="INVENTORY">Inventory</option>
            </select>
          </label>
        </div>
        <ReportTable title={metric.replaceAll('_', ' ')} rows={drilldown} />
      </section>
      <section>
        <h2>Inventory snapshots</h2>
        {snapshots.length ? (
          <div className="table-scroll">
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
          </div>
        ) : (
          <p className="muted">No inventory snapshot has been captured yet.</p>
        )}
      </section>
      <section className="analytics-report-grid">
        <ReportTable title="Products" rows={dashboards?.products ?? []} />
        <ReportTable title="Customers" rows={dashboards?.customers ?? []} />
        <ReportTable
          title="Delivery and returns"
          rows={dashboards ? [dashboards.deliveryReturns] : []}
        />
        <ReportTable title="Finance cash ledger" rows={dashboards?.finance ?? []} />
      </section>
      <section>
        <h2>Metric definitions</h2>
        <p className="muted">
          Definitions make grain, time basis, currency treatment, and calculation semantics
          reviewable.
        </p>
        <ReportTable title="Versioned metric catalog" rows={dashboards?.metricCatalog ?? []} />
      </section>
      <aside className="info-callout">
        Gross sales drills into immutable Order snapshots; refunds use completion time; cash comes
        only from the Finance ledger; gross margin appears only where recognized Costing facts
        exist.
      </aside>
    </main>
  );
}
