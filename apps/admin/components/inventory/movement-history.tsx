'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowUpDown, Filter, RotateCcw } from 'lucide-react';

import type { PaginatedDto, InventoryHistoryDto, WarehouseLocationDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryFeedback, InventoryEmptyState, InventoryPager } from './inventory-page-ui';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TRANSACTION_TYPES = [
  { value: 'all', label: 'All Transaction Types' },
  { value: 'RECEIVE', label: 'Receive (Inbound)' },
  { value: 'DISPATCH', label: 'Dispatch (Outbound)' },
  { value: 'ADJUSTMENT', label: 'Manual Adjustment' },
  { value: 'RECONCILIATION', label: 'Stocktake Reconciliation' },
  { value: 'CONDITION_TRANSFER', label: 'Condition Move' },
  { value: 'RESERVATION_HOLD', label: 'Reservation Hold' },
  { value: 'RESERVATION_RELEASE', label: 'Reservation Release' },
];

function TransactionBadge({ type }: { type: string }) {
  switch (type) {
    case 'RECEIVE':
      return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-300 dark:border-emerald-800">Receive</Badge>;
    case 'DISPATCH':
      return <Badge className="bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 border-sky-300 dark:border-sky-800">Dispatch</Badge>;
    case 'ADJUSTMENT':
      return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border-amber-300 dark:border-amber-800">Adjustment</Badge>;
    case 'RECONCILIATION':
      return <Badge className="bg-purple-500/15 text-purple-700 hover:bg-purple-500/25 border-purple-300 dark:border-purple-800">Reconciliation</Badge>;
    case 'CONDITION_TRANSFER':
      return <Badge className="bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 border-orange-300 dark:border-orange-800">Condition Move</Badge>;
    default:
      return <Badge variant="outline">{type.replace(/_/g, ' ')}</Badge>;
  }
}

export function MovementHistory() {
  const [history, setHistory] = useState<readonly (InventoryHistoryDto & { inventoryItemId?: string })[]>([]);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [page, setPage] = useState(1);
  const [locationId, setLocationId] = useState<string>('all');
  const [transactionType, setTransactionType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [hasNext, setHasNext] = useState(false);

  // Fetch locations once
  useEffect(() => {
    inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations')
      .then((res) => setLocations(res.data || []))
      .catch(console.error);
  }, []);

  // Fetch movements whenever filters change
  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '50');
    if (locationId !== 'all') params.set('locationId', locationId);
    if (transactionType !== 'all') params.set('transactionType', transactionType);

    inventoryRequest<{ data: PaginatedDto<InventoryHistoryDto & { inventoryItemId?: string }> }>(
      `/inventory/history?${params.toString()}`,
    )
      .then((res) => {
        setHistory(res.data.items);
        setHasNext(res.data.items.length === 50);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [page, locationId, transactionType]);

  // Client-side SKU search filtering if needed
  const filteredHistory = history.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.sku.toLowerCase().includes(q) ||
      item.locationName.toLowerCase().includes(q) ||
      (item.reasonCode && item.reasonCode.toLowerCase().includes(q))
    );
  });

  const handleResetFilters = () => {
    setLocationId('all');
    setTransactionType('all');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters = locationId !== 'all' || transactionType !== 'all' || search.trim() !== '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movement History</h1>
          <p className="text-sm text-muted-foreground">
            Complete double-entry audit ledger of all inventory transactions and condition changes.
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
              placeholder="Search by SKU, warehouse, note…"
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

          {/* Transaction Type Select */}
          <Select
            value={transactionType}
            onValueChange={(v) => {
              setTransactionType(v || 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px] text-xs h-9">
              <SelectValue placeholder="All Transaction Types" />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
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
          Showing {filteredHistory.length} records
        </div>
      </div>

      <InventoryFeedback isError message={error instanceof Error ? error.message : ''} />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <InventoryEmptyState
          title="No history records found"
          description={
            hasActiveFilters
              ? 'No movements match your current filters. Try resetting the filters.'
              : 'No inventory movements have been recorded yet in the ledger.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider font-semibold border-b">
                <tr>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Item / SKU</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Location</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Transaction</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Condition</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Delta</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Reason / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {filteredHistory.map((record) => {
                  const deltaNum = Number(record.quantityDelta);
                  const isPositive = deltaNum > 0;
                  const isNegative = deltaNum < 0;

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="p-4 align-middle text-muted-foreground whitespace-nowrap">
                        {formatInventoryDate(record.occurredAt)}
                      </td>
                      <td className="p-4 align-middle">
                        {record.inventoryItemId ? (
                          <Link
                            href={`/inventory/stock/${record.inventoryItemId}`}
                            className="font-mono font-medium hover:underline text-foreground"
                          >
                            {record.sku}
                          </Link>
                        ) : (
                          <span className="font-mono font-medium">{record.sku}</span>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        <span className="font-medium text-foreground">{record.locationName}</span>
                      </td>
                      <td className="p-4 align-middle">
                        <TransactionBadge type={record.transactionType} />
                      </td>
                      <td className="p-4 align-middle">
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {record.condition}
                        </span>
                      </td>
                      <td
                        className={`p-4 text-right align-middle tabular-nums font-semibold text-sm ${
                          isPositive
                            ? 'text-emerald-600'
                            : isNegative
                              ? 'text-rose-600'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {formatInventoryNumber(record.quantityDelta)}
                      </td>
                      <td className="p-4 align-middle text-muted-foreground max-w-[220px] truncate" title={record.reasonCode || ''}>
                        {record.reasonCode ? (
                          <span className="font-mono text-foreground/80">{record.reasonCode}</span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
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
