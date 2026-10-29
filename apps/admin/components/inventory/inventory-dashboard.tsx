'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Clock3,
  PackageCheck,
  ScanBarcode,
  ShieldAlert,
  SlidersHorizontal,
  TrendingDown,
  Truck,
  Warehouse,
} from 'lucide-react';

import type { InventoryOverviewDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import { formatInventoryDate, formatInventoryNumber, inventoryRequest } from '@/lib/inventory/api';

const queueCards = [
  { key: 'transferDiscrepancies', label: 'Transfer discrepancies', href: '/inventory/transfers?status=CLOSED_WITH_DISCREPANCY', icon: ShieldAlert },
  { key: 'countsAwaitingReview', label: 'Counts awaiting review', href: '/inventory/stocktakes?status=REVIEW', icon: ClipboardCheck },
  { key: 'unitsAwaitingQc', label: 'Units awaiting QC', href: '/inventory/units?status=AWAITING_QC', icon: ScanBarcode },
  { key: 'repairsOpen', label: 'Open repairs', href: '/inventory/units/repairs', icon: SlidersHorizontal },
  { key: 'reservationExceptions', label: 'Reservation exceptions', href: '/inventory/reservations', icon: Clock3 },
  { key: 'transfersInTransit', label: 'Transfers in transit', href: '/inventory/transfers?status=IN_TRANSIT', icon: Truck },
] as const;

export function InventoryDashboard() {
  const canAdjust = useAdminCapability('inventory.adjust');
  const canTransfer = useAdminCapability('inventory.transfer');
  const canStocktake = useAdminCapability('inventory.stocktake');
  const [overview, setOverview] = useState<InventoryOverviewDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    inventoryRequest<{ data: InventoryOverviewDto }>('/inventory/overview?attentionLimit=10', {
      signal: controller.signal,
    })
      .then((response) => setOverview(response.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : 'Inventory overview could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Inventory operations"
        title="Inventory overview"
        description="A location-aware snapshot of stock health, work queues, recent ledger movement, and the next operational actions."
        actions={
          <>
            <RefreshButton
              loading={loading}
              onRefresh={() => setReload((value) => value + 1)}
              tooltip="Refresh inventory overview"
            />
            <Button variant="outline" render={<Link href="/inventory/replenishment" />}>
              <TrendingDown className="size-4" />Replenishment
            </Button>
            {canTransfer ? <Button variant="outline" render={<Link href="/inventory/transfers/new" />}><Truck className="size-4" />New transfer</Button> : null}
            {canStocktake ? <Button render={<Link href="/inventory/stocktakes/new" />}><ClipboardCheck className="size-4" />Start count</Button> : null}
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} /> : null}
      {loading && !overview ? <LoadingState message="Loading the inventory operations snapshot…" /> : null}

      {overview ? (
        <>
          <Stats aria-label="Inventory summary" className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatsCard><StatsTitle>On hand</StatsTitle><StatsValue className="font-mono tabular-nums">{formatInventoryNumber(overview.kpis.onHand)}</StatsValue><StatsDescription>Physical ledger units</StatsDescription></StatsCard>
            <StatsCard><StatsTitle>Available to sell</StatsTitle><StatsValue className="font-mono tabular-nums">{formatInventoryNumber(overview.kpis.availableToSell)}</StatsValue><StatsDescription>Sellable after holds</StatsDescription></StatsCard>
            <StatsCard><StatsTitle>Reserved</StatsTitle><StatsValue className="font-mono tabular-nums">{formatInventoryNumber(overview.kpis.reserved)}</StatsValue><StatsDescription>{overview.workQueues.activeReservations} active reservations</StatsDescription></StatsCard>
            <StatsCard><StatsTitle>Unavailable</StatsTitle><StatsValue className="font-mono tabular-nums">{formatInventoryNumber(overview.kpis.unavailable)}</StatsValue><StatsDescription>Damage, quarantine, inspection</StatsDescription></StatsCard>
            <StatsCard><StatsTitle>Incoming supply</StatsTitle><StatsValue className="font-mono tabular-nums">{formatInventoryNumber(overview.kpis.incomingSupply)}</StatsValue><StatsDescription>Open inbound shipments</StatsDescription></StatsCard>
            <StatsCard><StatsTitle>Transfer in transit</StatsTitle><StatsValue className="font-mono tabular-nums">{formatInventoryNumber(overview.kpis.inTransitTransfer)}</StatsValue><StatsDescription>Dispatched, not received</StatsDescription></StatsCard>
          </Stats>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
            <div className="space-y-6">
              <PageSection
                title="Stock attention"
                description={`${overview.attention.totalCount} position${overview.attention.totalCount === 1 ? '' : 's'} at or below their resolved replenishment threshold.`}
                actions={<Button size="sm" variant="ghost" render={<Link href="/inventory/replenishment" />}>Plan replenishment<ArrowRight className="size-4" /></Button>}
              >
                {overview.attention.items.length === 0 ? (
                  <EmptyState icon={PackageCheck} title="Stock is above its attention thresholds" description="No authorized stock position currently needs replenishment review." />
                ) : (
                  <div className="grid gap-3">
                    {overview.attention.items.map((item) => (
                      <PagePanel key={`${item.inventoryItemId}-${item.locationId}`} className="flex flex-col gap-4 p-4 shadow-none sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={item.nextActionHref} className="font-semibold hover:underline">{item.productTitle}</Link>
                            <StatusBadge status={item.severity} />
                          </div>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{item.sku} · {item.locationName}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{item.explanation}</p>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                          <div className="text-right"><p className="font-mono text-lg font-semibold tabular-nums">{formatInventoryNumber(item.availableToSell)}</p><p className="text-xs text-muted-foreground">available · threshold {formatInventoryNumber(item.replenishmentThreshold)}</p></div>
                          {canAdjust ? <Button size="sm" variant="outline" render={<Link href={`/inventory/adjustments?variantId=${item.variantId}&locationId=${item.locationId}`} />}>Adjust</Button> : null}
                        </div>
                      </PagePanel>
                    ))}
                  </div>
                )}
              </PageSection>

              <PageSection title="Recent ledger movement" description="Latest authoritative quantity changes across the locations you can access." actions={<Button size="sm" variant="ghost" render={<Link href="/inventory/history" />}>Movement history<ArrowRight className="size-4" /></Button>}>
                {overview.recentMovements.length === 0 ? <EmptyState icon={Boxes} title="No movements recorded" /> : (
                  <PagePanel className="divide-y p-0 shadow-none">
                    {overview.recentMovements.map((movement) => {
                      const positive = Number(movement.quantityDelta) > 0;
                      return (
                        <div key={movement.movementId} className="flex items-center justify-between gap-4 p-4">
                          <div className="min-w-0"><p className="truncate text-sm font-medium">{movement.productTitle}</p><p className="font-mono text-xs text-muted-foreground">{movement.sku} · {movement.locationName}</p><p className="text-xs text-muted-foreground">{movement.transactionType.replaceAll('_', ' ').toLowerCase()} · {formatInventoryDate(movement.occurredAt)}</p></div>
                          <div className="text-right"><p className="font-mono font-semibold tabular-nums">{positive ? '+' : ''}{formatInventoryNumber(movement.quantityDelta)}</p><StatusBadge status={movement.condition} tone={movement.condition === 'SELLABLE' ? 'success' : 'warning'} /></div>
                        </div>
                      );
                    })}
                  </PagePanel>
                )}
              </PageSection>
            </div>

            <div className="space-y-6">
              <PageSection title="Work queues" description="Exceptions and in-progress operations needing a clear owner.">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {queueCards.map((card) => {
                    const Icon = card.icon;
                    const value = overview.workQueues[card.key];
                    return (
                      <Link key={card.key} href={card.href} className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
                        <span className="min-w-0 flex-1 text-sm font-medium">{card.label}</span><span className="font-mono text-base font-semibold tabular-nums">{value}</span><ArrowRight className="size-4 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </PageSection>

              <PageSection title="Location health" description="Physical stock and attention by authorized Location.">
                {overview.locations.length === 0 ? <EmptyState icon={Warehouse} title="No stock-holding locations available" /> : (
                  <PagePanel className="divide-y p-0 shadow-none">
                    {overview.locations.map((location) => (
                      <Link key={location.locationId} href={`/inventory/warehouses/${location.locationId}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                        <div className="min-w-0"><p className="truncate text-sm font-medium">{location.locationName}</p><p className="font-mono text-xs text-muted-foreground">{location.locationCode}</p></div>
                        <div className="text-right"><p className="font-mono text-sm font-semibold tabular-nums">{formatInventoryNumber(location.availableToSell)} available</p><p className="text-xs text-muted-foreground">{location.attentionCount} need attention</p></div>
                      </Link>
                    ))}
                  </PagePanel>
                )}
              </PageSection>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Snapshot generated {formatInventoryDate(overview.generatedAt)} · Scope: {overview.scope.kind === 'ORGANIZATION' ? 'all authorized organization inventory' : `${overview.scope.locationIds.length} authorized location${overview.scope.locationIds.length === 1 ? '' : 's'}`}.</p>
        </>
      ) : null}
    </AdminPage>
  );
}
