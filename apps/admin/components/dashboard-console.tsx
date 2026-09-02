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
  if (amount === null || amount === undefined) return 'Not available';
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
    <main className="admin-page dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Good morning. Here’s what needs attention.</h1>
          <p>Live operating signals across commerce, stock, delivery, money, and system health.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" type="button" onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </button>
          <Link className="button primary" href="/products/new">
            <Sparkles />
            Create product
          </Link>
        </div>
      </header>
      {message ? (
        <div
          className={`notice ${state === 'error' ? 'notice-danger' : 'notice-warning'}`}
          role="status"
        >
          <AlertTriangle />
          {message}
        </div>
      ) : null}
      <Stats aria-label="Business snapshot">
        <StatsCard>
          <StatsTitle>Net sales</StatsTitle>
          <StatsValue>{money(primaryMetric?.netSales, primaryMetric?.currencyCode)}</StatsValue>
          <StatsDescription>Projected authoritative Order facts</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Gross margin</StatsTitle>
          <StatsValue>{money(primaryMetric?.grossMargin, primaryMetric?.currencyCode)}</StatsValue>
          <StatsDescription>Where recognized cost is available</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Discounts</StatsTitle>
          <StatsValue>{money(primaryMetric?.discounts, primaryMetric?.currencyCode)}</StatsValue>
          <StatsDescription>Applied promotion value</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Recent orders</StatsTitle>
          <StatsValue>{orderCount}</StatsValue>
          <StatsDescription>Latest visible operational records</StatsDescription>
        </StatsCard>
      </Stats>
      <div className="dashboard-grid">
        <section className="panel attention-panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Attention center</p>
              <h2>Act before work becomes blocked</h2>
            </div>
            <Link href="/operations">
              Open operations <ArrowRight />
            </Link>
          </header>
          {state === 'loading' ? (
            <div className="skeleton-list" aria-label="Loading attention items">
              <span />
              <span />
              <span />
            </div>
          ) : null}
          {state !== 'loading' && activeAttention.length === 0 ? (
            <div className="empty-state compact">
              <PackageCheck />
              <strong>No active exceptions</strong>
              <p>Nothing in your accessible queues currently requires intervention.</p>
            </div>
          ) : null}
          <div className="attention-list">
            {activeAttention.map((item) => (
              <Link key={`${item.domain}-${item.reason}`} href={item.href}>
                <span className={`attention-icon severity-${item.severity.toLowerCase()}`}>
                  {item.domain === 'Payments' ? (
                    <Banknote />
                  ) : item.domain === 'Inventory' ? (
                    <Boxes />
                  ) : item.domain === 'Delivery' ? (
                    <Truck />
                  ) : (
                    <AlertTriangle />
                  )}
                </span>
                <span>
                  <strong>{item.domain}</strong>
                  <small>{item.reason}</small>
                </span>
                <b>{item.count}</b>
                <ArrowRight />
              </Link>
            ))}
          </div>
        </section>
        <aside className="panel quick-work">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Quick work</p>
              <h2>Common operator actions</h2>
            </div>
          </header>
          <Link href="/payments">
            <CircleDollarSign />
            <span>
              <strong>Review payments</strong>
              <small>Verify or reject submitted evidence</small>
            </span>
            <ArrowRight />
          </Link>
          <Link href="/fulfillments">
            <Boxes />
            <span>
              <strong>Fulfill orders</strong>
              <small>Pick, pack, and dispatch reserved stock</small>
            </span>
            <ArrowRight />
          </Link>
          <Link href="/receiving">
            <PackageCheck />
            <span>
              <strong>Receive inventory</strong>
              <small>Post a controlled warehouse receipt</small>
            </span>
            <ArrowRight />
          </Link>
          <Link href="/analytics">
            <BarChart3 />
            <span>
              <strong>Review performance</strong>
              <small>Trace metrics to source facts</small>
            </span>
            <ArrowRight />
          </Link>
        </aside>
      </div>
      <section className="panel recent-orders">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2>Latest orders</h2>
          </div>
          <Link href="/orders">
            View all Orders <ArrowRight />
          </Link>
        </header>
        <div className="data-table-shell">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Order state</th>
                <th>Payment</th>
                <th className="numeric">Total</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                  </td>
                  <td>{order.customerName || 'Guest customer'}</td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td>
                    <StatusBadge status={order.paymentStatus} />
                  </td>
                  <td className="numeric">
                    <strong>{money(order.total)}</strong>
                  </td>
                  <td>
                    <Link className="row-link" href={`/orders?order=${order.id}`}>
                      Open <ArrowRight />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state !== 'loading' && orders.length === 0 ? (
            <div className="empty-state">
              <ShoppingBag />
              <strong>No Orders yet</strong>
              <p>New Orders will appear here with their payment and fulfillment state.</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
