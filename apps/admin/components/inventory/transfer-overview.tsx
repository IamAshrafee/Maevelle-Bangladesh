'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, Search, Truck } from 'lucide-react';

import type { PaginatedDto, WarehouseLocationDto, WarehouseTransferDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { AdminPage, EmptyState, ErrorState, LoadingState, PageHeader, PagePanel, PageSection } from '@/components/ui/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInventoryDate, formatInventoryNumber, inventoryRequest } from '@/lib/inventory/api';

const pageSize = 25;
const statuses: readonly WarehouseTransferDto['status'][] = [
  'DRAFT', 'READY', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED_WITH_DISCREPANCY', 'CANCELLED',
];

function readable(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function QuantityProgress({ transfer }: { readonly transfer: WarehouseTransferDto }) {
  return (
    <div className="grid min-w-52 grid-cols-3 gap-3 text-right">
      <div><p className="text-[0.6875rem] text-muted-foreground">Requested</p><p className="font-mono text-xs tabular-nums">{formatInventoryNumber(transfer.totalRequested)}</p></div>
      <div><p className="text-[0.6875rem] text-muted-foreground">Dispatched</p><p className="font-mono text-xs tabular-nums">{formatInventoryNumber(transfer.totalDispatched)}</p></div>
      <div><p className="text-[0.6875rem] text-muted-foreground">Received</p><p className="font-mono text-xs tabular-nums">{formatInventoryNumber(transfer.totalReceived)}</p></div>
    </div>
  );
}

export function TransferOverview() {
  const canTransfer = useAdminCapability('inventory.transfer');
  const [transfers, setTransfers] = useState<readonly WarehouseTransferDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState('');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    inventoryRequest<{ data: readonly WarehouseLocationDto[] }>('/warehouse/locations', { signal: controller.signal })
      .then((response) => setLocations(response.data))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (deferredSearch) params.set('search', deferredSearch);
    if (status) params.set('status', status);
    if (sourceLocationId) params.set('sourceLocationId', sourceLocationId);
    if (destinationLocationId) params.set('destinationLocationId', destinationLocationId);
    setLoading(true);
    setError('');
    inventoryRequest<{ data: PaginatedDto<WarehouseTransferDto> }>(`/warehouse/transfers?${params}`, { signal: controller.signal })
      .then((response) => {
        setTransfers(response.data.items);
        setTotalCount(response.data.totalCount ?? response.data.items.length);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Transfers could not be loaded.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [deferredSearch, destinationLocationId, page, reload, sourceLocationId, status]);

  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = Boolean(search || status || sourceLocationId || destinationLocationId);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setSourceLocationId('');
    setDestinationLocationId('');
    setPage(1);
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Inventory"
        title="Transfers"
        description="Move physical stock between authorized locations with explicit approval, dispatch, receipt, and discrepancy evidence."
        actions={canTransfer ? <Button render={<Link href="/inventory/transfers/new" />}><Plus className="size-4" />New transfer</Button> : undefined}
      />

      {error ? <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} /> : null}

      <PagePanel className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_12rem_14rem_14rem_auto] xl:items-end">
          <label className="space-y-1.5 text-sm font-medium"><span>Search transfer</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Transfer number" className="pl-9" /></span></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Status</span><NativeSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-full"><NativeSelectOption value="">All statuses</NativeSelectOption>{statuses.map((value) => <NativeSelectOption key={value} value={value}>{readable(value)}</NativeSelectOption>)}</NativeSelect></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Source</span><NativeSelect value={sourceLocationId} onChange={(event) => { setSourceLocationId(event.target.value); setPage(1); }} className="w-full"><NativeSelectOption value="">Any source</NativeSelectOption>{locations.map((location) => <NativeSelectOption key={location.id} value={location.id}>{location.name}</NativeSelectOption>)}</NativeSelect></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Destination</span><NativeSelect value={destinationLocationId} onChange={(event) => { setDestinationLocationId(event.target.value); setPage(1); }} className="w-full"><NativeSelectOption value="">Any destination</NativeSelectOption>{locations.map((location) => <NativeSelectOption key={location.id} value={location.id}>{location.name}</NativeSelectOption>)}</NativeSelect></label>
          <RefreshButton
            loading={loading}
            onRefresh={() => setReload((value) => value + 1)}
            tooltip="Refresh transfers"
          />
        </div>
      </PagePanel>

      <PageSection title="Transfer queue" description={`${totalCount} transfer${totalCount === 1 ? '' : 's'} match the current filters.`}>
        {loading ? <LoadingState message="Loading transfer queue…" /> : transfers.length === 0 ? (
          <EmptyState icon={Truck} title={hasFilters ? 'No transfers match these filters' : 'No transfers yet'} description={hasFilters ? 'Clear the filters to return to the full authorized queue.' : 'Create a transfer when stock needs to move between locations.'} action={hasFilters ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : undefined} />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {transfers.map((transfer) => (
                <Link key={transfer.id} href={`/inventory/transfers/${transfer.id}`} className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold tabular-nums">{transfer.transferNumber}</p><p className="mt-1 text-xs text-muted-foreground">{transfer.lineCount} line{transfer.lineCount === 1 ? '' : 's'} · {formatInventoryDate(transfer.createdAt)}</p></div><StatusBadge status={transfer.status} /></div>
                  <div className="my-4 flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{transfer.sourceLocationName}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-right">{transfer.destinationLocationName}</span></div>
                  <QuantityProgress transfer={transfer} />
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <Table density="compact">
                <TableHeader><TableRow><TableHead>Transfer</TableHead><TableHead>Status</TableHead><TableHead>Route</TableHead><TableHead className="text-right">Quantity progress</TableHead><TableHead>Created</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
                <TableBody>{transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell><Link href={`/inventory/transfers/${transfer.id}`} className="font-mono font-medium tabular-nums hover:text-primary">{transfer.transferNumber}</Link><p className="text-xs text-muted-foreground">{transfer.lineCount} line{transfer.lineCount === 1 ? '' : 's'}</p></TableCell>
                    <TableCell><StatusBadge status={transfer.status} /></TableCell>
                    <TableCell><div className="flex items-center gap-2"><span className="max-w-40 truncate">{transfer.sourceLocationName}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground" /><span className="max-w-40 truncate">{transfer.destinationLocationName}</span></div></TableCell>
                    <TableCell><QuantityProgress transfer={transfer} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatInventoryDate(transfer.createdAt)}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" render={<Link href={`/inventory/transfers/${transfer.id}`} aria-label={`Open ${transfer.transferNumber}`} />}><ArrowRight className="size-4" /></Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </>
        )}
        {!loading && totalCount > pageSize ? <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page <span className="font-mono tabular-nums">{page}</span> of <span className="font-mono tabular-nums">{pages}</span></p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div> : null}
      </PageSection>
    </AdminPage>
  );
}
