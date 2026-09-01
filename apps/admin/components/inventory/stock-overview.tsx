'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';


import type { InventoryBalanceDto, InventoryStatsDto, PaginatedDto, WarehouseLocationDto } from '@maevelle/contracts';

import { inventoryRequest } from '@/lib/inventory/api';
import { InventoryEmptyState, InventoryFeedback, InventoryPager, InventoryStatCards } from './inventory-page-ui';
import { StockTable } from './stock-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';


export function StockOverview() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState<string>('all');
  const [condition, setCondition] = useState<string>('all');
  const [availability, setAvailability] = useState<string>('all');

  const [stats, setStats] = useState<InventoryStatsDto | null>(null);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  
  const [balancesData, setBalancesData] = useState<PaginatedDto<InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string }> | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    inventoryRequest<{ data: InventoryStatsDto }>('/inventory/stats')
      .then((res) => setStats(res.data))
      .catch(console.error);

    inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations')
      .then((res) => setLocations(res.data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setBalancesLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '25');
    if (search) params.set('search', search);
    if (locationId !== 'all') params.set('locationId', locationId);
    if (condition !== 'all') params.set('condition', condition);
    if (availability !== 'all') params.set('availability', availability);
    
    inventoryRequest<{ data: PaginatedDto<InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string }> }>(
      `/inventory/stock?${params.toString()}`
    )
      .then((res) => {
        setBalancesData(res.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setBalancesLoading(false));
  }, [page, search, locationId, condition, availability]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stock Overview</h2>
          <p className="text-muted-foreground">Manage and track your inventory across all locations.</p>
        </div>
        <Button onClick={() => router.push('/inventory/adjustments')}>Adjust Stock</Button>
      </div>

      <InventoryStatCards
        stats={[
          {
            label: 'Total On Hand',
            value: stats?.totalOnHand ?? '-',
            description: 'Physical items in warehouses',
          },
          {
            label: 'Total Available',
            value: stats?.totalAvailable ?? '-',
            description: 'Available to sell',
          },
          {
            label: 'Total Reserved',
            value: stats?.totalReserved ?? '-',
            description: 'Reserved for orders/transfers',
          },
          {
            label: 'Low Stock Items',
            value: stats?.lowStockCount ?? '-',
            description: 'SKUs with ≤ 5 available',
          },
        ]}
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search SKU or product..."
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
          <Select value={locationId} onValueChange={(v) => { setLocationId(v || 'all'); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations?.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={condition} onValueChange={(v) => { setCondition(v || 'all'); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Conditions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              <SelectItem value="SELLABLE">Sellable</SelectItem>
              <SelectItem value="DAMAGED">Damaged</SelectItem>
              <SelectItem value="QUARANTINE">Quarantine</SelectItem>
              <SelectItem value="INSPECTION">Inspection</SelectItem>
            </SelectContent>
          </Select>

          <Select value={availability} onValueChange={(v) => { setAvailability(v || 'all'); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Availability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Availability</SelectItem>
              <SelectItem value="IN_STOCK">In Stock</SelectItem>
              <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
              <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <InventoryFeedback
        isError
        message={error instanceof Error ? error.message : ''}
      />

      <StockTable
        balances={balancesData?.items ?? []}
        isLoading={balancesLoading}
      />

      {balancesData && (balancesData.items.length === 25 || page > 1) && (
        <InventoryPager
          page={page}
          hasNext={balancesData.items.length === 25}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
