'use client';

import Link from 'next/link';

import type { InventoryBalanceDto } from '@maevelle/contracts';

import { InventoryConditionBadge, InventoryEmptyState } from './inventory-page-ui';
import { formatInventoryNumber } from '@/lib/inventory/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function StockTable({
  balances,
  isLoading,
  hideLocation = false,
  onAdjust,
}: {
  balances: readonly InventoryBalanceDto[];
  isLoading?: boolean;
  hideLocation?: boolean;
  onAdjust?: (balance: InventoryBalanceDto) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 w-full animate-pulse bg-muted rounded-md" />
        ))}
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <InventoryEmptyState
        title="No inventory balances"
        description="There is no stock matching your current filters."
      />
    );
  }

  return (
    <div className="rounded-md border">
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Product</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">SKU</th>
              {!hideLocation && (
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Location</th>
              )}
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Condition</th>
              <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">On Hand</th>
              <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Reserved</th>
              <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Available</th>
              <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {balances.map((balance) => (
              <tr
                key={`${balance.inventoryItemId}-${balance.locationId}-${balance.condition}`}
                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                <td className="p-4 align-middle font-medium">
                  <Link href={`/inventory/stock/${balance.inventoryItemId}`} className="hover:underline">
                    {balance.productTitle}
                  </Link>
                </td>
                <td className="p-4 align-middle">
                  <Badge variant="outline" className="font-mono text-xs">
                    {balance.sku}
                  </Badge>
                </td>
                {!hideLocation && (
                  <td className="p-4 align-middle">
                    <Link href={`/inventory/warehouses/${balance.locationId}`} className="hover:underline">
                      {balance.locationName}
                    </Link>
                  </td>
                )}
                <td className="p-4 align-middle">
                  <InventoryConditionBadge condition={balance.condition} />
                </td>
                <td className="p-4 text-right align-middle tabular-nums">
                  {formatInventoryNumber(balance.onHand)}
                </td>
                <td className="p-4 text-right align-middle tabular-nums text-muted-foreground">
                  {formatInventoryNumber(balance.reserved)}
                </td>
                <td className="p-4 text-right align-middle tabular-nums font-medium">
                  {formatInventoryNumber(balance.availableToSell)}
                </td>
                <td className="p-4 text-right align-middle">
                  {onAdjust && (
                    <Button variant="ghost" size="sm" onClick={() => onAdjust(balance)}>
                      Adjust
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
