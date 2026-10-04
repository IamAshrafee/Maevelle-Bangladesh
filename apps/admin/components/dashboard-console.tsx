'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ApiEnvelope, PaginatedEnvelope } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';
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
type Metric = {
  currencyCode: string;
  grossSales: string;
  discounts: string;
  netSales: string;
  recognizedCost: string | null;
  grossMargin: string | null;
  orderLines: string;
};
type Analytics = { metrics: readonly Metric[]; refreshedAt: string | null };
type Order = {
  id: string;
  orderNumber: string;
  customerName: string;
  total: string;
  status: string;
  paymentStatus: string;
  createdAt?: string;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'include' });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'You do not have access to this dashboard section.'
        : 'Dashboard data is temporarily unavailable.',
    );
  return response.json() as Promise<T>;
}

function money(amount: string | null | undefined, currency = 'BDT') {
  if (amount === null || amount === undefined) return '—';
  const value = Number(amount);
  return Number.isFinite(value)
    ? new Intl.NumberFormat('en-BD', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(value)
    : `${currency} ${amount}`;
}

export function DashboardConsole() {
  const [attention, setAttention] = useState<readonly Attention[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>();
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'partial' | 'error'>('loading');
  const [message, setMessage] = useState('Preparing your operating picture…');

  const load = async () => {
    setState('loading');
    const results = await Promise.allSettled([
      get<ApiEnvelope<readonly Attention[]>>('/admin/operations/overview'),
      get<ApiEnvelope<Analytics>>('/admin/analytics/overview'),
      get<ApiEnvelope<PaginatedEnvelope<Order>>>('/admin/orders'),
    ]);
    if (results[0].status === 'fulfilled') setAttention(results[0].value.data);
    if (results[1].status === 'fulfilled') setAnalytics(results[1].value.data);
    if (results[2].status === 'fulfilled') setOrders(results[2].value.data.items.slice(0, 8));
    const passed = results.filter((result) => result.status === 'fulfilled').length;
    setState(passed === results.length ? 'ready' : passed > 0 ? 'partial' : 'error');
    setMessage(
      passed === results.length
        ? ''
        : passed > 0
          ? 'Some dashboard sections are unavailable or outside your permissions.'
          : 'The operating dashboard could not be loaded. Retry or check API readiness.',
    );
  };

  useEffect(() => {
    void load();
  }, []);
  const primaryMetric = analytics?.metrics[0];
  const activeAttention = attention.filter((item) => Number(item.count) > 0);
  const orderCount = orders.length;

  return (
    <main className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">
      {/* Page Header */}
      <header className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Overview</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Good morning. Here’s what needs attention.
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Live operating signals across commerce, stock, delivery, money, and system health.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={state === 'loading'}>
            <RefreshCw className={`size-3.5 mr-1.5 ${state === 'loading' ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button render={<Link href="/products/new" />} nativeButton={false} size="sm">
            <Sparkles className="size-3.5 mr-1.5" />
            Create product
          </Button>
        </div>
      </header>

      {/* Operational Feedback / Message */}
      {message ? (
        <div
          className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs sm:text-sm font-medium ${
            state === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
          }`}
          role="status"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}

      {/* Business Snapshot Stats */}
      <Stats aria-label="Business snapshot">
        <StatsCard>
          <StatsTitle>Net sales</StatsTitle>
          <StatsValue className="tabular-nums">{money(primaryMetric?.netSales, primaryMetric?.currencyCode)}</StatsValue>
          <StatsDescription>Projected authoritative Order facts</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Gross margin</StatsTitle>
          <StatsValue className="tabular-nums">{money(primaryMetric?.grossMargin, primaryMetric?.currencyCode)}</StatsValue>
          <StatsDescription>Where recognized cost is available</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Discounts</StatsTitle>
          <StatsValue className="tabular-nums">{money(primaryMetric?.discounts, primaryMetric?.currencyCode)}</StatsValue>
          <StatsDescription>Applied promotion value</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Recent orders</StatsTitle>
          <StatsValue className="tabular-nums">{orderCount}</StatsValue>
          <StatsDescription>Latest visible operational records</StatsDescription>
        </StatsCard>
      </Stats>

      {/* Middle Grid: Attention Center & Quick Work */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attention Panel (2 cols on desktop) */}
        <section className="lg:col-span-2 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
          <header className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Attention center</p>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Act before work becomes blocked</h2>
            </div>
            <Link
              href="/operations"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline group"
            >
              Open operations <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </header>

          {state === 'loading' ? (
            <div className="space-y-2 py-2" aria-label="Loading attention items">
              <div className="h-12 rounded-lg bg-muted/60 animate-pulse" />
              <div className="h-12 rounded-lg bg-muted/60 animate-pulse" />
              <div className="h-12 rounded-lg bg-muted/60 animate-pulse" />
            </div>
          ) : null}

          {state !== 'loading' && activeAttention.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-border bg-muted/20">
              <PackageCheck className="size-8 text-emerald-600 mb-2" />
              <strong className="text-sm font-semibold text-foreground">No active exceptions</strong>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Nothing in your accessible queues currently requires intervention.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            {activeAttention.map((item) => (
              <Link
                key={`${item.domain}-${item.reason}`}
                href={item.href}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border transition-colors group cursor-pointer"
              >
                <span className={`p-2 rounded-lg shrink-0 ${
                  item.severity.toLowerCase() === 'critical' || item.severity.toLowerCase() === 'danger'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                    : item.severity.toLowerCase() === 'warning'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                      : 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400'
                }`}>
                  {item.domain === 'Payments' ? (
                    <Banknote className="size-4" />
                  ) : item.domain === 'Inventory' ? (
                    <Boxes className="size-4" />
                  ) : item.domain === 'Delivery' ? (
                    <Truck className="size-4" />
                  ) : (
                    <AlertTriangle className="size-4" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <strong className="block text-sm font-medium text-foreground truncate">{item.domain}</strong>
                  <small className="block text-xs text-muted-foreground truncate">{item.reason}</small>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-card border border-border text-xs font-bold tabular-nums text-foreground shadow-2xs">
                  {item.count}
                </span>
                <ArrowRight className="size-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            ))}
          </div>
        </section>

        {/* Quick Work Aside (1 col) */}
        <aside className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
          <header className="border-b border-border/60 pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick work</p>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Common operator actions</h2>
          </header>
          <div className="space-y-1.5">
            <Link
              href="/payments"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border transition-colors group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-emerald-100/70 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0">
                <CircleDollarSign className="size-4" />
              </div>
              <span className="flex-1 min-w-0">
                <strong className="block text-sm font-medium text-foreground truncate">Review payments</strong>
                <small className="block text-xs text-muted-foreground truncate">Verify or reject submitted evidence</small>
              </span>
              <ArrowRight className="size-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>

            <Link
              href="/fulfillments"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border transition-colors group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-sky-100/70 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 shrink-0">
                <Boxes className="size-4" />
              </div>
              <span className="flex-1 min-w-0">
                <strong className="block text-sm font-medium text-foreground truncate">Fulfill orders</strong>
                <small className="block text-xs text-muted-foreground truncate">Pick, pack, and dispatch reserved stock</small>
              </span>
              <ArrowRight className="size-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>

            <Link
              href="/receiving"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border transition-colors group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-teal-100/70 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 shrink-0">
                <PackageCheck className="size-4" />
              </div>
              <span className="flex-1 min-w-0">
                <strong className="block text-sm font-medium text-foreground truncate">Receive inventory</strong>
                <small className="block text-xs text-muted-foreground truncate">Post a controlled warehouse receipt</small>
              </span>
              <ArrowRight className="size-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>

            <Link
              href="/analytics"
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-border transition-colors group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-indigo-100/70 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 shrink-0">
                <BarChart3 className="size-4" />
              </div>
              <span className="flex-1 min-w-0">
                <strong className="block text-sm font-medium text-foreground truncate">Review performance</strong>
                <small className="block text-xs text-muted-foreground truncate">Trace metrics to source facts</small>
              </span>
              <ArrowRight className="size-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          </div>
        </aside>
      </div>

      {/* Recent Orders Section */}
      <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
        <header className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent activity</p>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Latest orders</h2>
          </div>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline group"
          >
            View all Orders <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </header>

        <Table density="comfortable">
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order state</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <strong className="font-mono font-semibold text-foreground text-xs">{order.orderNumber}</strong>
                </TableCell>
                <TableCell>
                  <span className="font-medium text-foreground">{order.customerName || 'Guest customer'}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={order.paymentStatus} />
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-foreground">
                  {money(order.total)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/orders/${order.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline group"
                  >
                    Open <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {state !== 'loading' && orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-border bg-muted/20">
            <ShoppingBag className="size-8 text-muted-foreground mb-2" />
            <strong className="text-sm font-semibold text-foreground">No Orders yet</strong>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              New Orders will appear here with their payment and fulfillment state.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
