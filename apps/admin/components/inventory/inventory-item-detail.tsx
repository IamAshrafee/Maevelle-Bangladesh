'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Package, AlertCircle } from 'lucide-react';
import Link from 'next/link';

import type { InventoryItemDetailDto } from '@maevelle/contracts';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryConditionBadge, InventoryEmptyState } from './inventory-page-ui';
import { InventorySourceLink } from './inventory-source-link';
import { StockTable } from './stock-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminCapability } from '@/components/admin-capabilities';

export function InventoryItemDetail({ inventoryItemId }: { inventoryItemId: string }) {
  const canAdjust = useAdminCapability('inventory.adjust');
  const canTransfer = useAdminCapability('inventory.transfer');
  const [item, setItem] = useState<InventoryItemDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    inventoryRequest<{ data: InventoryItemDetailDto }>(`/inventory/stock/${inventoryItemId}`, {
      signal: controller.signal,
    })
      .then((res) => {
        setItem(res.data);
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [inventoryItemId, reloadKey]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-1/3 animate-pulse bg-muted rounded-md" />
        <div className="h-[200px] w-full animate-pulse bg-muted rounded-md" />
        <div className="h-[400px] w-full animate-pulse bg-muted rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <InventoryEmptyState title="Inventory item unavailable" description={error.message} />
        <div className="flex justify-center">
          <Button onClick={() => setReloadKey((key) => key + 1)}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Button
          variant="outline"
          size="icon"
          render={<Link href="/inventory/stock" />}
          nativeButton={false}
          aria-label="Back to stock positions"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-pretty text-2xl font-bold tracking-tight">
              <Link className="hover:underline" href={`/products/${item.productId}`}>
                {item.productTitle}
              </Link>
            </h1>
            <Badge variant="secondary" className="font-mono">
              {item.sku}
            </Badge>
            <Badge variant="outline">{item.trackingMode}</Badge>
            {item.inventoryStatus === 'ARCHIVED' ? (
              <Badge variant="secondary">Archived</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">{item.optionSummary || 'Default variant'}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {canAdjust ? (
            <Button
              variant="outline"
              render={<Link href={`/inventory/adjustments?sku=${encodeURIComponent(item.sku)}`} />}
              nativeButton={false}
            >
              Adjust Stock
            </Button>
          ) : null}
          {canTransfer ? (
            <Button
              render={
                <Link href={`/inventory/transfers/new?sku=${encodeURIComponent(item.sku)}`} />
              }
              nativeButton={false}
            >
              Create Transfer
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total On Hand</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInventoryNumber(item.summary.onHand)}</div>
            <p className="text-xs text-muted-foreground">Across all locations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatInventoryNumber(item.summary.availableToSell)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reserved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInventoryNumber(item.summary.reserved)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unavailable</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatInventoryNumber(item.summary.unavailable)}
            </div>
          </CardContent>
        </Card>
      </div>

      {Number(item.summary.incomingSupply) > 0 ||
      Number(item.summary.incomingTransfer) > 0 ||
      Number(item.summary.outgoingTransfer) > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="font-medium">Open movement:</span>
          {Number(item.summary.incomingSupply) > 0 ? (
            <Badge variant="outline">
              {formatInventoryNumber(item.summary.incomingSupply)} incoming from supply
            </Badge>
          ) : null}
          {Number(item.summary.incomingTransfer) > 0 ? (
            <Badge variant="outline">
              {formatInventoryNumber(item.summary.incomingTransfer)} incoming transfer
            </Badge>
          ) : null}
          {Number(item.summary.outgoingTransfer) > 0 ? (
            <Badge variant="outline">
              {formatInventoryNumber(item.summary.outgoingTransfer)} outgoing transfer
            </Badge>
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="balances">
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            <TabsTrigger value="balances">Balances by Location</TabsTrigger>
            <TabsTrigger value="history">Recent Movements</TabsTrigger>
            <TabsTrigger value="reservations">
              Active Reservations
              {item.activeReservations.length > 0 && (
                <Badge variant="secondary" className="ml-2 bg-primary/10">
                  {item.activeReservations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

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
                <div className="p-8 text-center text-muted-foreground">
                  No recent movements found.
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Time
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Type
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Location
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Condition
                        </th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                          Change
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Reason
                        </th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {item.recentHistory.map((history) => (
                        <tr
                          key={history.id}
                          className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                        >
                          <td className="p-4 align-middle tabular-nums">
                            {formatInventoryDate(history.occurredAt)}
                          </td>
                          <td className="p-4 align-middle">
                            <Badge variant="outline">{history.transactionType}</Badge>
                          </td>
                          <td className="p-4 align-middle">
                            <Link
                              className="hover:underline"
                              href={`/inventory/warehouses/${history.locationId}`}
                            >
                              {history.locationName}
                            </Link>
                          </td>
                          <td className="p-4 align-middle">
                            <InventoryConditionBadge condition={history.condition} />
                          </td>
                          <td
                            className={`p-4 text-right align-middle tabular-nums font-medium ${Number(history.quantityDelta) > 0 ? 'text-green-600' : 'text-destructive'}`}
                          >
                            {Number(history.quantityDelta) > 0 ? '+' : ''}
                            {formatInventoryNumber(history.quantityDelta)}
                          </td>
                          <td className="p-4 align-middle text-muted-foreground">
                            <p>
                              {history.reasonText ?? history.reasonCode ?? 'No reason recorded'}
                            </p>
                            <div className="mt-1">
                              <InventorySourceLink record={history} />
                            </div>
                            <p className="mt-1 text-xs">
                              By {history.actorDisplayName ?? 'System'} · balance{' '}
                              {formatInventoryNumber(history.runningBalance)}
                            </p>
                          </td>
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
                <div className="p-8 text-center text-muted-foreground">
                  No active reservations for this item.
                </div>
              ) : (
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Location
                        </th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                          Quantity
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Source
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Reference
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {item.activeReservations.map((res) => (
                        <tr
                          key={res.id}
                          className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                        >
                          <td className="p-4 align-middle">
                            <Link
                              href={`/inventory/warehouses/${res.locationId}`}
                              className="hover:underline"
                            >
                              {res.locationName}
                            </Link>
                          </td>
                          <td className="p-4 text-right align-middle tabular-nums">
                            {formatInventoryNumber(res.quantity)}
                          </td>
                          <td className="p-4 align-middle">
                            <Badge variant="outline">{res.sourceType}</Badge>
                          </td>
                          <td className="p-4 align-middle font-mono text-xs">
                            {res.sourceReference}
                          </td>
                          <td className="p-4 align-middle tabular-nums">
                            {formatInventoryDate(res.createdAt)}
                          </td>
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
