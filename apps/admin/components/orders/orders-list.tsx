'use client';

import { CircleAlert, Download, FilePlus2, PackageSearch, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';

import type { OrderSummaryDto, PaginatedEnvelope } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchApiData } from '@/lib/api';

const statuses = ['ALL', 'PENDING', 'CONFIRMED', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;
const paymentStatuses = [
  'ALL',
  'UNPAID',
  'PAYMENT_PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'EXPIRED',
  'CANCELLED',
] as const;
const fulfillmentStatuses = [
  'ALL',
  'UNFULFILLED',
  'PARTIALLY_FULFILLED',
  'IN_PROGRESS',
  'FULFILLED',
  'CANCELLED',
] as const;
const deliveryStatuses = [
  'ALL',
  'NOT_STARTED',
  'PENDING',
  'IN_TRANSIT',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;
const salesChannels = [
  'ALL',
  'STOREFRONT',
  'ADMIN',
  'FACEBOOK',
  'INSTAGRAM',
  'WHATSAPP',
  'PHONE',
  'EXTERNAL_API',
  'IMPORT',
] as const;
const paymentMethods = ['ALL', 'COD', 'BKASH_MANUAL', 'NAGAD_MANUAL'] as const;

function allowedValue<const T extends readonly string[]>(
  values: T,
  candidate: string | null,
): T[number] {
  return values.includes(candidate as T[number]) ? (candidate as T[number]) : values[0]!;
}

function label(value: string): string {
  return value === 'ALL' ? 'All' : value.replaceAll('_', ' ');
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatMoney(amount: number | string | undefined | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrdersList() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const [query, setQuery] = useState(searchParameters.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const [orders, setOrders] = useState<PaginatedEnvelope<OrderSummaryDto>>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const status = allowedValue(statuses, searchParameters.get('status'));
  const paymentStatus = allowedValue(paymentStatuses, searchParameters.get('paymentStatus'));
  const fulfillmentStatus = allowedValue(
    fulfillmentStatuses,
    searchParameters.get('fulfillmentStatus'),
  );
  const deliveryStatus = allowedValue(deliveryStatuses, searchParameters.get('deliveryStatus'));
  const salesChannel = allowedValue(salesChannels, searchParameters.get('salesChannel'));
  const paymentMethod = allowedValue(paymentMethods, searchParameters.get('paymentMethod'));
  const from = searchParameters.get('from') ?? '';
  const to = searchParameters.get('to') ?? '';
  const page = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);
  const customerId = searchParameters.get('customerId') ?? '';
  const hasFilters = Boolean(
    deferredQuery ||
    status !== 'ALL' ||
    paymentStatus !== 'ALL' ||
    fulfillmentStatus !== 'ALL' ||
    deliveryStatus !== 'ALL' ||
    salesChannel !== 'ALL' ||
    paymentMethod !== 'ALL' ||
    from ||
    to ||
    customerId,
  );

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'ALL' || (key === 'page' && value === '1')) next.delete(key);
      else next.set(key, value);
    }
    router.replace(next.size ? `/orders?${next.toString()}` : '/orders', { scroll: false });
  }

  useEffect(() => {
    const current = searchParameters.get('q') ?? '';
    if (current !== deferredQuery) replaceQuery({ q: deferredQuery || undefined, page: '1' });
  }, [deferredQuery]);

  async function load(signal?: AbortSignal) {
    setState('loading');
    const parameters = new URLSearchParams({
      page: String(page),
      pageSize: '25',
    });
    if (status !== 'ALL') parameters.set('status', status);
    if (paymentStatus !== 'ALL') parameters.set('paymentStatus', paymentStatus);
    if (fulfillmentStatus !== 'ALL') parameters.set('fulfillmentStatus', fulfillmentStatus);
    if (deliveryStatus !== 'ALL') parameters.set('deliveryStatus', deliveryStatus);
    if (salesChannel !== 'ALL') parameters.set('salesChannel', salesChannel);
    if (paymentMethod !== 'ALL') parameters.set('paymentMethod', paymentMethod);
    if (from) parameters.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) parameters.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    if (deferredQuery) parameters.set('q', deferredQuery);
    if (customerId) parameters.set('customerId', customerId);

    try {
      const data = await fetchApiData<PaginatedEnvelope<OrderSummaryDto>>(
        `/admin/orders?${parameters.toString()}`,
        signal ? { signal } : undefined,
      );
      setOrders(data);
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Orders could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [
    deferredQuery,
    status,
    paymentStatus,
    fulfillmentStatus,
    deliveryStatus,
    salesChannel,
    paymentMethod,
    from,
    to,
    page,
    customerId,
  ]);

  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const parameters = new URLSearchParams({
        page: '1',
        pageSize: '1000',
      });
      if (status !== 'ALL') parameters.set('status', status);
      if (paymentStatus !== 'ALL') parameters.set('paymentStatus', paymentStatus);
      if (fulfillmentStatus !== 'ALL') parameters.set('fulfillmentStatus', fulfillmentStatus);
      if (deliveryStatus !== 'ALL') parameters.set('deliveryStatus', deliveryStatus);
      if (salesChannel !== 'ALL') parameters.set('salesChannel', salesChannel);
      if (paymentMethod !== 'ALL') parameters.set('paymentMethod', paymentMethod);
      if (from) parameters.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) parameters.set('to', new Date(`${to}T23:59:59.999`).toISOString());
      if (deferredQuery) parameters.set('q', deferredQuery);
      if (customerId) parameters.set('customerId', customerId);

      const data = await fetchApiData<PaginatedEnvelope<OrderSummaryDto>>(
        `/admin/orders?${parameters.toString()}`,
      );

      const rows = [
        [
          'Order Number',
          'Date',
          'Status',
          'Payment Status',
          'Payment Method',
          'Fulfillment Status',
          'Delivery Status',
          'Sales Channel',
          'Customer Name',
          'Phone',
          'Email',
          'Delivery Amount',
          'Total Amount',
          'Currency',
        ],
        ...data.items.map((item) => [
          item.orderNumber,
          item.createdAt,
          item.status,
          item.paymentStatus,
          item.paymentMethod,
          item.fulfillmentStatus,
          item.deliveryStatus,
          item.salesChannel,
          `"${(item.customerName ?? '').replace(/"/g, '""')}"`,
          `"${(item.customerPhone ?? '').replace(/"/g, '""')}"`,
          `"${(item.customerEmail ?? '').replace(/"/g, '""')}"`,
          item.deliveryAmount,
          item.total,
          item.currency,
        ]),
      ];

      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `orders-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Commerce</p>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage customer orders, track payments, and initiate fulfillments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button render={<Link href="/orders/delivery-pricing" />} nativeButton={false} variant="outline">
            Delivery pricing
          </Button>
          <Button variant="outline" disabled={state === 'loading'} onClick={() => void load()}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
          <Button variant="outline" disabled={exporting} onClick={() => void exportCsv()}>
            <Download aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button render={<Link href="/orders/new" />} nativeButton={false}>
            <FilePlus2 aria-hidden="true" /> Create Manual Order
          </Button>
        </div>
      </header>

      {message ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-tight">{message}</p>
        </div>
      ) : null}

      <section className="space-y-4 border-b pb-4" aria-label="Order filters">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex max-w-lg flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Order number, customer, phone, or email…"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                router.replace('/orders');
              }}
            >
              <X aria-hidden="true" /> Clear filters
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {[
            { key: 'status', title: 'Order', value: status, values: statuses },
            {
              key: 'paymentStatus',
              title: 'Payment',
              value: paymentStatus,
              values: paymentStatuses,
            },
            {
              key: 'fulfillmentStatus',
              title: 'Fulfillment',
              value: fulfillmentStatus,
              values: fulfillmentStatuses,
            },
            {
              key: 'deliveryStatus',
              title: 'Delivery',
              value: deliveryStatus,
              values: deliveryStatuses,
            },
            {
              key: 'salesChannel',
              title: 'Channel',
              value: salesChannel,
              values: salesChannels,
            },
            {
              key: 'paymentMethod',
              title: 'Method',
              value: paymentMethod,
              values: paymentMethods,
            },
          ].map((filter) => (
            <div key={filter.key} className="space-y-1.5">
              <Label htmlFor={`orders-${filter.key}`}>{filter.title}</Label>
              <NativeSelect
                id={`orders-${filter.key}`}
                className="w-full"
                value={filter.value}
                onChange={(event) => replaceQuery({ [filter.key]: event.target.value, page: '1' })}
              >
                {filter.values.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {label(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="orders-from">From</Label>
            <Input
              id="orders-from"
              type="date"
              value={from}
              onChange={(event) => replaceQuery({ from: event.target.value, page: '1' })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orders-to">To</Label>
            <Input
              id="orders-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => replaceQuery({ to: event.target.value, page: '1' })}
            />
          </div>
        </div>
      </section>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Lifecycle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <PackageSearch className="mx-auto mb-2 size-8 opacity-20" aria-hidden="true" />
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              orders?.items.map((order) => (
                <TableRow
                  key={order.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  <TableCell className="font-medium">
                    <div>{order.orderNumber}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {order.salesChannel.replaceAll('_', ' ')}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {order.customerName ?? 'Guest'}
                      </span>
                      <span className="text-xs text-muted-foreground">{order.customerPhone}</span>
                      {order.customerEmail ? (
                        <span className="text-xs text-muted-foreground">{order.customerEmail}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{formatMoney(order.total, order.currency)}</TableCell>
                  <TableCell>
                    <div className="flex min-w-40 flex-wrap gap-1.5">
                      <StatusBadge status={order.status} />
                      <StatusBadge status={order.paymentStatus} />
                      <StatusBadge status={order.fulfillmentStatus} />
                      <StatusBadge status={order.deliveryStatus} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {orders && orders.totalCount > 25 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium">{(page - 1) * 25 + 1}</span> to{' '}
            <span className="font-medium">{Math.min(page * 25, orders.totalCount)}</span> of{' '}
            <span className="font-medium">{orders.totalCount}</span> results
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => replaceQuery({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= orders.totalCount}
              onClick={() => replaceQuery({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
