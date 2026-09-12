'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  AlertTriangle,
  ArrowRight,
  Plus,
  SlidersHorizontal,
  Truck,
  ClipboardCheck,
  Warehouse,
  History,
  TrendingDown,
  ShieldAlert,
  CheckCircle2,
  Clock,
} from 'lucide-react';

import type {
  InventoryStatsDto,
  WarehouseLocationDto,
  InventoryHistoryDto,
  InventoryBalanceDto,
  PaginatedDto,
} from '@maevelle/contracts';

import { inventoryRequest, formatInventoryNumber, formatInventoryDate } from '@/lib/inventory/api';
import { InventoryFeedback } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function InventoryDashboard() {
  const router = useRouter();

  const [stats, setStats] = useState<InventoryStatsDto | null>(null);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [lowStockItems, setLowStockItems] = useState<
    (InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string })[]
  >([]);
  const [outOfStockItems, setOutOfStockItems] = useState<
    (InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string })[]
  >([]);
  const [recentMovements, setRecentMovements] = useState<InventoryHistoryDto[]>([]);
  const [activeReservationsCount, setActiveReservationsCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.allSettled([
      // 1. Stats
      inventoryRequest<{ data: InventoryStatsDto }>('/inventory/stats'),
      // 2. Locations
      inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations'),
      // 3. Low stock items
      inventoryRequest<{
        data: PaginatedDto<InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string }>;
      }>('/inventory/stock?availability=LOW_STOCK&limit=6'),
      // 4. Out of stock items
      inventoryRequest<{
        data: PaginatedDto<InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string }>;
      }>('/inventory/stock?availability=OUT_OF_STOCK&limit=6'),
      // 5. Recent history
      inventoryRequest<{ data: PaginatedDto<InventoryHistoryDto> }>('/inventory/history?limit=8'),
      // 6. Active reservations
      inventoryRequest<{ data: { totalCount?: number; items: unknown[] } }>('/inventory/reservations?status=ACTIVE&limit=1'),
    ])
      .then(([statsRes, locRes, lowRes, outRes, histRes, resRes]) => {
        if (!isMounted) return;

        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        if (locRes.status === 'fulfilled') setLocations(locRes.value.data);
        if (lowRes.status === 'fulfilled') setLowStockItems(lowRes.value.data.items as any);
        if (outRes.status === 'fulfilled') setOutOfStockItems(outRes.value.data.items as any);
        if (histRes.status === 'fulfilled') setRecentMovements(histRes.value.data.items as any);
        if (resRes.status === 'fulfilled') {
          setActiveReservationsCount(resRes.value.data.totalCount ?? resRes.value.data.items.length);
        }
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">
            Multi-location ledger, stock availability, transfers, and warehouse operations.
          </p>
        </div>

        {/* Fast Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/inventory/adjustments')}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            Adjust Stock
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/inventory/transfers/new')}>
            <Truck className="mr-1.5 h-4 w-4" />
            New Transfer
          </Button>
          <Button size="sm" onClick={() => router.push('/inventory/stocktakes/new')}>
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            Start Stocktake
          </Button>
        </div>
      </div>

      {error && <InventoryFeedback isError message={error} />}

      {/* Primary KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total On Hand</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold">
              {isLoading ? '—' : formatInventoryNumber(stats?.totalOnHand ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Physical ledger units</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Available to Sell</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600">
              {isLoading ? '—' : formatInventoryNumber(stats?.totalAvailable ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Unallocated sellable</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Reserved</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-amber-600">
              {isLoading ? '—' : formatInventoryNumber(stats?.totalReserved ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{activeReservationsCount} active holds</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Damaged / Hold</CardTitle>
            <ShieldAlert className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-rose-600">
              {isLoading ? '—' : formatInventoryNumber(stats?.totalDamaged ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Non-sellable condition</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Low Stock SKUs</CardTitle>
            <TrendingDown className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-amber-600">
              {isLoading ? '—' : stats?.lowStockCount ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">≤ 5 units available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Out of Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-rose-600">
              {isLoading ? '—' : stats?.outOfStockCount ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">0 units available</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Operations Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Columns: Alerts & Movements */}
        <div className="space-y-6 lg:col-span-2">
          {/* Stock Attention List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Stock Attention Required
                  </CardTitle>
                  <CardDescription>Items that are depleted or approaching threshold.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" render={<Link href="/inventory/stock?availability=LOW_STOCK" />} className="text-xs">
                  View full stock table <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="low">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="low" className="text-xs">
                    Low Stock ({stats?.lowStockCount ?? lowStockItems.length})
                  </TabsTrigger>
                  <TabsTrigger value="out" className="text-xs">
                    Out of Stock ({stats?.outOfStockCount ?? outOfStockItems.length})
                  </TabsTrigger>
                </TabsList>

                {/* Low Stock Tab */}
                <TabsContent value="low" className="m-0">
                  {lowStockItems.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No items currently in low stock state.
                    </div>
                  ) : (
                    <div className="divide-y rounded-md border text-sm">
                      {lowStockItems.map((item) => (
                        <div
                          key={`${item.inventoryItemId}-${item.locationId}`}
                          className="flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <Link
                              href={`/inventory/stock/${item.inventoryItemId}`}
                              className="font-medium hover:underline text-foreground block truncate"
                            >
                              {item.productTitle || item.sku}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="font-mono">{item.sku}</span>
                              <span>•</span>
                              <span>{item.locationName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="font-semibold text-amber-600">
                                {formatInventoryNumber(item.availableToSell)} avail
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {formatInventoryNumber(item.onHand)} on hand
                              </div>
                            </div>
                            <Button
                              size="xs"
                              variant="outline"
                              render={
                                <Link
                                  href={`/inventory/adjustments?sku=${encodeURIComponent(item.sku)}&locationId=${item.locationId}`}
                                />
                              }
                            >
                              Adjust
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Out of Stock Tab */}
                <TabsContent value="out" className="m-0">
                  {outOfStockItems.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No items currently out of stock.
                    </div>
                  ) : (
                    <div className="divide-y rounded-md border text-sm">
                      {outOfStockItems.map((item) => (
                        <div
                          key={`${item.inventoryItemId}-${item.locationId}`}
                          className="flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <Link
                              href={`/inventory/stock/${item.inventoryItemId}`}
                              className="font-medium hover:underline text-foreground block truncate"
                            >
                              {item.productTitle || item.sku}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="font-mono">{item.sku}</span>
                              <span>•</span>
                              <span>{item.locationName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge variant="destructive" className="text-xs">
                              0 Available
                            </Badge>
                            <Button
                              size="xs"
                              variant="outline"
                              render={
                                <Link
                                  href={`/inventory/adjustments?sku=${encodeURIComponent(item.sku)}&locationId=${item.locationId}`}
                                />
                              }
                            >
                              Restock
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Recent Movements Feed */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    Recent Inventory Transactions
                  </CardTitle>
                  <CardDescription>Latest movements recorded across all warehouses.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" render={<Link href="/inventory/history" />} className="text-xs">
                  View ledger <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentMovements.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No inventory transactions recorded yet.
                </div>
              ) : (
                <div className="divide-y rounded-md border text-sm">
                  {recentMovements.map((move) => {
                    const isPositive = Number(move.quantityDelta) > 0;
                    const isNegative = Number(move.quantityDelta) < 0;

                    return (
                      <div
                        key={move.id}
                        className="flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wider">
                              {move.transactionType}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              {move.sku}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                            <span>{move.locationName}</span>
                            <span>•</span>
                            <span>{formatInventoryDate(move.occurredAt)}</span>
                            {move.reasonCode && (
                              <>
                                <span>•</span>
                                <span className="italic text-foreground/70">{move.reasonCode}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div
                          className={`font-semibold tabular-nums shrink-0 ${
                            isPositive
                              ? 'text-emerald-600'
                              : isNegative
                                ? 'text-rose-600'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {formatInventoryNumber(move.quantityDelta)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Facilities & Quick Navigation */}
        <div className="space-y-6">
          {/* Facilities Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  Locations & Facilities
                </CardTitle>
                <Button variant="ghost" size="sm" render={<Link href="/inventory/warehouses" />} className="text-xs">
                  Manage <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
              <CardDescription>{locations.length} registered locations in network</CardDescription>
            </CardHeader>
            <CardContent>
              {locations.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No locations registered.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {locations.map((loc) => (
                    <Link
                      key={loc.id}
                      href={`/inventory/warehouses/${loc.id}`}
                      className="block p-3 rounded-lg border hover:border-primary/50 transition-colors bg-card"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{loc.name}</div>
                        <Badge
                          variant={loc.status === 'ACTIVE' ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
                          {loc.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-muted-foreground">{loc.code}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {loc.locationType.toLowerCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {loc.capabilities.map((cap) => (
                          <Badge
                            key={cap}
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 font-normal"
                          >
                            {cap.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Operational Hub Quick Links */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Operational Workflows</CardTitle>
              <CardDescription>Direct shortcuts to lifecycle modules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link
                href="/inventory/transfers"
                className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Truck className="h-4 w-4 text-primary" />
                  <div>
                    <div className="font-medium text-xs">Transfers & Shipments</div>
                    <div className="text-[11px] text-muted-foreground">Inter-warehouse movements</div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>

              <Link
                href="/inventory/stocktakes"
                className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <div>
                    <div className="font-medium text-xs">Stocktakes & Audits</div>
                    <div className="text-[11px] text-muted-foreground">Snapshot counts and reconciliations</div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>

              <Link
                href="/inventory/reservations"
                className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-primary" />
                  <div>
                    <div className="font-medium text-xs">Active Reservations</div>
                    <div className="text-[11px] text-muted-foreground">Allocations for orders & transfers</div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>

              <Link
                href="/inventory/adjustments"
                className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <div>
                    <div className="font-medium text-xs">Manual Adjustments</div>
                    <div className="text-[11px] text-muted-foreground">Direct write-offs and corrections</div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
