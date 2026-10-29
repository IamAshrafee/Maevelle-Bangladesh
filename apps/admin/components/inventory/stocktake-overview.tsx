'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Plus, Search } from 'lucide-react';

import type { PaginatedDto, StocktakeSessionDto, WarehouseLocationDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { AdminPage, EmptyState, ErrorState, LoadingState, PageHeader, PagePanel, PageSection } from '@/components/ui/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInventoryDate, inventoryRequest } from '@/lib/inventory/api';

const pageSize = 25;
const statuses: readonly StocktakeSessionDto['status'][] = ['DRAFT', 'COUNTING', 'REVIEW', 'POSTED', 'CANCELLED'];

function readable(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function CountProgress({ session }: { readonly session: StocktakeSessionDto }) {
  const percent = session.totalLines ? Math.round((session.countedLines / session.totalLines) * 100) : 0;
  const barTone = session.status === 'POSTED' ? 'bg-success' : session.status === 'REVIEW' ? 'bg-warning' : 'bg-primary';
  return (
    <div className="min-w-40 space-y-1.5">
      <div className="flex justify-between gap-3 text-xs"><span className="font-mono tabular-nums text-muted-foreground">{session.countedLines} / {session.totalLines} SKUs</span><span className="font-mono font-medium tabular-nums">{percent}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${percent}% counted`}><div className={`h-full transition-[width] duration-150 ${barTone}`} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

export function StocktakeOverview() {
  const canCount = useAdminCapability('inventory.stocktake');
  const [stocktakes, setStocktakes] = useState<readonly StocktakeSessionDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    inventoryRequest<{ data: readonly WarehouseLocationDto[] }>('/warehouse/locations', { signal: controller.signal })
      .then((response) => setLocations(response.data.filter((location) => location.status === 'ACTIVE' && location.capabilities.includes('STOCK_HOLDING'))))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (deferredSearch) params.set('search', deferredSearch);
    if (status) params.set('status', status);
    if (locationId) params.set('locationId', locationId);
    setLoading(true);
    setError('');
    inventoryRequest<{ data: PaginatedDto<StocktakeSessionDto> }>(`/inventory/stocktakes?${params}`, { signal: controller.signal })
      .then((response) => {
        setStocktakes(response.data.items);
        setTotalCount(response.data.totalCount ?? response.data.items.length);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Stock counts could not be loaded.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [deferredSearch, locationId, page, reload, status]);

  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = Boolean(search || status || locationId);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setLocationId('');
    setPage(1);
  }

  return (
    <AdminPage>
      <PageHeader eyebrow="Inventory" title="Counts" description="Count physical stock against a fixed snapshot, review variances, and post an auditable reconciliation." actions={canCount ? <Button render={<Link href="/inventory/stocktakes/new" />}><Plus className="size-4" />Start count</Button> : undefined} />

      {error ? <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} /> : null}

      <PagePanel className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_14rem_12rem_auto] xl:items-end">
          <label className="space-y-1.5 text-sm font-medium"><span>Search counts</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Session, location, or code" className="pl-9" /></span></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Location</span><NativeSelect value={locationId} onChange={(event) => { setLocationId(event.target.value); setPage(1); }} className="w-full"><NativeSelectOption value="">All authorized locations</NativeSelectOption>{locations.map((location) => <NativeSelectOption key={location.id} value={location.id}>{location.name} ({location.code})</NativeSelectOption>)}</NativeSelect></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Status</span><NativeSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-full"><NativeSelectOption value="">All statuses</NativeSelectOption>{statuses.map((value) => <NativeSelectOption key={value} value={value}>{readable(value)}</NativeSelectOption>)}</NativeSelect></label>
          <RefreshButton
            loading={loading}
            onRefresh={() => setReload((value) => value + 1)}
            tooltip="Refresh stocktakes"
          />
        </div>
      </PagePanel>

      <PageSection title="Count sessions" description={`${totalCount} session${totalCount === 1 ? '' : 's'} match the current filters.`}>
        {loading ? <LoadingState message="Loading count sessions…" /> : stocktakes.length === 0 ? (
          <EmptyState icon={ClipboardList} title={hasFilters ? 'No counts match these filters' : 'No physical counts yet'} description={hasFilters ? 'Clear the filters to return to the full authorized count history.' : 'Start a count to freeze an expected inventory snapshot for one location.'} action={hasFilters ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : canCount ? <Button render={<Link href="/inventory/stocktakes/new" />}>Start first count</Button> : undefined} />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {stocktakes.map((session) => (
                <Link key={session.id} href={`/inventory/stocktakes/${session.id}`} className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold tabular-nums">{session.stocktakeNumber}</p><p className="mt-1 text-xs text-muted-foreground">{session.locationName}</p></div><StatusBadge status={session.status} /></div>
                  <div className="mt-4"><CountProgress session={session} /></div>
                  <p className="mt-3 text-xs text-muted-foreground">Snapshot {formatInventoryDate(session.snapshotAt)}</p>
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <Table density="compact">
                <TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Counting progress</TableHead><TableHead>Snapshot</TableHead><TableHead>Completed</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
                <TableBody>{stocktakes.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell><Link href={`/inventory/stocktakes/${session.id}`} className="font-mono font-medium tabular-nums hover:text-primary">{session.stocktakeNumber}</Link></TableCell>
                    <TableCell>{session.locationName}</TableCell>
                    <TableCell><StatusBadge status={session.status} /></TableCell>
                    <TableCell><CountProgress session={session} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatInventoryDate(session.snapshotAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{session.postedAt ? formatInventoryDate(session.postedAt) : '—'}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" render={<Link href={`/inventory/stocktakes/${session.id}`} aria-label={`Open ${session.stocktakeNumber}`} />}><ArrowRight className="size-4" /></Button></TableCell>
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
