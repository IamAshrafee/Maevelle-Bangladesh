'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';

import type { PaginatedDto, InventoryReservationDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryFeedback, InventoryEmptyState, InventoryPager } from './inventory-page-ui';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ReservationsList() {
  const [reservations, setReservations] = useState<readonly InventoryReservationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [page, setPage] = useState(1);
  const [locationId, setLocationId] = useState<string>('all');
  const [status, setStatus] = useState<string>('ACTIVE');
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '50');
    if (locationId !== 'all') params.set('locationId', locationId);
    if (status !== 'all') params.set('status', status);

    inventoryRequest<{ data: PaginatedDto<InventoryReservationDto> }>(`/inventory/reservations?${params.toString()}`)
      .then((res) => {
        setReservations(res.data.items);
        setHasNext(res.data.items.length === 50);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [page, locationId, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reservations</h2>
          <p className="text-muted-foreground">View stock currently held for orders and active transfers.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={locationId} onValueChange={(v) => { setLocationId(v || 'all'); setPage(1); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {/* Could fetch and list actual locations here */}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => { setStatus(v || 'all'); setPage(1); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="FULFILLED">Fulfilled</SelectItem>
              <SelectItem value="EXPIRED">Expired / Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <InventoryFeedback isError message={error instanceof Error ? error.message : ''} />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : reservations.length === 0 ? (
        <InventoryEmptyState
          title="No reservations found"
          description={locationId !== 'all' || status !== 'all' ? "Try adjusting your filters." : "There are currently no reserved items."}
        />
      ) : (
        <div className="rounded-md border">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Product</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Location</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Quantity</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Reference</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {reservations.map((res) => (
                  <tr key={res.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle">
                      <div className="font-medium">
                        <Link href={`/inventory/stock/${res.inventoryItemId}`} className="hover:underline">
                          {res.productTitle || res.inventoryItemId}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{res.sku}</div>
                    </td>
                    <td className="p-4 align-middle">
                      <Link href={`/inventory/warehouses/${res.locationId}`} className="hover:underline">
                        {res.locationName || res.locationId}
                      </Link>
                    </td>
                    <td className="p-4 text-right align-middle tabular-nums font-medium">
                      {formatInventoryNumber(res.quantity)}
                    </td>
                    <td className="p-4 align-middle text-xs font-mono text-muted-foreground">
                      {res.sourceType === 'ORDER' ? (
                        <span>Order #{res.sourceReference}</span>
                      ) : (
                        <span>Transfer #{res.sourceReference}</span>
                      )}
                    </td>
                    <td className="p-4 align-middle">
                      <Badge variant={res.status === 'ACTIVE' ? 'default' : 'outline'}>{res.status}</Badge>
                    </td>
                    <td className="p-4 align-middle text-muted-foreground whitespace-nowrap">
                      {res.expiresAt ? formatInventoryDate(res.expiresAt) : '-'}
                    </td>
                  </tr>
                ))}
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
