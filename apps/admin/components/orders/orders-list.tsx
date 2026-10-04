'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  Filter,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';

import type { OrderSummaryDto, OrderTagDto, PaginatedEnvelope } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
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
const riskLevels = ['ALL', 'ELEVATED', 'MODERATE', 'LOW', 'INSUFFICIENT_HISTORY'] as const;

type OperationalQueue =
  | 'ALL'
  | 'NEEDS_REVIEW'
  | 'READY_TO_FULFILL'
  | 'IN_DELIVERY'
  | 'DELIVERY_ISSUES'
  | 'COMPLETED';

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
    maximumFractionDigits: 0,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function OrdersList() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const [query, setQuery] = useState(
    searchParameters.get('q') ?? searchParameters.get('search') ?? '',
  );
  const deferredQuery = useDeferredValue(query.trim());

  const [orders, setOrders] = useState<PaginatedEnvelope<OrderSummaryDto>>();
  const [tags, setTags] = useState<readonly OrderTagDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const status = allowedValue(statuses, searchParameters.get('status'));
  const paymentStatus = allowedValue(paymentStatuses, searchParameters.get('paymentStatus'));
  const fulfillmentStatus = allowedValue(
    fulfillmentStatuses,
    searchParameters.get('fulfillmentStatus'),
  );
  const deliveryStatus = allowedValue(deliveryStatuses, searchParameters.get('deliveryStatus'));
  const salesChannel = allowedValue(salesChannels, searchParameters.get('salesChannel'));
  const paymentMethod = allowedValue(paymentMethods, searchParameters.get('paymentMethod'));
  const riskLevel = allowedValue(riskLevels, searchParameters.get('riskLevel'));
  const tagId = searchParameters.get('tagId') ?? '';
  const from = searchParameters.get('from') ?? '';
  const to = searchParameters.get('to') ?? '';
  const page = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);
  const customerId = searchParameters.get('customerId') ?? '';

  // Determine active operational queue
  let activeQueue: OperationalQueue = 'ALL';
  if (status === 'PENDING') activeQueue = 'NEEDS_REVIEW';
  else if (status === 'CONFIRMED' && fulfillmentStatus === 'UNFULFILLED') activeQueue = 'READY_TO_FULFILL';
  else if (deliveryStatus === 'IN_TRANSIT') activeQueue = 'IN_DELIVERY';
  else if (deliveryStatus === 'FAILED') activeQueue = 'DELIVERY_ISSUES';
  else if (status === 'COMPLETED') activeQueue = 'COMPLETED';

  const hasFilters = Boolean(
    deferredQuery ||
    status !== 'ALL' ||
    paymentStatus !== 'ALL' ||
    fulfillmentStatus !== 'ALL' ||
    deliveryStatus !== 'ALL' ||
    salesChannel !== 'ALL' ||
    paymentMethod !== 'ALL' ||
    riskLevel !== 'ALL' ||
    tagId ||
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

  function selectQueue(queue: OperationalQueue) {
    if (queue === 'ALL') {
      replaceQuery({
        status: undefined,
        fulfillmentStatus: undefined,
        deliveryStatus: undefined,
        page: '1',
      });
    } else if (queue === 'NEEDS_REVIEW') {
      replaceQuery({
        status: 'PENDING',
        fulfillmentStatus: undefined,
        deliveryStatus: undefined,
        page: '1',
      });
    } else if (queue === 'READY_TO_FULFILL') {
      replaceQuery({
        status: 'CONFIRMED',
        fulfillmentStatus: 'UNFULFILLED',
        deliveryStatus: undefined,
        page: '1',
      });
    } else if (queue === 'IN_DELIVERY') {
      replaceQuery({
        status: undefined,
        fulfillmentStatus: undefined,
        deliveryStatus: 'IN_TRANSIT',
        page: '1',
      });
    } else if (queue === 'DELIVERY_ISSUES') {
      replaceQuery({
        status: undefined,
        fulfillmentStatus: undefined,
        deliveryStatus: 'FAILED',
        page: '1',
      });
    } else if (queue === 'COMPLETED') {
      replaceQuery({
        status: 'COMPLETED',
        fulfillmentStatus: undefined,
        deliveryStatus: undefined,
        page: '1',
      });
    }
  }

  function copyText(e: React.MouseEvent, text: string, id: string) {
    e.stopPropagation();
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  useEffect(() => {
    const current = searchParameters.get('q') ?? '';
    if (current !== deferredQuery) replaceQuery({ q: deferredQuery || undefined, page: '1' });
  }, [deferredQuery]);

  useEffect(() => {
    async function loadTags() {
      try {
        const list = await fetchApiData<OrderTagDto[]>('/admin/orders/tags');
        setTags(list);
      } catch {
        // Tag list load is supplementary
      }
    }
    void loadTags();
  }, []);

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
    if (riskLevel !== 'ALL') parameters.set('riskLevel', riskLevel);
    if (tagId) parameters.set('tagId', tagId);
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
    riskLevel,
    tagId,
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
      if (riskLevel !== 'ALL') parameters.set('riskLevel', riskLevel);
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
          'Risk Level',
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
          item.riskLevel ?? 'UNCHECKED',
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

  const queueTabs: { key: OperationalQueue; label: string; badge?: string }[] = [
    { key: 'ALL', label: 'All Orders' },
    { key: 'NEEDS_REVIEW', label: 'Needs Review' },
    { key: 'READY_TO_FULFILL', label: 'To Fulfill' },
    { key: 'IN_DELIVERY', label: 'In Delivery' },
    { key: 'DELIVERY_ISSUES', label: 'Delivery Issues' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Operations Workspace</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage customer orders, review delivery history & courier risk, track payments, and initiate fulfillment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button render={<Link href="/orders/delivery-pricing" />} nativeButton={false} variant="outline" size="sm">
            Delivery Pricing
          </Button>
          <Button variant="outline" size="sm" disabled={state === 'loading'} onClick={() => void load()}>
            <RefreshCw className={`mr-1.5 size-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportCsv()}>
            <Download className="mr-1.5 size-3.5" aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button render={<Link href="/orders/new" />} nativeButton={false} size="sm">
            <FilePlus2 className="mr-1.5 size-4" aria-hidden="true" />
            Create Manual Order
          </Button>
        </div>
      </header>

      {/* Operational Attention Queues / Tabs */}
      <div className="flex overflow-x-auto border-b pb-2 -mb-2 gap-1.5 scrollbar-none">
        {queueTabs.map((tab) => {
          const isActive = activeQueue === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectQueue(tab.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.key === 'NEEDS_REVIEW' && status === 'PENDING' && orders?.totalCount ? (
                <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-[10px] font-bold">
                  {orders.totalCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {message ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          role="status"
          aria-live="polite"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-tight">{message}</p>
        </div>
      ) : null}

      {/* Search & Filter Bar */}
      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm" aria-label="Order filters">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search by order #, customer, phone, email…"
              className="pl-9 h-9 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showAdvancedFilters ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <SlidersHorizontal className="mr-1.5 size-3.5" />
              {showAdvancedFilters ? 'Hide Filters' : 'Advanced Filters'}
            </Button>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('');
                  router.replace('/orders');
                }}
              >
                <X className="mr-1 size-3.5" /> Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Advanced Filters Expandable Grid */}
        {showAdvancedFilters && (
          <div className="grid gap-3 pt-3 border-t sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 text-xs">
            <div className="space-y-1">
              <Label htmlFor="orders-status" className="text-xs">Order State</Label>
              <NativeSelect
                id="orders-status"
                value={status}
                onChange={(e) => replaceQuery({ status: e.target.value, page: '1' })}
              >
                {statuses.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {label(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor="orders-payment" className="text-xs">Payment</Label>
              <NativeSelect
                id="orders-payment"
                value={paymentStatus}
                onChange={(e) => replaceQuery({ paymentStatus: e.target.value, page: '1' })}
              >
                {paymentStatuses.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {label(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor="orders-fulfillment" className="text-xs">Fulfillment</Label>
              <NativeSelect
                id="orders-fulfillment"
                value={fulfillmentStatus}
                onChange={(e) => replaceQuery({ fulfillmentStatus: e.target.value, page: '1' })}
              >
                {fulfillmentStatuses.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {label(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor="orders-delivery" className="text-xs">Delivery</Label>
              <NativeSelect
                id="orders-delivery"
                value={deliveryStatus}
                onChange={(e) => replaceQuery({ deliveryStatus: e.target.value, page: '1' })}
              >
                {deliveryStatuses.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {label(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor="orders-risk" className="text-xs">Risk Level</Label>
              <NativeSelect
                id="orders-risk"
                value={riskLevel}
                onChange={(e) => replaceQuery({ riskLevel: e.target.value, page: '1' })}
              >
                {riskLevels.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {label(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor="orders-channel" className="text-xs">Sales Channel</Label>
              <NativeSelect
                id="orders-channel"
                value={salesChannel}
                onChange={(e) => replaceQuery({ salesChannel: e.target.value, page: '1' })}
              >
                {salesChannels.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {label(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <Label htmlFor="orders-method" className="text-xs">Method</Label>
              <NativeSelect
                id="orders-method"
                value={paymentMethod}
                onChange={(e) => replaceQuery({ paymentMethod: e.target.value, page: '1' })}
              >
                {paymentMethods.map((v) => (
                  <NativeSelectOption key={v} value={v}>
                    {label(v)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            {tags.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="orders-tag" className="text-xs">Tag</Label>
                <NativeSelect
                  id="orders-tag"
                  value={tagId}
                  onChange={(e) => replaceQuery({ tagId: e.target.value, page: '1' })}
                >
                  <NativeSelectOption value="">All tags</NativeSelectOption>
                  {tags.map((t) => (
                    <NativeSelectOption key={t.id} value={t.id}>
                      {t.label ?? t.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="orders-from" className="text-xs">From Date</Label>
              <Input
                id="orders-from"
                type="date"
                value={from}
                onChange={(e) => replaceQuery({ from: e.target.value, page: '1' })}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="orders-to" className="text-xs">To Date</Label>
              <Input
                id="orders-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => replaceQuery({ to: e.target.value, page: '1' })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}
      </section>

      {/* Desktop Table View (>= lg) */}
      <div className="hidden lg:block rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Total & Payment</TableHead>
              <TableHead>Lifecycle States</TableHead>
              <TableHead className="text-right">Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <PackageSearch className="mx-auto mb-2 size-8 opacity-20" aria-hidden="true" />
                  No orders match current criteria.
                </TableCell>
              </TableRow>
            ) : (
              orders?.items.map((order) => {
                const isElevated = order.riskLevel === 'ELEVATED';
                const isModerate = order.riskLevel === 'MODERATE';

                return (
                  <TableRow
                    key={order.id}
                    className="group cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => router.push(`/orders/${order.id}`)}
                  >
                    {/* Order Number & Channel */}
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {order.orderNumber}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => copyText(e, order.orderNumber, order.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity"
                          title="Copy order number"
                        >
                          {copiedId === order.id ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {order.salesChannel.replaceAll('_', ' ')}
                        </span>
                      </div>
                      {order.tags && order.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {order.tags.map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border"
                              style={{
                                borderColor: t.color ? `${t.color}60` : undefined,
                                backgroundColor: t.color ? `${t.color}15` : undefined,
                                color: t.color || undefined,
                              }}
                            >
                              <span
                                className="size-1.5 rounded-full"
                                style={{ backgroundColor: t.color ?? '#6b7280' }}
                              />
                              {t.label ?? t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>

                    {/* Customer */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {order.customerName || 'Guest'}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{order.customerPhone}</span>
                          {order.customerPhone && (
                            <button
                              type="button"
                              onClick={(e) => copyText(e, order.customerPhone!, `phone-${order.id}`)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground"
                              title="Copy phone"
                            >
                              {copiedId === `phone-${order.id}` ? (
                                <Check className="size-3 text-emerald-600" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          )}
                        </div>
                        {order.customerId && (
                          <span className="text-[10px] font-medium text-primary">Repeat Customer</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(order.createdAt)}
                    </TableCell>

                    {/* Total & Payment */}
                    <TableCell>
                      <div className="font-semibold text-foreground">
                        {formatMoney(order.total, order.currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {order.paymentMethod === 'COD' ? 'COD' : order.paymentMethod.replaceAll('_', ' ')}
                      </div>
                    </TableCell>

                    {/* Lifecycle Badges */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={order.status} />
                        <StatusBadge status={order.paymentStatus} />
                        <StatusBadge status={order.fulfillmentStatus} />
                        <StatusBadge status={order.deliveryStatus} />
                      </div>
                    </TableCell>

                    {/* Risk Advisory */}
                    <TableCell className="text-right">
                      {isElevated ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                          <ShieldAlert className="size-3" />
                          Elevated
                        </span>
                      ) : isModerate ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <AlertTriangle className="size-3" />
                          Moderate
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / Tablet Responsive Cards View (< lg) */}
      <div className="lg:hidden space-y-3">
        {orders?.items.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
            <PackageSearch className="mx-auto mb-2 size-8 opacity-20" />
            <p className="text-sm">No orders found.</p>
          </div>
        ) : (
          orders?.items.map((order) => {
            const isElevated = order.riskLevel === 'ELEVATED';
            const isModerate = order.riskLevel === 'MODERATE';

            return (
              <div
                key={order.id}
                className="rounded-xl border bg-card p-4 shadow-sm space-y-3 cursor-pointer hover:border-primary transition-colors"
                onClick={() => router.push(`/orders/${order.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground">{order.orderNumber}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {order.salesChannel.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-base text-foreground">
                      {formatMoney(order.total, order.currency)}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod.replaceAll('_', ' ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t pt-2.5 text-xs">
                  <div>
                    <span className="font-medium text-foreground">{order.customerName || 'Guest'}</span>
                    <span className="text-muted-foreground ml-2">{order.customerPhone}</span>
                  </div>
                  {isElevated ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                      <ShieldAlert className="size-2.5" /> Elevated Risk
                    </span>
                  ) : isModerate ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      <AlertTriangle className="size-2.5" /> Mod. Risk
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 border-t pt-2.5">
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={order.status} />
                    <StatusBadge status={order.paymentStatus} />
                    <StatusBadge status={order.fulfillmentStatus} />
                    <StatusBadge status={order.deliveryStatus} />
                  </div>
                  <span className="text-xs font-medium text-primary inline-flex items-center gap-1">
                    View <ArrowRight className="size-3" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {orders && orders.totalCount > 25 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 border-t">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold">{(page - 1) * 25 + 1}</span> to{' '}
            <span className="font-semibold">{Math.min(page * 25, orders.totalCount)}</span> of{' '}
            <span className="font-semibold">{orders.totalCount}</span> orders
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => replaceQuery({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground px-2">Page {page}</span>
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
