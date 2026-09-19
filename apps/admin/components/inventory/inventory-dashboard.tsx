'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  AlertTriangle,
  ArrowRight,
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
  InventoryPositionDto,
  PaginatedDto,
} from '@maevelle/contracts';

import { inventoryRequest, formatInventoryNumber, formatInventoryDate } from '@/lib/inventory/api';
import { InventoryFeedback } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';
import { cn } from '@/lib/utils';
import { useAdminCapability } from '@/components/admin-capabilities';

export function InventoryDashboard() {
  const router = useRouter();
  const canAdjust = useAdminCapability('inventory.adjust');
  const canTransfer = useAdminCapability('inventory.transfer');
  const canStocktake = useAdminCapability('inventory.stocktake');

  const [stats, setStats] = useState<InventoryStatsDto | null>(null);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [lowStockItems, setLowStockItems] = useState<readonly InventoryPositionDto[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<readonly InventoryPositionDto[]>([]);
  const [lowStockTotal, setLowStockTotal] = useState(0);
  const [outOfStockTotal, setOutOfStockTotal] = useState(0);
  const [recentMovements, setRecentMovements] = useState<readonly InventoryHistoryDto[]>([]);
  const [activeReservationsCount, setActiveReservationsCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');

    Promise.allSettled([
      // 1. Stats
      inventoryRequest<{ data: InventoryStatsDto }>('/inventory/stats', {
        signal: controller.signal,
      }),
      // 2. Locations
      inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations', {
        signal: controller.signal,
      }),
      // 3. Low stock items
      inventoryRequest<{ data: PaginatedDto<InventoryPositionDto> }>(
        '/inventory/positions?availability=LOW_STOCK&limit=6&sortBy=AVAILABLE&sortOrder=ASC',
        { signal: controller.signal },
      ),
      // 4. Out of stock items
      inventoryRequest<{ data: PaginatedDto<InventoryPositionDto> }>(
        '/inventory/positions?availability=OUT_OF_STOCK&limit=6&sortBy=LAST_MOVEMENT&sortOrder=DESC',
        { signal: controller.signal },
      ),
      // 5. Recent history
      inventoryRequest<{ data: PaginatedDto<InventoryHistoryDto> }>(
        '/inventory/history?limit=8&sortOrder=DESC',
        { signal: controller.signal },
      ),
      // 6. Active reservations
      inventoryRequest<{ data: { totalCount?: number; items: unknown[] } }>(
        '/inventory/reservations?status=ACTIVE&limit=1',
        { signal: controller.signal },
      ),
    ])
      .then((results) => {
        if (controller.signal.aborted) return;
        const [statsRes, locRes, lowRes, outRes, histRes, resRes] = results;

        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        if (locRes.status === 'fulfilled') setLocations(locRes.value.data);
        if (lowRes.status === 'fulfilled') {
          setLowStockItems(lowRes.value.data.items);
          setLowStockTotal(lowRes.value.data.totalCount ?? lowRes.value.data.items.length);
        }
        if (outRes.status === 'fulfilled') {
          setOutOfStockItems(outRes.value.data.items);
          setOutOfStockTotal(outRes.value.data.totalCount ?? outRes.value.data.items.length);
        }
        if (histRes.status === 'fulfilled') setRecentMovements(histRes.value.data.items);
        if (resRes.status === 'fulfilled') {
          setActiveReservationsCount(
            resRes.value.data.totalCount ?? resRes.value.data.items.length,
          );
        }
        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount > 0) {
          setError(
            failedCount === results.length
              ? 'Inventory overview could not be loaded. Try refreshing the page.'
              : `${failedCount} inventory overview ${failedCount === 1 ? 'section is' : 'sections are'} temporarily unavailable.`,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Inventory</p>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">
            Multi-location ledger, stock availability, transfers, and warehouse operations.
          </p>
        </div>

        {/* Fast Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canAdjust ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/inventory/adjustments')}
            >
              <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Adjust Stock
            </Button>
          ) : null}
          {canTransfer ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/inventory/transfers/new')}
            >
              <Truck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              New Transfer
            </Button>
          ) : null}
          {canStocktake ? (
            <Button size="sm" onClick={() => router.push('/inventory/stocktakes/new')}>
              <ClipboardCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Start Stocktake
            </Button>
          ) : null}
        </div>
      </div>

      {error && <InventoryFeedback isError message={error} />}

      {/* Primary KPI Cards */}
      <Stats aria-label="Inventory summary" className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: 'Total On Hand',
            value: isLoading ? '—' : formatInventoryNumber(stats?.totalOnHand ?? '0'),
            description: 'Physical ledger units',
            icon: Package,
            iconClass: 'text-muted-foreground',
            valueClass: undefined,
          },
          {
            label: 'Available to Sell',
            value: isLoading ? '—' : formatInventoryNumber(stats?.totalAvailable ?? '0'),
            description: 'Unallocated sellable',
            icon: CheckCircle2,
            iconClass: 'text-emerald-500',
            valueClass: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Reserved',
            value: isLoading ? '—' : formatInventoryNumber(stats?.totalReserved ?? '0'),
            description: `${activeReservationsCount} active holds`,
            icon: Clock,
            iconClass: 'text-amber-500',
            valueClass: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'Unavailable',
            value: isLoading ? '—' : formatInventoryNumber(stats?.totalUnavailable ?? '0'),
            description: 'Damaged, quarantine, inspection',
            icon: ShieldAlert,
            iconClass: 'text-rose-500',
            valueClass: 'text-rose-600 dark:text-rose-400',
          },
          {
            label: 'Low Stock SKUs',
            value: isLoading ? '—' : lowStockTotal,
            description: '≤ 5 units available',
            icon: TrendingDown,
            iconClass: 'text-amber-500',
            valueClass: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'Out of Stock',
            value: isLoading ? '—' : outOfStockTotal,
            description: '0 units available',
            icon: AlertTriangle,
            iconClass: 'text-rose-500',
            valueClass: 'text-rose-600 dark:text-rose-400',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <StatsCard key={card.label} className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <StatsTitle>{card.label}</StatsTitle>
                <StatsValue className={card.valueClass}>{card.value}</StatsValue>
                <StatsDescription>{card.description}</StatsDescription>
              </div>
              <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', card.iconClass)} aria-hidden="true" />
            </StatsCard>
          );
        })}
      </Stats>

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
                    <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Stock Attention Required
                  </CardTitle>
                  <CardDescription>
                    Items that are depleted or approaching threshold.
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/inventory/stock?availability=LOW_STOCK" />}
                  className="text-xs"
                >
                  View full stock table{' '}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="low">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="low" className="text-xs">
                    Low Stock ({lowStockTotal})
                  </TabsTrigger>
                  <TabsTrigger value="out" className="text-xs">
                    Out of Stock ({outOfStockTotal})
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
                            {canAdjust ? (
                              <Button
                                size="xs"
                                variant="outline"
                                render={
                                  <Link
                                    href={`/inventory/adjustments?variantId=${encodeURIComponent(item.variantId)}&locationId=${encodeURIComponent(item.locationId)}`}
                                  />
                                }
                              >
                                Adjust
                              </Button>
                            ) : null}
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
                            {canAdjust ? (
                              <Button
                                size="xs"
                                variant="outline"
                                render={
                                  <Link
                                    href={`/inventory/adjustments?variantId=${encodeURIComponent(item.variantId)}&locationId=${encodeURIComponent(item.locationId)}`}
                                  />
                                }
                              >
                                Restock
                              </Button>
                            ) : null}
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
                    <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Recent Inventory Transactions
                  </CardTitle>
                  <CardDescription>
                    Latest movements recorded across all warehouses.
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/inventory/history" />}
                  className="text-xs"
                >
                  View ledger <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
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
                            <Badge
                              variant="outline"
                              className="text-[10px] font-medium uppercase tracking-wider"
                            >
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
                  <Warehouse className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Locations & Facilities
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/inventory/warehouses" />}
                  className="text-xs"
                >
                  Manage <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
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
              {canTransfer ? (
                <Link
                  href="/inventory/transfers"
                  className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <div className="font-medium text-xs">Transfers & Shipments</div>
                      <div className="text-[11px] text-muted-foreground">
                        Inter-warehouse movements
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </Link>
              ) : null}

              {canStocktake ? (
                <Link
                  href="/inventory/stocktakes"
                  className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <div className="font-medium text-xs">Stocktakes & Audits</div>
                      <div className="text-[11px] text-muted-foreground">
                        Snapshot counts and reconciliations
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </Link>
              ) : null}

              <Link
                href="/inventory/reservations"
                className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                  <div>
                    <div className="font-medium text-xs">Active Reservations</div>
                    <div className="text-[11px] text-muted-foreground">
                      Allocations for orders & transfers
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </Link>

              {canAdjust ? (
                <Link
                  href="/inventory/adjustments"
                  className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 border transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <div className="font-medium text-xs">Manual Adjustments</div>
                      <div className="text-[11px] text-muted-foreground">
                        Direct write-offs and corrections
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
