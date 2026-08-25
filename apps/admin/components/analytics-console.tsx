'use client';

import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { AnalyticsWorkspace } from '@/components/analytics/analytics-workspace';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

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
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [o, s, d] = await Promise.all([
        request<ApiEnvelope<Overview>>('/admin/analytics/overview'),
        request<ApiEnvelope<readonly Snapshot[]>>('/admin/analytics/inventory-snapshots'),
        request<ApiEnvelope<Dashboards>>('/admin/analytics/dashboards'),
      ]);
      setOverview(o.data);
      setSnapshots(s.data);
      setDashboards(d.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const rebuild = async () => {
    await request('/admin/analytics/rebuild', { method: 'POST' });
    await reload();
  };

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Analytics</h1>
          <p className="text-muted-foreground mb-6">
            Real-time visual blocks, conversion funnels, and aggregate projections from authoritative source facts.
          </p>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">Loading analytical projections…</div>
        ) : (
          <AnalyticsWorkspace 
            overview={overview} 
            snapshots={snapshots} 
            dashboards={dashboards} 
            rebuild={rebuild} 
          />
        )}
      </div>
    </main>
  );
}
