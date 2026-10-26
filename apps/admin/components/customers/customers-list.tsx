'use client';

import {
  Ban,
  Check,
  CircleAlert,
  Copy,
  Download,
  Eye,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import type { CustomerSummaryDto, PaginatedEnvelope } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { CustomerStatusBadge } from './customer-status-badge';
import { CustomerRestrictionBadge } from './customer-restriction-badge';
import { CrmNav } from './crm-nav';
import { useAdminCapability } from '@/components/admin-capabilities';
import { CustomerDirectoryActions } from './customer-directory-actions';

type QueueTab = 'ALL' | 'REPEAT' | 'HIGH_SPEND' | 'RESTRICTED' | 'RECENT';

export function CustomersList() {
  const router = useRouter();
  const searchParameters = useSearchParams();

  const [query, setQuery] = useState(searchParameters.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<PaginatedEnvelope<CustomerSummaryDto>>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const canExport = useAdminCapability('customers.export');

  const page = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);
  const status = searchParameters.get('status') ?? 'ALL';
  const source = searchParameters.get('source') ?? 'ALL';
  const from = searchParameters.get('from') ?? '';
  const to = searchParameters.get('to') ?? '';
  const lifecycleStage = searchParameters.get('lifecycleStage') ?? 'ALL';
  const linkedChannel = searchParameters.get('linkedChannel') ?? 'ALL';
  const minSpend = searchParameters.get('minSpend') ?? '';
  const maxSpend = searchParameters.get('maxSpend') ?? '';
  const queue = (searchParameters.get('queue') as QueueTab) ?? 'ALL';

  const hasFilters = Boolean(
    deferredQuery ||
    status !== 'ALL' ||
    source !== 'ALL' ||
    lifecycleStage !== 'ALL' ||
    linkedChannel !== 'ALL' ||
    minSpend ||
    maxSpend ||
    from ||
    to ||
    queue !== 'ALL',
  );
  const savedViewFilters = useMemo(
    () =>
      Object.fromEntries(
        Object.entries({
          q: deferredQuery,
          status,
          source,
          from,
          to,
          lifecycleStage,
          linkedChannel,
          minSpend,
          maxSpend,
          queue,
        }).filter(([, value]) => Boolean(value) && value !== 'ALL'),
      ),
    [
      deferredQuery,
      status,
      source,
      from,
      to,
      lifecycleStage,
      linkedChannel,
      minSpend,
      maxSpend,
      queue,
    ],
  );

  function copyText(id: string, text: string, event?: React.MouseEvent) {
    event?.stopPropagation();
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'ALL' || (key === 'page' && value === '1')) next.delete(key);
      else next.set(key, value);
    }
    router.replace(next.size ? `/customers?${next.toString()}` : '/customers', { scroll: false });
  }

  function handleQueueChange(tab: QueueTab) {
    const changes: Record<string, string | undefined> = {
      queue: tab === 'ALL' ? undefined : tab,
      page: '1',
    };
    if (tab === 'RESTRICTED') {
      changes.status = 'BLOCKED';
    } else if (status === 'BLOCKED') {
      changes.status = undefined;
    }
    replaceQuery(changes);
  }

  function toggleSelected(customerId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
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

    if (deferredQuery) parameters.set('q', deferredQuery);
    if (status !== 'ALL') parameters.set('status', status);
    if (source !== 'ALL') parameters.set('source', source);
    if (from) parameters.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) parameters.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    if (lifecycleStage !== 'ALL') parameters.set('lifecycleStage', lifecycleStage);
    if (linkedChannel !== 'ALL') parameters.set('linkedChannel', linkedChannel);
    if (minSpend) parameters.set('minSpend', minSpend);
    if (maxSpend) parameters.set('maxSpend', maxSpend);

    // Queue-based server filters and sorts
    if (queue === 'REPEAT') {
      parameters.set('minOrders', '2');
      parameters.set('sortBy', 'ORDERS_DESC');
    } else if (queue === 'HIGH_SPEND') {
      parameters.set('sortBy', 'SPEND_DESC');
    } else if (queue === 'RECENT') {
      parameters.set('sortBy', 'RECENT_ORDER');
    }

    try {
      const data = await fetchApiData<PaginatedEnvelope<CustomerSummaryDto>>(
        `/admin/customers?${parameters.toString()}`,
        signal ? { signal } : undefined,
      );
      setCustomers(data);
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Customers could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [
    deferredQuery,
    page,
    status,
    source,
    lifecycleStage,
    linkedChannel,
    minSpend,
    maxSpend,
    from,
    to,
    queue,
  ]);

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await fetchApiData<{ fileName: string; content: string }>(
        '/admin/crm/customers/export',
        {
          method: 'POST',
          body: JSON.stringify({
            ...(deferredQuery ? { q: deferredQuery } : {}),
            ...(status !== 'ALL' ? { status } : {}),
            ...(source !== 'ALL' ? { source } : {}),
            ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
            ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
            ...(lifecycleStage !== 'ALL' ? { lifecycleStage } : {}),
            ...(linkedChannel !== 'ALL' ? { linkedChannel } : {}),
            ...(minSpend ? { minSpend } : {}),
            ...(maxSpend ? { maxSpend } : {}),
            ...(queue === 'REPEAT' ? { minOrders: 2, sortBy: 'ORDERS_DESC' } : {}),
            reason: 'Authorized CRM directory export requested by operator.',
          }),
        },
      );
      const encodedUri = URL.createObjectURL(
        new Blob([data.content], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', data.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(encodedUri);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }

  function formatBdt(amount: string | number | null | undefined): string {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: 'BDT',
      maximumFractionDigits: 2,
    }).format(Number(amount ?? 0));
  }

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Commerce & Identity</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Customers
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage your verified customer base, inspect purchase history and delivery risk, and
            resolve duplicate identities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={state === 'loading'} onClick={() => void load()}>
            <RefreshCw
              className={`size-3.5 mr-1.5 ${state === 'loading' ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
          {canExport ? (
            <Button variant="outline" disabled={exporting} onClick={() => void exportCsv()}>
              <Download className="size-3.5 mr-1.5" aria-hidden="true" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          ) : null}
          <Button render={<Link href="/customers/new" />} nativeButton={false}>
            <UserPlus className="size-3.5 mr-1.5" aria-hidden="true" />
            Create Customer
          </Button>
        </div>
      </header>

      <CrmNav />
      <CustomerDirectoryActions
        filters={savedViewFilters}
        selectedIds={[...selectedIds]}
        onApplyView={(viewFilters) => {
          const next = new URLSearchParams();
          for (const [key, value] of Object.entries(viewFilters)) {
            if (typeof value === 'string' && value) next.set(key, value);
          }
          setQuery(typeof viewFilters.q === 'string' ? viewFilters.q : '');
          router.replace(next.size ? `/customers?${next.toString()}` : '/customers', {
            scroll: false,
          });
        }}
        onBulkComplete={() => {
          setSelectedIds(new Set());
          void load();
        }}
      />

      {message && (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
          aria-live="polite"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-tight">{message}</p>
        </div>
      )}

      {/* Operational Queue Tabs */}
      <div className="flex overflow-x-auto border-b pb-px gap-2">
        <button
          type="button"
          onClick={() => handleQueueChange('ALL')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            queue === 'ALL'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="size-3.5" aria-hidden="true" />
          All Customers
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange('REPEAT')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            queue === 'REPEAT'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCheck className="size-3.5" aria-hidden="true" />
          Repeat Buyers (2+ Orders)
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange('HIGH_SPEND')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            queue === 'HIGH_SPEND'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingBag className="size-3.5 text-emerald-600" aria-hidden="true" />
          High Value / VIP
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange('RESTRICTED')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            queue === 'RESTRICTED'
              ? 'border-rose-600 text-rose-700 font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Ban className="size-3.5 text-rose-600" aria-hidden="true" />
          Restricted & Blocked
        </button>

        <button
          type="button"
          onClick={() => handleQueueChange('RECENT')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            queue === 'RECENT'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Recently Active
        </button>
      </div>

      {/* Filter Section */}
      <section className="space-y-4 border-b pb-4" aria-label="Customer filters">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search by name, 017... phone, email, or customer code..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1"
              onClick={() => {
                setQuery('');
                router.replace('/customers');
              }}
            >
              <X className="size-3.5" aria-hidden="true" /> Clear all filters
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="customer-status" className="text-xs">
              Status
            </Label>
            <NativeSelect
              id="customer-status"
              value={status}
              onChange={(event) => replaceQuery({ status: event.target.value, page: '1' })}
            >
              {['ALL', 'ACTIVE', 'INACTIVE', 'BLOCKED', 'MERGED', 'ANONYMIZED'].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value === 'ALL' ? 'All statuses' : value.replaceAll('_', ' ')}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-lifecycle" className="text-xs">
              Lifecycle
            </Label>
            <NativeSelect
              id="customer-lifecycle"
              value={lifecycleStage}
              onChange={(event) => replaceQuery({ lifecycleStage: event.target.value, page: '1' })}
            >
              {[
                'ALL',
                'NEW_CONTACT',
                'PROSPECT',
                'ENGAGED_PROSPECT',
                'FIRST_TIME_BUYER',
                'REPEAT_CUSTOMER',
                'LOYAL_CUSTOMER',
                'INACTIVE_CUSTOMER',
                'RE_ENGAGED_CUSTOMER',
              ].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value === 'ALL' ? 'All lifecycle stages' : value.replaceAll('_', ' ')}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-channel" className="text-xs">
              Linked channel
            </Label>
            <NativeSelect
              id="customer-channel"
              value={linkedChannel}
              onChange={(event) => replaceQuery({ linkedChannel: event.target.value, page: '1' })}
            >
              {['ALL', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM'].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value === 'ALL' ? 'All channels' : value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-min-spend" className="text-xs">
              Minimum spend (BDT)
            </Label>
            <Input
              id="customer-min-spend"
              inputMode="decimal"
              value={minSpend}
              onChange={(event) =>
                replaceQuery({ minSpend: event.target.value || undefined, page: '1' })
              }
              placeholder="0"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-max-spend" className="text-xs">
              Maximum spend (BDT)
            </Label>
            <Input
              id="customer-max-spend"
              inputMode="decimal"
              value={maxSpend}
              onChange={(event) =>
                replaceQuery({ maxSpend: event.target.value || undefined, page: '1' })
              }
              placeholder="No limit"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-source" className="text-xs">
              First Source
            </Label>
            <NativeSelect
              id="customer-source"
              value={source}
              onChange={(event) => replaceQuery({ source: event.target.value, page: '1' })}
            >
              {[
                'ALL',
                'STOREFRONT',
                'MANUAL_ORDER',
                'FACEBOOK',
                'INSTAGRAM',
                'WHATSAPP',
                'PHONE',
                'IMPORT',
                'ADMIN_CREATED',
                'EXTERNAL_API',
              ].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value === 'ALL' ? 'All sources' : value.replaceAll('_', ' ')}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-from" className="text-xs">
              Joined From
            </Label>
            <Input
              id="customer-from"
              type="date"
              value={from}
              onChange={(event) => replaceQuery({ from: event.target.value, page: '1' })}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-to" className="text-xs">
              Joined Through
            </Label>
            <Input
              id="customer-to"
              type="date"
              value={to}
              onChange={(event) => replaceQuery({ to: event.target.value, page: '1' })}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </section>

      {/* Desktop Table View (Hidden on small mobile) */}
      <div className="hidden md:block overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label="Select all customers on this page"
                  checked={
                    Boolean(customers?.items.length) &&
                    customers!.items.every((customer) => selectedIds.has(customer.id))
                  }
                  onChange={(event) =>
                    setSelectedIds(
                      event.target.checked
                        ? new Set(customers?.items.map((customer) => customer.id) ?? [])
                        : new Set(),
                    )
                  }
                />
              </TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Contact Point</TableHead>
              <TableHead>Orders & Value</TableHead>
              <TableHead>Last Order</TableHead>
              <TableHead>Status & Restrictions</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 size-8 opacity-20" aria-hidden="true" />
                  No customers found matching current filters.
                </TableCell>
              </TableRow>
            ) : (
              customers?.items.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="group cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`/customers/${customer.id}`)}
                >
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label={`Select ${customer.displayName}`}
                      checked={selectedIds.has(customer.id)}
                      onChange={() => toggleSelected(customer.id)}
                    />
                  </TableCell>
                  {/* Identity */}
                  <TableCell>
                    <div className="space-y-1">
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {customer.displayName}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                        <button
                          type="button"
                          onClick={(e) => copyText(customer.id, customer.customerNumber, e)}
                          className="hover:text-foreground inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5"
                          title="Copy Customer Number"
                        >
                          <span>{customer.customerNumber}</span>
                          {copiedId === customer.id ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3 opacity-60" />
                          )}
                        </button>
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1 uppercase font-sans"
                        >
                          {customer.firstSource?.replaceAll('_', ' ') ?? 'Direct'}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>

                  {/* Contact */}
                  <TableCell>
                    <div className="space-y-0.5 text-xs">
                      {customer.primaryPhone ? (
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <span>{customer.primaryPhone}</span>
                          <button
                            type="button"
                            onClick={(e) =>
                              copyText(`phone-${customer.id}`, customer.primaryPhone!, e)
                            }
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                            title="Copy phone"
                          >
                            {copiedId === `phone-${customer.id}` ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      ) : null}
                      {customer.primaryEmail ? (
                        <p className="text-muted-foreground truncate max-w-[180px]">
                          {customer.primaryEmail}
                        </p>
                      ) : null}
                      {!customer.primaryPhone && !customer.primaryEmail && (
                        <span className="text-xs italic text-muted-foreground">No contact</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Orders & Value */}
                  <TableCell>
                    <div className="space-y-0.5 text-xs">
                      <p className="font-bold text-foreground">{formatBdt(customer.totalSpend)}</p>
                      <p className="text-muted-foreground">{customer.orderCount ?? 0} order(s)</p>
                    </div>
                  </TableCell>

                  {/* Last Order */}
                  <TableCell className="text-xs text-muted-foreground">
                    {customer.lastOrderAt ? (
                      new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                        new Date(customer.lastOrderAt),
                      )
                    ) : (
                      <span className="italic text-muted-foreground/60">Never</span>
                    )}
                  </TableCell>

                  {/* Status & Restrictions */}
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <CustomerStatusBadge status={customer.status} />
                      {customer.lifecycleStage ? (
                        <Badge variant="outline" className="text-[9px] py-0 px-1">
                          {customer.lifecycleStage.replaceAll('_', ' ')}
                        </Badge>
                      ) : null}
                      {customer.linkedChannels?.length ? (
                        <span className="text-[10px] text-muted-foreground">
                          {customer.linkedChannels.join(' · ')}
                        </span>
                      ) : null}
                      {customer.activeRestrictions && customer.activeRestrictions.length > 0
                        ? customer.activeRestrictions.map((r, i) => (
                            <CustomerRestrictionBadge
                              key={i}
                              restrictionType={r}
                              className="text-[9px] py-0 px-1"
                              showIcon={false}
                            />
                          ))
                        : null}
                    </div>
                  </TableCell>

                  {/* Joined Date */}
                  <TableCell className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                      new Date(customer.createdAt),
                    )}
                  </TableCell>

                  {/* Row Actions */}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        render={<Link href={`/customers/${customer.id}`} />}
                        nativeButton={false}
                      >
                        <Eye className="size-3.5 mr-1" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs text-primary hover:text-primary"
                        render={<Link href={`/orders/new?customerId=${customer.id}`} />}
                        nativeButton={false}
                        title="Create Order for this Customer"
                      >
                        <Plus className="size-3.5 mr-1" /> Order
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Responsive Mobile Cards Layout (Visible only on small screens) */}
      <div className="block md:hidden space-y-3">
        {customers?.items.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 size-8 opacity-20" aria-hidden="true" />
            <p className="text-sm font-medium">No customers found.</p>
          </div>
        ) : (
          customers?.items.map((customer) => (
            <div
              key={customer.id}
              onClick={() => router.push(`/customers/${customer.id}`)}
              className="rounded-lg border bg-card p-4 space-y-3 shadow-2xs cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <input
                    type="checkbox"
                    className="mb-2 size-4 accent-primary"
                    aria-label={`Select ${customer.displayName}`}
                    checked={selectedIds.has(customer.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleSelected(customer.id)}
                  />
                  <h3 className="font-semibold text-foreground text-sm">{customer.displayName}</h3>
                  <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <span>{customer.customerNumber}</span>
                  </div>
                </div>
                <CustomerStatusBadge status={customer.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-y py-2.5">
                <div>
                  <span className="text-[11px] text-muted-foreground">Contact</span>
                  {customer.primaryPhone ? (
                    <a
                      href={`tel:${customer.primaryPhone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      <Phone className="size-3" /> {customer.primaryPhone}
                    </a>
                  ) : (
                    <p className="text-muted-foreground italic">No phone</p>
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground">Total Spend</span>
                  <p className="mt-0.5 font-bold text-foreground">
                    {formatBdt(customer.totalSpend)} ({customer.orderCount ?? 0} orders)
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>
                  Joined{' '}
                  {new Intl.DateTimeFormat('en-BD', { dateStyle: 'short' }).format(
                    new Date(customer.createdAt),
                  )}
                </span>
                <span className="text-primary font-medium">Open Profile →</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      {customers && customers.totalCount > 25 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-t">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{(page - 1) * 25 + 1}</span> to{' '}
            <span className="font-medium text-foreground">
              {Math.min(page * 25, customers.totalCount)}
            </span>{' '}
            of <span className="font-medium text-foreground">{customers.totalCount}</span> customers
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => replaceQuery({ page: String(page - 1) })}
              className="text-xs"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground font-mono px-1">
              Page {page} of {Math.max(1, Math.ceil(customers.totalCount / 25))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.max(1, Math.ceil(customers.totalCount / 25))}
              onClick={() => replaceQuery({ page: String(page + 1) })}
              className="text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
