'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, RotateCcw, Unlock, Clock, AlertTriangle, ExternalLink } from 'lucide-react';

import type { PaginatedDto, InventoryReservationDto, WarehouseLocationDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryFeedback, InventoryEmptyState, InventoryPager } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ReservationsList() {
  const [reservations, setReservations] = useState<readonly InventoryReservationDto[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string>('');
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [locationId, setLocationId] = useState<string>('all');
  const [status, setStatus] = useState<string>('ACTIVE');
  const [search, setSearch] = useState<string>('');
  const [hasNext, setHasNext] = useState(false);

  // Fetch locations once
  useEffect(() => {
    inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations')
      .then((res) => setLocations(res.data || []))
      .catch(console.error);
  }, []);

  const loadReservations = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '50');
    if (locationId !== 'all') params.set('locationId', locationId);
    if (status !== 'all') params.set('status', status);

    inventoryRequest<{ data: PaginatedDto<InventoryReservationDto> }>(
      `/inventory/reservations?${params.toString()}`,
    )
      .then((res) => {
        setReservations(res.data.items);
        setHasNext(res.data.items.length === 50);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadReservations();
  }, [page, locationId, status]);

  const handleRelease = async (reservation: InventoryReservationDto) => {
    setReleasingId(reservation.id);
    setActionSuccess('');
    setError(null);

    try {
      await inventoryRequest(`/inventory/reservations/${reservation.id}/release`, {
        method: 'POST',
        headers: {
          'idempotency-key': `rel-${reservation.id}-${Date.now()}`,
        },
      });

      setActionSuccess(
        `Successfully released reservation for ${reservation.productTitle || reservation.sku} (${formatInventoryNumber(reservation.quantity)} units).`,
      );
      loadReservations();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setReleasingId(null);
    }
  };

  const filteredReservations = reservations.filter((res) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      res.sku.toLowerCase().includes(q) ||
      (res.productTitle && res.productTitle.toLowerCase().includes(q)) ||
      res.sourceReference.toLowerCase().includes(q) ||
      res.locationName.toLowerCase().includes(q)
    );
  });

  const handleResetFilters = () => {
    setLocationId('all');
    setStatus('ACTIVE');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters = locationId !== 'all' || status !== 'ACTIVE' || search.trim() !== '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Reservations</h1>
          <p className="text-sm text-muted-foreground">
            View and manage inventory held for pending customer orders and active warehouse transfers.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-card p-3.5 rounded-lg border">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by SKU, title, reference…"
              className="pl-8 text-xs h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Location Select */}
          <Select
            value={locationId}
            onValueChange={(v) => {
              setLocationId(v || 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] text-xs h-9">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Select */}
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v || 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] text-xs h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active Holds</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-xs h-9">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground self-end md:self-center">
          Showing {filteredReservations.length} reservations
        </div>
      </div>

      <InventoryFeedback isError message={error instanceof Error ? error.message : ''} />
      {actionSuccess && <InventoryFeedback message={actionSuccess} />}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : filteredReservations.length === 0 ? (
        <InventoryEmptyState
          title="No reservations found"
          description={
            hasActiveFilters
              ? 'No reservations match your current filters. Try changing or resetting them.'
              : 'There are currently no active reservations.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider font-semibold border-b">
                <tr>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Product / SKU</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Location</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Reserved Qty</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Originating Source</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Status</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Expires</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {filteredReservations.map((res) => {
                  const isExpired =
                    res.expiresAt && new Date(res.expiresAt).getTime() < Date.now() && res.status === 'ACTIVE';

                  return (
                    <tr
                      key={res.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="p-4 align-middle">
                        <div className="font-medium text-foreground">
                          {res.inventoryItemId ? (
                            <Link
                              href={`/inventory/stock/${res.inventoryItemId}`}
                              className="hover:underline"
                            >
                              {res.productTitle || res.sku}
                            </Link>
                          ) : (
                            res.productTitle || res.sku
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{res.sku}</div>
                      </td>
                      <td className="p-4 align-middle">
                        <Link
                          href={`/inventory/warehouses/${res.locationId}`}
                          className="hover:underline font-medium text-foreground"
                        >
                          {res.locationName || res.locationId}
                        </Link>
                      </td>
                      <td className="p-4 text-right align-middle tabular-nums font-semibold text-sm text-amber-600">
                        {formatInventoryNumber(res.quantity)}
                      </td>
                      <td className="p-4 align-middle text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          {res.sourceType === 'ORDER' ? (
                            <Link
                              href={`/orders/${res.sourceReference}`}
                              className="hover:underline text-foreground inline-flex items-center gap-1"
                            >
                              Order #{res.sourceReference}
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </Link>
                          ) : (
                            <span>
                              {res.sourceType} #{res.sourceReference}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        {isExpired ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <AlertTriangle className="h-3 w-3" />
                            Expired
                          </Badge>
                        ) : (
                          <Badge
                            variant={res.status === 'ACTIVE' ? 'default' : 'secondary'}
                          >
                            {res.status}
                          </Badge>
                        )}
                      </td>
                      <td className="p-4 align-middle text-muted-foreground whitespace-nowrap">
                        {res.expiresAt ? (
                          <span
                            className={isExpired ? 'text-destructive font-medium' : ''}
                            title={res.expiresAt}
                          >
                            {formatInventoryDate(res.expiresAt)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">No expiry</span>
                        )}
                      </td>
                      <td className="p-4 text-right align-middle">
                        {res.status === 'ACTIVE' ? (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="outline"
                                  size="xs"
                                  disabled={releasingId === res.id}
                                />
                              }
                            >
                              <Unlock className="mr-1 h-3 w-3 text-muted-foreground" />
                              {releasingId === res.id ? 'Releasing…' : 'Release'}
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Release this stock reservation?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will release <strong>{formatInventoryNumber(res.quantity)}</strong> units of{' '}
                                  <strong>{res.productTitle || res.sku}</strong> at{' '}
                                  <strong>{res.locationName}</strong> back to general available-to-sell inventory.
                                  Any pending fulfillment relying on this allocation will be impacted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRelease(res)}
                                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                  Confirm Release
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(hasNext || page > 1) && (
        <InventoryPager
          page={page}
          hasNext={hasNext}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
