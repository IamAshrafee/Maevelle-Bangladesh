'use client';

import * as React from 'react';
type InventoryBalanceDto = any;
import { Worklist, WorklistToolbar, useWorklist, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function StockWorklist({ balances }: { balances: readonly InventoryBalanceDto[] }) {
  return (
    <Worklist>
      <StockWorklistContent balances={balances} />
    </Worklist>
  );
}

function StockWorklistContent({ balances }: { balances: readonly InventoryBalanceDto[] }) {
  const { searchQuery, filters, setFilter, sort, setSort, selectedIds, toggleSelection, toggleAll } = useWorklist();

  const locations = React.useMemo(() => Array.from(new Set(balances.map(b => b.locationName))), [balances]);

  const filteredBalances = React.useMemo(() => {
    return balances.filter(b => {
      // Search
      if (searchQuery && !`${b.sku} ${b.productTitle} ${b.locationName}`.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Filters
      if (filters.location && b.locationName !== filters.location) return false;
      if (filters.condition && b.condition !== filters.condition) return false;
      if (filters.availability === 'out_of_stock' && Number(b.availableToSell) > 0) return false;
      if (filters.availability === 'in_stock' && Number(b.availableToSell) <= 0) return false;
      if (filters.availability === 'low_stock' && (Number(b.availableToSell) <= 0 || Number(b.availableToSell) > 5)) return false;

      return true;
    }).sort((a, b) => {
      if (!sort) return 0;
      let cmp = 0;
      if (sort.column === 'product') cmp = a.productTitle.localeCompare(b.productTitle);
      else if (sort.column === 'sku') cmp = a.sku.localeCompare(b.sku);
      else if (sort.column === 'location') cmp = a.locationName.localeCompare(b.locationName);
      else if (sort.column === 'onHand') cmp = Number(a.onHand) - Number(b.onHand);
      else if (sort.column === 'ats') cmp = Number(a.availableToSell) - Number(b.availableToSell);
      
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [balances, searchQuery, filters, sort]);

  const allIds = filteredBalances.map(b => b.inventoryItemId);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));

  return (
    <div className="flex flex-col gap-4">
      <WorklistToolbar searchPlaceholder="Search SKU or Product...">
        <Select value={filters.location || ''} onValueChange={(v) => setFilter('location', v === 'all' ? null : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.condition || ''} onValueChange={(v) => setFilter('condition', v === 'all' ? null : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Condition</SelectItem>
            <SelectItem value="SELLABLE">Sellable</SelectItem>
            <SelectItem value="DAMAGED">Damaged</SelectItem>
            <SelectItem value="QUARANTINE">Quarantine</SelectItem>
            <SelectItem value="INSPECTION">Inspection</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.availability || ''} onValueChange={(v) => setFilter('availability', v === 'all' ? null : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Availability</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="low_stock">Low Stock (≤ 5)</SelectItem>
            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </WorklistToolbar>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input 
                  type="checkbox" 
                  checked={allSelected} 
                  onChange={() => toggleAll(allIds)} 
                  className="rounded border-gray-300"
                />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort('product')}>Product</TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort('sku')}>SKU</TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort('location')}>Warehouse</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => setSort('onHand')}>On Hand</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => setSort('ats')}>ATS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBalances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No inventory balances found.
                </TableCell>
              </TableRow>
            ) : (
              filteredBalances.map((balance) => (
                <TableRow key={balance.inventoryItemId} data-state={selectedIds.has(balance.inventoryItemId) ? 'selected' : undefined}>
                  <TableCell>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(balance.inventoryItemId)} 
                      onChange={() => toggleSelection(balance.inventoryItemId)}
                      className="rounded border-gray-300"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{balance.productTitle}</TableCell>
                  <TableCell className="text-muted-foreground">{balance.sku}</TableCell>
                  <TableCell>{balance.locationName}</TableCell>
                  <TableCell>
                    <Badge variant={balance.condition === 'SELLABLE' ? 'default' : 'secondary'}>
                      {balance.condition}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{balance.onHand}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{balance.reserved}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={Number(balance.availableToSell) > 0 ? 'default' : 'destructive'}>
                      {balance.availableToSell}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
