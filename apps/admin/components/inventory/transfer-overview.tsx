'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { PaginatedDto, WarehouseTransferDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate } from '@/lib/inventory/api';
import { InventoryFeedback, InventoryEmptyState, InventoryPager } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TransferOverview() {
  const router = useRouter();
  const [transfers, setTransfers] = useState<readonly WarehouseTransferDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '25');
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);

    inventoryRequest<{ data: PaginatedDto<WarehouseTransferDto> }>(`/warehouse/transfers?${params.toString()}`)
      .then((res) => {
        setTransfers(res.data.items);
        setHasNext(res.data.items.length === 25);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [page, search, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transfers</h2>
          <p className="text-muted-foreground">Manage inventory transfers between locations.</p>
        </div>
        <Button onClick={() => router.push('/inventory/transfers/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Transfer
        </Button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search transfer number..."
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v || 'all'); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="READY">Ready</SelectItem>
              <SelectItem value="DISPATCHED">Dispatched</SelectItem>
              <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <InventoryFeedback isError message={error instanceof Error ? error.message : ''} />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : transfers.length === 0 ? (
        <InventoryEmptyState
          title="No transfers found"
          description={search || status !== 'all' ? "Try adjusting your filters." : "You haven't created any transfers yet."}
        />
      ) : (
        <div className="rounded-md border">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Transfer #</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Source</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground"></th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Destination</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">
                      <Link href={`/inventory/transfers/${transfer.id}`} className="hover:underline">
                        {transfer.transferNumber}
                      </Link>
                    </td>
                    <td className="p-4 align-middle">
                      <Badge variant="outline">{transfer.status}</Badge>
                    </td>
                    <td className="p-4 align-middle">
                      {transfer.sourceLocationName || transfer.sourceLocationId}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      <ArrowRight className="h-4 w-4" />
                    </td>
                    <td className="p-4 align-middle">
                      {transfer.destinationLocationName || transfer.destinationLocationId}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {formatInventoryDate(transfer.createdAt)}
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
