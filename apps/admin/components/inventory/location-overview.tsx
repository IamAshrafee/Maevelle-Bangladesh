'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, Plus, RefreshCw, Search, Warehouse } from 'lucide-react';

import type { LocationCapability, WarehouseLocationListItemDto } from '@maevelle/contracts';

import { useAdminCapability, useAdminContext } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { AdminPage, EmptyState, ErrorState, LoadingState, PageHeader, PagePanel, PageSection } from '@/components/ui/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInventoryNumber, inventoryRequest } from '@/lib/inventory/api';

const capabilities: readonly LocationCapability[] = [
  'STOCK_HOLDING', 'PURCHASE_RECEIVING', 'TRANSFER_SEND', 'TRANSFER_RECEIVE',
  'ORDER_FULFILLMENT', 'RETURN_RECEIVING', 'CUSTOMER_PICKUP', 'INTERNAL_STORAGE',
];

function readable(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function CapabilityList({ values }: { readonly values: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, 3).map((capability) => (
        <span key={capability} className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[0.6875rem] font-medium capitalize text-muted-foreground">
          {readable(capability)}
        </span>
      ))}
      {values.length > 3 ? <span className="px-1 py-1 text-xs text-muted-foreground">+{values.length - 3}</span> : null}
    </div>
  );
}

export function LocationOverview() {
  const canManage = useAdminCapability('warehouse.manage');
  const adminContext = useAdminContext();
  const canCreate = canManage && !adminContext.scopes.some((scope) => scope.scopeType === 'LOCATION');
  const [locations, setLocations] = useState<readonly WarehouseLocationListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [status, setStatus] = useState('');
  const [capability, setCapability] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    inventoryRequest<{ data: readonly WarehouseLocationListItemDto[] }>('/warehouse/locations', { signal: controller.signal })
      .then((response) => setLocations(response.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Locations could not be loaded.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const filtered = useMemo(
    () => locations.filter((location) =>
      (!deferredSearch || `${location.name} ${location.code} ${location.locationType}`.toLowerCase().includes(deferredSearch)) &&
      (!status || location.status === status) &&
      (!capability || location.capabilities.includes(capability)),
    ),
    [capability, deferredSearch, locations, status],
  );
  const activeCount = locations.filter((location) => location.status === 'ACTIVE').length;
  const workCount = locations.reduce((sum, location) => sum + location.activeWorkCount, 0);
  const totalStock = locations.reduce((sum, location) => sum + Number(location.stockOnHand), 0);
  const hasFilters = Boolean(search || status || capability);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setCapability('');
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Inventory"
        title="Locations"
        description="Manage the facilities that hold, receive, transfer, fulfill, and return physical inventory."
        actions={canCreate ? <Button render={<Link href="/inventory/warehouses/new" />}><Plus className="size-4" />Add location</Button> : undefined}
      />

      {error ? <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} /> : null}

      <section aria-label="Location summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PagePanel className="p-4"><p className="text-xs text-muted-foreground">Authorized locations</p><p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{locations.length}</p></PagePanel>
        <PagePanel className="p-4"><p className="text-xs text-muted-foreground">Active</p><p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{activeCount}</p></PagePanel>
        <PagePanel className="p-4"><p className="text-xs text-muted-foreground">Physical on hand</p><p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{formatInventoryNumber(totalStock)}</p></PagePanel>
        <PagePanel className="p-4"><p className="text-xs text-muted-foreground">Open workflows</p><p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{workCount}</p></PagePanel>
      </section>

      <PagePanel className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_11rem_minmax(12rem,15rem)_auto] md:items-end">
          <label className="space-y-1.5 text-sm font-medium"><span>Search locations</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, code, or type" className="pl-9" /></span></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Status</span><NativeSelect value={status} onChange={(event) => setStatus(event.target.value)} className="w-full"><NativeSelectOption value="">All statuses</NativeSelectOption>{['ACTIVE', 'DRAFT', 'INACTIVE', 'ARCHIVED'].map((value) => <NativeSelectOption key={value} value={value}>{readable(value)}</NativeSelectOption>)}</NativeSelect></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Capability</span><NativeSelect value={capability} onChange={(event) => setCapability(event.target.value)} className="w-full"><NativeSelectOption value="">All capabilities</NativeSelectOption>{capabilities.map((value) => <NativeSelectOption key={value} value={value}>{readable(value)}</NativeSelectOption>)}</NativeSelect></label>
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCw className="size-4" />Refresh</Button>
        </div>
      </PagePanel>

      <PageSection title="Facility operations" description={`${filtered.length} of ${locations.length} authorized location${locations.length === 1 ? '' : 's'} shown.`}>
        {loading ? <LoadingState message="Loading locations…" /> : filtered.length === 0 ? (
          <EmptyState icon={MapPin} title={hasFilters ? 'No locations match these filters' : 'No locations are available'} description={hasFilters ? 'Clear the filters to return to the complete authorized list.' : 'Create the first operational location when warehouse access is available.'} action={hasFilters ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : undefined} />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {filtered.map((location) => (
                <Link key={location.id} href={`/inventory/warehouses/${location.id}`} className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{location.name}</p><p className="font-mono text-xs tabular-nums text-muted-foreground">{location.code} · {readable(location.locationType)}</p></div><StatusBadge status={location.status} /></div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">On hand</p><p className="font-mono tabular-nums">{formatInventoryNumber(location.stockOnHand)}</p></div><div><p className="text-xs text-muted-foreground">Open workflows</p><p className="font-mono tabular-nums">{location.activeWorkCount}</p></div></div>
                  <div className="mt-4"><CapabilityList values={location.capabilities} /></div>
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <Table density="compact">
                <TableHeader><TableRow><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Capabilities</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Open work</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell><div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg bg-primary-subtle text-primary"><Warehouse className="size-4" /></span><div><Link className="font-medium hover:text-primary" href={`/inventory/warehouses/${location.id}`}>{location.name}</Link><p className="font-mono text-xs tabular-nums text-muted-foreground">{location.code} · {readable(location.locationType)}</p></div></div></TableCell>
                      <TableCell><StatusBadge status={location.status} /></TableCell>
                      <TableCell><CapabilityList values={location.capabilities} /></TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatInventoryNumber(location.stockOnHand)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{location.activeWorkCount}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" render={<Link href={`/inventory/warehouses/${location.id}`} aria-label={`Open ${location.name}`} />}><ArrowRight className="size-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </PageSection>
    </AdminPage>
  );
}
