'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, RotateCcw, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';

import type { InventoryHistoryDto, PaginatedDto, WarehouseLocationDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatInventoryDate, formatInventoryNumber, inventoryRequest } from '@/lib/inventory/api';

import {
  InventoryEmptyState,
  InventoryFeedback,
  InventoryPager,
  PAGE_SIZE,
} from './inventory-page-ui';
import { InventorySourceLink } from './inventory-source-link';

const TRANSACTION_TYPES = [
  ['ALL', 'All Movement Types'],
  ['OPENING_BALANCE', 'Opening Balance'],
  ['INBOUND_RECEIPT', 'Inbound Receipt'],
  ['RETURN_RECEIPT', 'Return Receipt'],
  ['FULFILLMENT_DISPATCH', 'Fulfillment Dispatch'],
  ['TRANSFER_DISPATCH', 'Transfer Dispatch'],
  ['TRANSFER_RECEIPT', 'Transfer Receipt'],
  ['ADJUSTMENT', 'Manual Adjustment'],
  ['STOCKTAKE_ADJUSTMENT', 'Stocktake Reconciliation'],
  ['CONDITION_CHANGE', 'Condition Change'],
] as const;

function movementLabel(type: string) {
  return TRANSACTION_TYPES.find(([value]) => value === type)?.[1] ?? type.replaceAll('_', ' ');
}

function MovementBadge({ type }: { type: string }) {
  const variant = type.includes('RECEIPT')
    ? 'default'
    : type.includes('DISPATCH')
      ? 'secondary'
      : type === 'STOCKTAKE_ADJUSTMENT'
        ? 'outline'
        : 'secondary';
  return <Badge variant={variant}>{movementLabel(type)}</Badge>;
}

function Delta({ record }: { record: InventoryHistoryDto }) {
  const positive = Number(record.quantityDelta) > 0;
  return (
    <span
      className={
        positive
          ? 'font-semibold text-emerald-600 tabular-nums'
          : 'font-semibold text-rose-600 tabular-nums'
      }
    >
      {positive ? '+' : ''}
      {formatInventoryNumber(record.quantityDelta)}
    </span>
  );
}

export function MovementHistory() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const [query, setQuery] = useState(searchParameters.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const [history, setHistory] = useState<PaginatedDto<InventoryHistoryDto>>();
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const page = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);
  const locationId = searchParameters.get('location') ?? 'ALL';
  const transactionType = searchParameters.get('type') ?? 'ALL';
  const condition = searchParameters.get('condition') ?? 'ALL';
  const dateFrom = searchParameters.get('from') ?? '';
  const dateTo = searchParameters.get('to') ?? '';
  const order = searchParameters.get('order') ?? 'DESC';

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'ALL' || (key === 'page' && value === '1')) next.delete(key);
      else next.set(key, value);
    }
    router.replace(next.size ? `/inventory/history?${next.toString()}` : '/inventory/history', {
      scroll: false,
    });
  }

  useEffect(() => {
    const current = searchParameters.get('q') ?? '';
    if (current !== deferredQuery) replaceQuery({ q: deferredQuery || undefined, page: '1' });
  }, [deferredQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations', {
      signal: controller.signal,
    })
      .then((result) => setLocations(result.data))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setMessage(error instanceof Error ? error.message : 'Locations could not be loaded.');
      });
    return () => controller.abort();
  }, []);

  async function load(signal?: AbortSignal) {
    setState('loading');
    const parameters = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sortOrder: order,
    });
    if (deferredQuery) parameters.set('search', deferredQuery);
    if (locationId !== 'ALL') parameters.set('locationId', locationId);
    if (transactionType !== 'ALL') parameters.set('transactionType', transactionType);
    if (condition !== 'ALL') parameters.set('condition', condition);
    if (dateFrom) parameters.set('dateFrom', dateFrom);
    if (dateTo) parameters.set('dateTo', dateTo);
    try {
      const result = await inventoryRequest<{ data: PaginatedDto<InventoryHistoryDto> }>(
        `/inventory/history?${parameters.toString()}`,
        signal ? { signal } : undefined,
      );
      setHistory(result.data);
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Movement history could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [deferredQuery, page, locationId, transactionType, condition, dateFrom, dateTo, order]);

  const items = history?.items ?? [];
  const totalCount = history?.totalCount ?? 0;
  const hasFilters = Boolean(
    deferredQuery ||
    locationId !== 'ALL' ||
    transactionType !== 'ALL' ||
    condition !== 'ALL' ||
    dateFrom ||
    dateTo,
  );

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Inventory</p>
          <h1 className="text-pretty text-2xl font-semibold tracking-tight">Movement History</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Trace every quantity change to its location, condition, reason, actor, source document,
            and resulting balance.
          </p>
        </div>
        <Button variant="outline" disabled={state === 'loading'} onClick={() => void load()}>
          <RefreshCw aria-hidden="true" /> Refresh
        </Button>
      </header>

      <InventoryFeedback isError={state === 'error'} message={message} />

      <section
        aria-label="Movement filters"
        className="space-y-3 rounded-lg border bg-card p-3 sm:p-4"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(9rem,auto))]">
          <div className="relative min-w-0">
            <Search
              className="absolute left-3 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search inventory history"
              autoComplete="off"
              className="pl-9"
              name="history-search"
              placeholder="Search SKU, product, location, reason, or number…"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            value={locationId}
            onValueChange={(value) => replaceQuery({ location: value ?? 'ALL', page: '1' })}
          >
            <SelectTrigger aria-label="Filter history by location">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Locations</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={transactionType}
            onValueChange={(value) => replaceQuery({ type: value ?? 'ALL', page: '1' })}
          >
            <SelectTrigger aria-label="Filter by movement type">
              <SelectValue placeholder="Movement Type" />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_TYPES.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={condition}
            onValueChange={(value) => replaceQuery({ condition: value ?? 'ALL', page: '1' })}
          >
            <SelectTrigger aria-label="Filter history by condition">
              <SelectValue placeholder="All Conditions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Conditions</SelectItem>
              <SelectItem value="SELLABLE">Sellable</SelectItem>
              <SelectItem value="DAMAGED">Damaged</SelectItem>
              <SelectItem value="QUARANTINE">Quarantine</SelectItem>
              <SelectItem value="INSPECTION">Inspection</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              From
              <Input
                className="w-40"
                name="history-from"
                type="date"
                value={dateFrom}
                onChange={(event) =>
                  replaceQuery({ from: event.target.value || undefined, page: '1' })
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              To
              <Input
                className="w-40"
                name="history-to"
                type="date"
                value={dateTo}
                onChange={(event) =>
                  replaceQuery({ to: event.target.value || undefined, page: '1' })
                }
              />
            </label>
            <Select
              value={order}
              onValueChange={(value) => replaceQuery({ order: value ?? 'DESC', page: '1' })}
            >
              <SelectTrigger className="w-40" aria-label="Sort movement history">
                <SelectValue placeholder="Sort order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DESC">Newest First</SelectItem>
                <SelectItem value="ASC">Oldest First</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery('');
                  router.replace('/inventory/history', { scroll: false });
                }}
              >
                <RotateCcw aria-hidden="true" /> Clear Filters
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {totalCount} {totalCount === 1 ? 'movement' : 'movements'}
          </p>
        </div>
      </section>

      {state === 'loading' ? (
        <div className="space-y-3" aria-label="Loading movement history">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <InventoryEmptyState
          title="No Movements Found"
          description={
            hasFilters
              ? 'No ledger movements match these filters. Clear filters to broaden the search.'
              : 'Inventory movements will appear here as stock is received, reconditioned, transferred, adjusted, dispatched, or returned.'
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {items.map((record) => (
              <Card key={record.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        className="font-semibold hover:underline"
                        href={`/inventory/stock/${record.inventoryItemId}`}
                      >
                        {record.productTitle}
                      </Link>
                      {record.optionSummary ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {record.optionSummary}
                        </p>
                      ) : null}
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {record.sku}
                      </p>
                    </div>
                    <Delta record={record} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <MovementBadge type={record.transactionType} />
                    <Badge variant="outline">{record.condition}</Badge>
                  </div>
                  <p className="text-sm">
                    {record.reasonText ?? record.reasonCode ?? 'No reason recorded'}
                  </p>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{formatInventoryDate(record.occurredAt)}</span>
                    <span>Balance {formatInventoryNumber(record.runningBalance)}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <InventorySourceLink record={record} />
                    <span>{record.actorDisplayName ?? 'System'}</span>
                  </div>
                  <Link
                    className="text-sm font-medium hover:underline"
                    href={`/inventory/warehouses/${record.locationId}`}
                  >
                    {record.locationName}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="hidden rounded-lg border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Product & SKU</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source & Actor</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-muted-foreground">
                      {formatInventoryDate(record.occurredAt)}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      <Link
                        className="font-semibold hover:underline"
                        href={`/inventory/stock/${record.inventoryItemId}`}
                      >
                        {record.productTitle}
                      </Link>
                      {record.optionSummary ? (
                        <p className="text-xs text-muted-foreground">{record.optionSummary}</p>
                      ) : null}
                      <p className="font-mono text-xs text-muted-foreground">{record.sku}</p>
                    </TableCell>
                    <TableCell>
                      <Link
                        className="hover:underline"
                        href={`/inventory/warehouses/${record.locationId}`}
                      >
                        {record.locationName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <MovementBadge type={record.transactionType} />
                        <span className="text-xs text-muted-foreground">{record.condition}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      <p>{record.reasonText ?? record.reasonCode ?? 'No reason recorded'}</p>
                      {record.reasonText && record.reasonCode ? (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {record.reasonCode}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal">
                      <InventorySourceLink record={record} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {record.actorDisplayName ?? 'System'}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Delta record={record} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatInventoryNumber(record.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {totalCount > PAGE_SIZE ? (
        <InventoryPager
          page={page}
          hasNext={page * PAGE_SIZE < totalCount}
          onPageChange={(nextPage) => replaceQuery({ page: String(nextPage) })}
        />
      ) : null}
    </main>
  );
}
