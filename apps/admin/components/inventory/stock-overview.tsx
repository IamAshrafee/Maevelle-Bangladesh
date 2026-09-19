'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';

import type {
  InventoryItemChoiceDto,
  InventoryPositionDto,
  InventoryStatsDto,
  PaginatedDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inventoryRequest, formatInventoryNumber } from '@/lib/inventory/api';
import { useAdminCapability } from '@/components/admin-capabilities';

import {
  InventoryFeedback,
  InventoryPager,
  InventoryStatCards,
  PAGE_SIZE,
} from './inventory-page-ui';
import { InventoryPositionTable } from './inventory-position-table';

export function StockOverview() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const canAdjust = useAdminCapability('inventory.adjust');
  const [query, setQuery] = useState(searchParameters.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const [stats, setStats] = useState<InventoryStatsDto>();
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [positions, setPositions] = useState<PaginatedDto<InventoryPositionDto>>();
  const [itemsWithoutPositions, setItemsWithoutPositions] = useState<
    PaginatedDto<InventoryItemChoiceDto>
  >();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const page = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);
  const locationId = searchParameters.get('location') ?? 'ALL';
  const condition = searchParameters.get('condition') ?? 'ALL';
  const availability = searchParameters.get('availability') ?? 'ALL';
  const catalogStatus = searchParameters.get('catalog') ?? 'ALL';
  const sort = searchParameters.get('sort') ?? 'PRODUCT';
  const order = searchParameters.get('order') ?? 'ASC';

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'ALL' || (key === 'page' && value === '1')) next.delete(key);
      else next.set(key, value);
    }
    router.replace(next.size ? `/inventory/stock?${next.toString()}` : '/inventory/stock', {
      scroll: false,
    });
  }

  useEffect(() => {
    const current = searchParameters.get('q') ?? '';
    if (current !== deferredQuery) replaceQuery({ q: deferredQuery || undefined, page: '1' });
  }, [deferredQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      inventoryRequest<{ data: InventoryStatsDto }>('/inventory/stats', {
        signal: controller.signal,
      }),
      inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations', {
        signal: controller.signal,
      }),
    ])
      .then(([statsResult, locationsResult]) => {
        setStats(statsResult.data);
        setLocations(locationsResult.data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMessage(
          error instanceof Error ? error.message : 'Inventory summary could not be loaded.',
        );
      });
    return () => controller.abort();
  }, []);

  async function load(signal?: AbortSignal) {
    setState('loading');
    const parameters = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (deferredQuery) parameters.set('search', deferredQuery);
    if (locationId !== 'ALL') parameters.set('locationId', locationId);
    if (condition !== 'ALL') parameters.set('condition', condition);
    if (availability !== 'ALL') parameters.set('availability', availability);
    if (catalogStatus !== 'ALL') parameters.set('catalogStatus', catalogStatus);
    parameters.set('sortBy', sort);
    parameters.set('sortOrder', order);
    try {
      const itemParameters = new URLSearchParams({
        catalogStatus: 'ACTIVE',
        positionState: 'NO_POSITION',
        page: '1',
        limit: '8',
      });
      if (deferredQuery) itemParameters.set('search', deferredQuery);
      const [positionResult, itemResult] = await Promise.all([
        inventoryRequest<{ data: PaginatedDto<InventoryPositionDto> }>(
          `/inventory/positions?${parameters.toString()}`,
          signal ? { signal } : undefined,
        ),
        inventoryRequest<{ data: PaginatedDto<InventoryItemChoiceDto> }>(
          `/inventory/items?${itemParameters.toString()}`,
          signal ? { signal } : undefined,
        ),
      ]);
      setPositions(positionResult.data);
      setItemsWithoutPositions(itemResult.data);
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Stock positions could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [deferredQuery, page, locationId, condition, availability, catalogStatus, sort, order]);

  const hasFilters = Boolean(
    deferredQuery ||
    locationId !== 'ALL' ||
    condition !== 'ALL' ||
    availability !== 'ALL' ||
    catalogStatus !== 'ALL',
  );
  const totalCount = positions?.totalCount ?? 0;

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Inventory</p>
          <h1 className="text-pretty text-2xl font-semibold tracking-tight">Stock Positions</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            See physical, reserved, available, unavailable, incoming, and moving units by SKU and
            location.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={state === 'loading'} onClick={() => void load()}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
          {canAdjust ? (
            <Button render={<Link href="/inventory/adjustments" />} nativeButton={false}>
              <SlidersHorizontal aria-hidden="true" /> Adjust Stock
            </Button>
          ) : null}
        </div>
      </header>

      <InventoryStatCards
        stats={[
          {
            label: 'On Hand',
            value: stats ? formatInventoryNumber(stats.totalOnHand) : '—',
            description: 'All physical conditions',
          },
          {
            label: 'Available to Sell',
            value: stats ? formatInventoryNumber(stats.totalAvailable) : '—',
            description: 'Sellable minus reserved',
          },
          {
            label: 'Reserved',
            value: stats ? formatInventoryNumber(stats.totalReserved) : '—',
            description: 'Held for active orders',
          },
          {
            label: 'Unavailable',
            value: stats ? formatInventoryNumber(stats.totalUnavailable) : '—',
            description: 'Damaged, quarantine, inspection',
          },
        ]}
      />

      <InventoryFeedback isError={state === 'error'} message={message} />

      {itemsWithoutPositions && (itemsWithoutPositions.totalCount ?? 0) > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">SKUs awaiting stock setup</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {itemsWithoutPositions.totalCount} active{' '}
                {itemsWithoutPositions.totalCount === 1 ? 'variant has' : 'variants have'} no stock
                position yet. Add an opening balance to make the quantity available for sale.
              </p>
            </div>
            {canAdjust ? (
              <Button
                variant="outline"
                render={<Link href="/inventory/adjustments" />}
                nativeButton={false}
              >
                Add stock
              </Button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {itemsWithoutPositions.items.map((item) => (
              <div key={item.variantId} className="rounded-md border bg-background p-3">
                <p className="truncate text-sm font-medium">{item.productTitle}</p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{item.sku}</p>
                {canAdjust ? (
                  <Link
                    className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
                    href={`/inventory/adjustments?variantId=${encodeURIComponent(item.variantId)}`}
                  >
                    Set opening stock
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        aria-label="Stock filters"
        className="space-y-3 rounded-lg border bg-card p-3 sm:p-4"
      >
        <div className="grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(9rem,auto))]">
          <div className="relative min-w-0">
            <Search
              className="absolute left-3 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search stock positions"
              autoComplete="off"
              className="pl-9"
              name="inventory-search"
              placeholder="Search product, SKU, variant, or location…"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            value={locationId}
            onValueChange={(value) => replaceQuery({ location: value ?? 'ALL', page: '1' })}
          >
            <SelectTrigger aria-label="Filter by location">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Locations</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name} ({location.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={condition}
            onValueChange={(value) => replaceQuery({ condition: value ?? 'ALL', page: '1' })}
          >
            <SelectTrigger aria-label="Filter by condition">
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
          <Select
            value={availability}
            onValueChange={(value) => replaceQuery({ availability: value ?? 'ALL', page: '1' })}
          >
            <SelectTrigger aria-label="Filter by availability">
              <SelectValue placeholder="All Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Availability</SelectItem>
              <SelectItem value="IN_STOCK">Available</SelectItem>
              <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
              <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Select
              value={catalogStatus}
              onValueChange={(value) => replaceQuery({ catalog: value ?? 'ALL', page: '1' })}
            >
              <SelectTrigger className="w-40" aria-label="Filter by Catalog status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Catalog Items</SelectItem>
                <SelectItem value="ACTIVE">Active Catalog</SelectItem>
                <SelectItem value="ARCHIVED">Archived Catalog</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={`${sort}:${order}`}
              onValueChange={(value) => {
                const [nextSort, nextOrder] = (value ?? 'PRODUCT:ASC').split(':');
                replaceQuery({ sort: nextSort, order: nextOrder, page: '1' });
              }}
            >
              <SelectTrigger className="w-48" aria-label="Sort stock positions">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRODUCT:ASC">Product A–Z</SelectItem>
                <SelectItem value="SKU:ASC">SKU A–Z</SelectItem>
                <SelectItem value="AVAILABLE:ASC">Lowest Availability</SelectItem>
                <SelectItem value="AVAILABLE:DESC">Highest Availability</SelectItem>
                <SelectItem value="ON_HAND:DESC">Highest On Hand</SelectItem>
                <SelectItem value="LAST_MOVEMENT:DESC">Recently Changed</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery('');
                  router.replace('/inventory/stock', { scroll: false });
                }}
              >
                <RotateCcw aria-hidden="true" /> Clear Filters
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {totalCount} stock {totalCount === 1 ? 'position' : 'positions'}
          </p>
        </div>
      </section>

      <InventoryPositionTable positions={positions?.items ?? []} isLoading={state === 'loading'} />

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
