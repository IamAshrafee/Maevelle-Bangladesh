'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

import type { PaginatedDto, InventoryHistoryDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryFeedback, InventoryEmptyState, InventoryPager } from './inventory-page-ui';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function MovementHistory() {
  const [history, setHistory] = useState<readonly InventoryHistoryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [page, setPage] = useState(1);
  const [locationId, setLocationId] = useState<string>('all');
  const [transactionType, setTransactionType] = useState<string>('all');
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '50');
    if (locationId !== 'all') params.set('locationId', locationId);
    if (transactionType !== 'all') params.set('transactionType', transactionType);

    inventoryRequest<{ data: PaginatedDto<InventoryHistoryDto> }>(`/inventory/history?${params.toString()}`)
      .then((res) => {
        setHistory(res.data.items);
        setHasNext(res.data.items.length === 50);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [page, locationId, transactionType]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Movement History</h2>
          <p className="text-muted-foreground">Ledger of all inventory transactions and adjustments.</p>
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

          <Select value={transactionType} onValueChange={(v) => { setTransactionType(v || 'all'); setPage(1); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Transaction Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="RECEIVE">Receive</SelectItem>
              <SelectItem value="DISPATCH">Dispatch</SelectItem>
              <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
              <SelectItem value="RECONCILIATION">Reconciliation</SelectItem>
              <SelectItem value="CONDITION_TRANSFER">Condition Transfer</SelectItem>
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
      ) : history.length === 0 ? (
        <InventoryEmptyState
          title="No history found"
          description={locationId !== 'all' || transactionType !== 'all' ? "Try adjusting your filters." : "No inventory movements have been recorded."}
        />
      ) : (
        <div className="rounded-md border">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Time</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Item / Location</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Transaction</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Delta</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Reason</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {history.map((record) => {
                  const isPositive = Number(record.quantityDelta) > 0;
                  const isNegative = Number(record.quantityDelta) < 0;
                  
                  return (
                    <tr key={record.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle text-muted-foreground whitespace-nowrap">
                        {formatInventoryDate(record.occurredAt)}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="font-medium">{record.sku}</div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          <span>{record.locationName}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <Badge variant="outline">{record.transactionType}</Badge>
                      </td>
                      <td className={`p-4 text-right align-middle tabular-nums font-medium ${isPositive ? 'text-green-600' : isNegative ? 'text-destructive' : ''}`}>
                        {isPositive ? '+' : ''}{formatInventoryNumber(record.quantityDelta)}
                      </td>
                      <td className="p-4 align-middle text-muted-foreground text-xs max-w-[200px] truncate" title={record.reasonCode || ''}>
                        {record.reasonCode || '-'}
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
