'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, MapPin, Package, AlertCircle } from 'lucide-react';
import Link from 'next/link';

import type { InventoryItemDetailDto, WarehouseLocationDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryConditionBadge, InventoryEmptyState, InventoryFeedback } from './inventory-page-ui';
import { StockTable } from './stock-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function InventoryItemDetail({ inventoryItemId }: { inventoryItemId: string }) {
  const router = useRouter();
  const [item, setItem] = useState<InventoryItemDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    inventoryRequest<{ data: InventoryItemDetailDto }>(`/inventory/stock/${inventoryItemId}`)
      .then((res) => {
        setItem(res.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [inventoryItemId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-1/3 animate-pulse bg-muted rounded-md" />
        <div className="h-[200px] w-full animate-pulse bg-muted rounded-md" />
        <div className="h-[400px] w-full animate-pulse bg-muted rounded-md" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <InventoryEmptyState
        title="Item not found"
        description="The requested inventory item could not be found or you don't have permission to view it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/inventory/stock')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{item.productTitle}</h2>
            <Badge variant="secondary" className="font-mono">{item.sku}</Badge>
            <Badge variant="outline">{item.trackingMode}</Badge>
          </div>
          <p className="text-muted-foreground">{item.optionSummary || 'Default variant'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/inventory/adjustments?variantId=${item.variantId}`)}>
            Adjust Stock
          </Button>
          <Button onClick={() => router.push(`/inventory/transfers/new`)}>
            Create Transfer
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total On Hand</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatInventoryNumber(item.balances.reduce((acc: number, b: any) => acc + Number(b.onHand), 0))}
            </div>
            <p className="text-xs text-muted-foreground">Across all locations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatInventoryNumber(item.balances.reduce((acc: number, b: any) => acc + Number(b.availableToSell), 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reserved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatInventoryNumber(item.balances.reduce((acc: number, b: any) => acc + Number(b.reserved), 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Damaged / Quarantine</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatInventoryNumber(item.balances.filter((b: any) => b.condition !== 'SELLABLE').reduce((acc: number, b: any) => acc + Number(b.onHand), 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances by Location</TabsTrigger>
          <TabsTrigger value="history">Recent Movements</TabsTrigger>
          <TabsTrigger value="reservations">
            Active Reservations
            {item.activeReservations.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/10">{item.activeReservations.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <StockTable balances={item.balances} hideLocation={false} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {item.recentHistory.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No recent movements found.</div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Time</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Location</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Condition</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Change</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {item.recentHistory.map((history: any) => (
                        <tr key={history.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                          <td className="p-4 align-middle tabular-nums">{formatInventoryDate(history.occurredAt)}</td>
                          <td className="p-4 align-middle"><Badge variant="outline">{history.transactionType}</Badge></td>
                          <td className="p-4 align-middle flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground"/> {history.locationName}</td>
                          <td className="p-4 align-middle"><InventoryConditionBadge condition={history.condition} /></td>
                          <td className={`p-4 text-right align-middle tabular-nums font-medium ${Number(history.quantityDelta) > 0 ? 'text-green-600' : 'text-destructive'}`}>
                            {Number(history.quantityDelta) > 0 ? '+' : ''}{formatInventoryNumber(history.quantityDelta)}
                          </td>
                          <td className="p-4 align-middle text-muted-foreground">{history.reasonCode || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {item.activeReservations.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No active reservations for this item.</div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Location</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Quantity</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Source</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Reference</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Created</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {item.activeReservations.map((res: any) => (
                        <tr key={res.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                          <td className="p-4 align-middle"><Link href={`/inventory/warehouses/${res.locationId}`} className="hover:underline">{res.locationName}</Link></td>
                          <td className="p-4 text-right align-middle tabular-nums">{formatInventoryNumber(res.quantity)}</td>
                          <td className="p-4 align-middle"><Badge variant="outline">{res.sourceType}</Badge></td>
                          <td className="p-4 align-middle font-mono text-xs">{res.sourceReference}</td>
                          <td className="p-4 align-middle tabular-nums">{formatInventoryDate(res.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
