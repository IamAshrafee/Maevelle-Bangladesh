'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, BarChart3, Info } from 'lucide-react';

import type { ApiEnvelope } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  OperationalFeedback,
  OperationalPageHeader,
} from './operational-worklist';

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
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{rows.length} records</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No {title.toLowerCase()} facts projected.</p>
      ) : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column.replaceAll('_', ' ')}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  {columns.map((column) => (
                    <TableCell key={column} className="text-xs font-mono">
                      {Array.isArray(row[column])
                        ? row[column].join(', ')
                        : String(row[column] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
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
    <main className="space-y-6">
      <OperationalPageHeader
        eyebrow="Operations / Reporting"
        title="Analytics"
        description="Business metrics with explicit currency and source truth. Reporting projections never replace transactional records."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Refreshed:{' '}
              <strong className="text-foreground">
                {overview?.refreshedAt
                  ? new Date(overview.refreshedAt).toLocaleTimeString()
                  : 'Not yet rebuilt'}
              </strong>
            </span>
            <Button disabled={busy} variant="outline" size="sm" onClick={() => void rebuild()}>
              <RefreshCw className={`size-3.5 mr-1.5 ${busy ? 'animate-spin' : ''}`} />
              Rebuild projections
            </Button>
          </div>
        }
      />

      {message ? (
        <OperationalFeedback tone="warning">{message}</OperationalFeedback>
      ) : null}

      {/* Overview Cards */}
      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</p>
          <h2 className="text-base font-semibold text-foreground">Sales by currency</h2>
          <p className="text-xs text-muted-foreground">All-time committed Order facts in the current projection.</p>
        </div>

        {overview?.metrics.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {overview.metrics.map((item) => (
              <article key={item.currencyCode} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    {item.currencyCode}
                  </span>
                  <small className="text-xs text-muted-foreground">Net sales</small>
                </div>
                <div className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
                  {item.netSales}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs border-t border-border/60 pt-2.5">
                  <div>
                    <dt className="text-muted-foreground">Gross</dt>
                    <dd className="font-medium text-foreground tabular-nums">{item.grossSales}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Discounts</dt>
                    <dd className="font-medium text-foreground tabular-nums">{item.discounts}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Recognized cost</dt>
                    <dd className="font-medium text-foreground tabular-nums">{item.recognizedCost ?? 'Pending'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Gross margin</dt>
                    <dd className="font-medium text-foreground tabular-nums">{item.grossMargin ?? 'Pending'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-border rounded-lg space-y-1">
            <h3 className="text-sm font-medium text-foreground">No sales facts yet</h3>
            <p className="text-xs text-muted-foreground">Complete an Order or rebuild projections after staging fixtures are loaded.</p>
          </div>
        )}
      </section>

      {/* Drill-down Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drill-down</p>
            <h2 className="text-base font-semibold text-foreground">Trace a metric to source facts</h2>
          </div>
          <div className="w-full sm:w-48">
            <NativeSelect
              value={metric}
              onChange={(event) => setMetric(event.target.value as typeof metric)}
            >
              <option value="GROSS_SALES">Gross sales</option>
              <option value="NET_SALES">Net sales</option>
              <option value="REFUNDS">Refunds</option>
              <option value="GROSS_MARGIN">Gross margin</option>
              <option value="CASH">Cash</option>
              <option value="INVENTORY">Inventory</option>
            </NativeSelect>
          </div>
        </div>
        <ReportTable title={metric.replaceAll('_', ' ')} rows={drilldown} />
      </section>

      {/* Inventory Snapshots */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Inventory snapshots</h2>
          <p className="text-xs text-muted-foreground">Point-in-time warehouse stock ledger views.</p>
        </div>
        {snapshots.length ? (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Sellable</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available to sell</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snapshot) => (
                  <TableRow key={`${snapshot.snapshot_date}-${snapshot.sku}-${snapshot.location_name}`}>
                    <TableCell className="text-xs text-muted-foreground font-mono">{snapshot.snapshot_date}</TableCell>
                    <TableCell className="text-xs font-medium text-foreground">{snapshot.sku}</TableCell>
                    <TableCell className="text-xs">{snapshot.location_name}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{snapshot.sellable_quantity}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{snapshot.reserved_quantity}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums font-semibold text-primary">{snapshot.available_to_sell}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No inventory snapshot has been captured yet.</p>
        )}
      </section>

      {/* Dashboards Grid */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Domain Reports</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ReportTable title="Products" rows={dashboards?.products ?? []} />
          <ReportTable title="Customers" rows={dashboards?.customers ?? []} />
          <ReportTable
            title="Delivery and returns"
            rows={dashboards ? [dashboards.deliveryReturns] : []}
          />
          <ReportTable title="Finance cash ledger" rows={dashboards?.finance ?? []} />
        </div>
      </section>

      {/* Metric Catalog */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Metric definitions</h2>
          <p className="text-xs text-muted-foreground">
            Definitions make grain, time basis, currency treatment, and calculation semantics
            reviewable.
          </p>
        </div>
        <ReportTable title="Versioned metric catalog" rows={dashboards?.metricCatalog ?? []} />
      </section>

      <div className="p-4 rounded-lg bg-info/10 border border-info/20 text-xs text-foreground/80 flex items-start gap-2.5">
        <Info className="size-4 text-info shrink-0 mt-0.5" />
        <span>
          Gross sales drills into immutable Order snapshots; refunds use completion time; cash comes
          only from the Finance ledger; gross margin appears only where recognized Costing facts
          exist.
        </span>
      </div>
    </main>
  );
}
