'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, ClipboardList } from 'lucide-react';
import Link from 'next/link';

import type { PaginatedDto, StocktakeSessionDto } from '@maevelle/contracts';

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

export function StocktakeOverview() {
  const router = useRouter();
  const [stocktakes, setStocktakes] = useState<readonly StocktakeSessionDto[]>([]);
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
    if (status !== 'all') params.set('status', status);

    inventoryRequest<{ data: PaginatedDto<StocktakeSessionDto> }>(`/inventory/stocktakes?${params.toString()}`)
      .then((res) => {
        setStocktakes(res.data.items);
        setHasNext(res.data.items.length === 25);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [page, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stocktakes</h2>
          <p className="text-muted-foreground">Conduct physical inventory counts and reconcile variances.</p>
        </div>
        <Button onClick={() => router.push('/inventory/stocktakes/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Start Stocktake
        </Button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search stocktakes..."
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
              <SelectItem value="COUNTING">Counting</SelectItem>
              <SelectItem value="REVIEW">Reviewing</SelectItem>
              <SelectItem value="POSTED">Posted</SelectItem>
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
      ) : stocktakes.length === 0 ? (
        <InventoryEmptyState
          title="No stocktakes found"
          description={status !== 'all' ? "Try adjusting your filters." : "You haven't conducted any stocktakes yet."}
        />
      ) : (
        <div className="rounded-md border">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">ID</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Location</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Started At</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Completed At</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {stocktakes.map((stocktake) => (
                  <tr key={stocktake.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <td className="p-4 align-middle font-medium">
                      <Link href={`/inventory/stocktakes/${stocktake.id}`} className="hover:underline flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        {stocktake.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-4 align-middle">
                      <Badge variant={stocktake.status === 'COUNTING' ? 'default' : 'outline'}>{stocktake.status}</Badge>
                    </td>
                    <td className="p-4 align-middle">
                      {stocktake.locationId}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {formatInventoryDate(stocktake.snapshotAt)}
                    </td>
                    <td className="p-4 align-middle text-muted-foreground">
                      {stocktake.postedAt ? formatInventoryDate(stocktake.postedAt) : '-'}
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
