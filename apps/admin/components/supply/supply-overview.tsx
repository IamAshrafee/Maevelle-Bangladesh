'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  PackageCheck,
  Plus,
  RefreshCw,
  Ship,
  Truck,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ApiEnvelope,
  InboundReceiptDto,
  InboundShipmentDto,
  PurchaseDto,
  SupplyOverviewDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalEmptyState, OperationalFeedback } from '@/components/operational-worklist';
import { QuantityProgress } from '@/components/supply/supply-entity-ui';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import { formatSupplyDate, supplyRequest } from '@/lib/supply/api';
import {
  nextPurchaseAction,
  purchaseQuantities,
  purchaseWorkflowStatus,
  shipmentQuantities,
} from '@/lib/supply/status';
import type { PagedEnvelope } from '@/lib/supply/types';

const journey = [
  ['Suppliers', 'Buying terms and contacts', Building2, '/suppliers'],
  ['Purchases', 'What you ordered', ClipboardCheck, '/purchases'],
  ['Shipments', 'What is on the way', Ship, '/inbound-shipments'],
  ['Receiving', 'What physically arrived', PackageCheck, '/receiving'],
  ['Final cost', 'True cost per received unit', CircleDollarSign, '/costing'],
] as const;

export function SupplyOverview() {
  const canViewProcurement = useAdminCapability('procurement.view');
  const canManageProcurement = useAdminCapability('procurement.manage');
  const canViewShipments = useAdminCapability('inbound_shipment.view');
  const canManageShipments = useAdminCapability('inbound_shipment.manage');
  const canViewReceiving = useAdminCapability('receiving.view');
  const canReceive = useAdminCapability('receiving.post');
  const [overview, setOverview] = useState<SupplyOverviewDto>();
  const [purchases, setPurchases] = useState<readonly PurchaseDto[]>([]);
  const [shipments, setShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [receipts, setReceipts] = useState<readonly InboundReceiptDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  async function load(signal?: AbortSignal) {
    setState('loading');
    try {
      const init = signal ? { signal } : undefined;
      const [summary, purchaseResult, shipmentResult] = await Promise.all([
        supplyRequest<ApiEnvelope<SupplyOverviewDto>>('/admin/supply/overview', init),
        canViewProcurement
          ? supplyRequest<PagedEnvelope<PurchaseDto>>('/admin/purchases?pageSize=100', init)
          : Promise.resolve({ data: [] as readonly PurchaseDto[] }),
        canViewShipments
          ? supplyRequest<PagedEnvelope<InboundShipmentDto>>(
              '/admin/inbound-shipments?pageSize=100',
              init,
            )
          : Promise.resolve({ data: [] as readonly InboundShipmentDto[] }),
      ]);
      setOverview(summary.data);
      setPurchases(purchaseResult?.data ?? []);
      setShipments(shipmentResult?.data ?? []);
      if (canViewReceiving) {
        supplyRequest<PagedEnvelope<InboundReceiptDto>>('/admin/inbound-receipts?pageSize=8', init)
          .then((result) => setReceipts(result.data))
          .catch(() => setReceipts([]));
      }
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Supply overview could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [canViewProcurement, canViewReceiving, canViewShipments]);

  const purchaseQueue = purchases
    .filter((purchase) => !['RECEIVED', 'CANCELLED'].includes(purchaseWorkflowStatus(purchase)))
    .slice(0, 5);
  const receivingQueue = shipments
    .filter((shipment) => shipment.status === 'ARRIVED' && shipment.receivingStatus !== 'RECEIVED')
    .slice(0, 5);
  const inTransit = shipments
    .filter((shipment) => shipment.status === 'IN_TRANSIT')
    .sort((left, right) =>
      (left.expectedArrivalDate ?? '9999').localeCompare(right.expectedArrivalDate ?? '9999'),
    )
    .slice(0, 5);

  return (
    <main className="min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Supply</p>
          <h1 className="text-pretty text-2xl font-semibold tracking-tight">Supply overview</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Follow supplier orders from purchase through transit, receiving, inventory, and final
            unit cost.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={state === 'loading'} onClick={() => void load()}>
            <RefreshCw className={state === 'loading' ? 'animate-spin' : ''} /> Refresh
          </Button>
          {canManageProcurement ? (
            <Button render={<Link href="/purchases?create=purchase" />}>
              <Plus /> New purchase
            </Button>
          ) : null}
        </div>
      </header>

      {message ? <OperationalFeedback tone="danger">{message}</OperationalFeedback> : null}

      <section
        aria-label="Supply workflow"
        className="overflow-x-auto rounded-xl border bg-card p-3"
      >
        <ol className="flex min-w-[680px] items-stretch">
          {journey.map(([label, detail, Icon, href], index) => (
            <li className="flex min-w-0 flex-1 items-center" key={label}>
              <Link
                href={href}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 no-underline hover:bg-muted"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{detail}</span>
                </span>
              </Link>
              {index < journey.length - 1 ? (
                <ArrowRight className="mx-1 size-4 shrink-0 text-muted-foreground/50" />
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <Stats aria-label="Supply snapshot">
        <StatsCard>
          <StatsTitle>Open purchases</StatsTitle>
          <StatsValue>{overview?.openPurchases ?? 0}</StatsValue>
          <StatsDescription>
            {overview?.draftPurchases ?? 0} drafts still being prepared
          </StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>In transit</StatsTitle>
          <StatsValue>{overview?.inTransitShipments ?? 0}</StatsValue>
          <StatsDescription>
            {overview?.overdueShipments ?? 0} past expected arrival
          </StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Ready to receive</StatsTitle>
          <StatsValue>{overview?.awaitingReceiptShipments ?? 0}</StatsValue>
          <StatsDescription>Arrived shipments waiting for a physical count</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Receipts today</StatsTitle>
          <StatsValue>{overview?.receiptsToday ?? 0}</StatsValue>
          <StatsDescription>Posted to the Inventory ledger</StatsDescription>
        </StatsCard>
      </Stats>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Purchases needing action</CardTitle>
              <CardDescription>Orders not yet fully received.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/purchases" />}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {state === 'loading' ? (
              <p className="text-sm text-muted-foreground">Loading purchases…</p>
            ) : null}
            {state === 'ready' && !purchaseQueue.length ? (
              <OperationalEmptyState
                title="No open purchase work"
                description="New supplier orders will appear here with their next step."
              />
            ) : null}
            {purchaseQueue.map((purchase) => {
              const totals = purchaseQuantities(purchase);
              return (
                <Link
                  key={purchase.id}
                  href={`/purchases/${purchase.id}`}
                  className="grid gap-2 rounded-lg border p-3 no-underline hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{purchase.purchaseNumber}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {purchase.supplierName}
                      </div>
                    </div>
                    <StatusBadge status={purchaseWorkflowStatus(purchase)} />
                  </div>
                  <QuantityProgress
                    label="Received"
                    complete={totals.received}
                    total={totals.ordered}
                  />
                  <span className="text-xs font-medium text-primary">
                    {nextPurchaseAction(purchase)}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card id="receiving" className={receivingQueue.length ? 'border-amber-300/70' : undefined}>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {receivingQueue.length ? (
                  <AlertTriangle className="size-4 text-amber-600" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                )}
                Receiving queue
              </CardTitle>
              <CardDescription>Arrived shipments that still need counting.</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/receiving" />}
            >
              View queue
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {state === 'ready' && !receivingQueue.length ? (
              <OperationalEmptyState
                title="Receiving is clear"
                description="There are no arrived shipments waiting for a count."
              />
            ) : null}
            {receivingQueue.map((shipment) => {
              const totals = shipmentQuantities(shipment);
              return (
                <div className="rounded-lg border p-3" key={shipment.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Link
                        href={`/inbound-shipments/${shipment.id}`}
                        className="font-medium hover:underline"
                      >
                        {shipment.shipmentNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {shipment.receivingLocationName} · arrived{' '}
                        {formatSupplyDate(shipment.arrivedAt)}
                      </p>
                    </div>
                    {canReceive ? (
                      <Button
                        size="sm"
                        render={<Link href={`/inbound-shipments/${shipment.id}?receive=1`} />}
                      >
                        <PackageCheck /> Receive goods
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <QuantityProgress
                      label="Counted"
                      complete={totals.received}
                      total={totals.expected}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="size-4" /> In transit
              </CardTitle>
              <CardDescription>Nearest expected arrivals first.</CardDescription>
            </div>
            {canManageShipments ? (
              <Button
                size="sm"
                variant="outline"
                render={<Link href="/inbound-shipments?create=shipment" />}
              >
                <Plus /> Plan shipment
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-2">
            {!inTransit.length ? (
              <p className="text-sm text-muted-foreground">
                No shipments are currently in transit.
              </p>
            ) : null}
            {inTransit.map((shipment) => (
              <Link
                href={`/inbound-shipments/${shipment.id}`}
                key={shipment.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 no-underline hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{shipment.shipmentNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {shipment.trackingReference ?? shipment.transportMode} ·{' '}
                    {shipment.receivingLocationName}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <p className="font-medium">{formatSupplyDate(shipment.expectedArrivalDate)}</p>
                  <p className="text-muted-foreground">Expected</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="size-4" /> Recent receiving
            </CardTitle>
            <CardDescription>Posted inventory evidence.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {!receipts.length ? (
              <p className="text-sm text-muted-foreground">No recent receipts are available.</p>
            ) : null}
            {receipts.slice(0, 5).map((receipt) => (
              <Link
                href={`/receiving/${receipt.id}`}
                className="flex items-center justify-between rounded-lg border p-3 no-underline hover:bg-muted/50"
                key={receipt.id}
              >
                <div>
                  <p className="font-medium">{receipt.receiptNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {receipt.shipmentNumber} · {receipt.locationName}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatSupplyDate(receipt.postedAt)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
