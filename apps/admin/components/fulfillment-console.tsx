'use client';

import { ArrowRight, Boxes, PackageCheck, Truck, Warehouse, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { ApiEnvelope, WarehouseLocationDto } from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from './operational-worklist';
import { FulfillmentCreateDialog } from './fulfillment-create-dialog';
import { StatusBadge } from './status-badge';

interface Fulfillment {
  id: string;
  version: number;
  fulfillmentNumber: string;
  orderNumber: string;
  locationName: string;
  status: 'DRAFT' | 'READY' | 'PICKING' | 'PACKED' | 'DISPATCHED' | 'CANCELLED';
  lines: readonly { sku: string; productTitle: string; quantity: string; consumed: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
    };
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? 'The fulfillment command was rejected.'),
    );
  }
  return response.json() as Promise<T>;
}

const searchText = (item: Fulfillment) =>
  [
    item.fulfillmentNumber,
    item.orderNumber,
    item.locationName,
    ...item.lines.flatMap((line) => [line.sku, line.productTitle]),
  ].join(' ');
const statusOf = (item: Fulfillment) => item.status;
const referenceOf = (item: Fulfillment) => item.fulfillmentNumber;
type FulfillmentAction = 'ready' | 'start-picking' | 'pack' | 'cancel';

function nextActionFor(
  status: Fulfillment['status'],
): readonly [string, FulfillmentAction] | undefined {
  if (status === 'DRAFT') return ['Mark ready', 'ready'];
  if (status === 'READY') return ['Start picking', 'start-picking'];
  if (status === 'PICKING') return ['Mark packed', 'pack'];
  return undefined;
}

export function FulfillmentConsole() {
  const [fulfillments, setFulfillments] = useState<readonly Fulfillment[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [fulfillmentResult, locationResult] = await Promise.all([
        request<ApiEnvelope<readonly Fulfillment[]>>('/admin/fulfillments?pageSize=100'),
        request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations'),
      ]);
      setFulfillments(fulfillmentResult.data);
      setLocations(
        locationResult.data.filter((location) => location.capabilities.includes('STOCK_HOLDING')),
      );
      setSelectedId((current) =>
        current && fulfillmentResult.data.some((item) => item.id === current)
          ? current
          : fulfillmentResult.data[0]?.id,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load fulfillment operations.');
      setMessageTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const worklist = useOperationalWorklist<Fulfillment>({
    items: fulfillments,
    getSearchText: searchText,
    getStatus: statusOf,
    getReference: referenceOf,
    storageKey: 'maevelle.admin.fulfillment.views',
  });

  const selected = useMemo(
    () => fulfillments.find((item) => item.id === selectedId) ?? worklist.visibleItems[0],
    [fulfillments, selectedId, worklist.visibleItems],
  );

  const action = async (item: Fulfillment, command: FulfillmentAction) => {
    setBusy(true);
    try {
      if (command === 'cancel') {
        const reason = window.prompt('Provide a reason for cancelling this fulfillment:');
        if (!reason) return;
        await request(`/admin/fulfillments/${item.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ version: item.version, reason }),
        });
      } else {
        await request(`/admin/fulfillments/${item.id}/${command}`, {
          method: 'POST',
          body: JSON.stringify({ version: item.version }),
        });
      }
      setMessage(`Fulfillment ${item.fulfillmentNumber} updated successfully.`);
      setMessageTone('success');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.');
      setMessageTone('danger');
    } finally {
      setBusy(false);
    }
  };

  const createDelivery = async (item: Fulfillment) => {
    setBusy(true);
    try {
      await request('/admin/delivery/shipments', {
        method: 'POST',
        body: JSON.stringify({
          orderId: item.orderNumber,
          fulfillmentId: item.id,
          warehouseLocationId: locations.find((location) => location.name === item.locationName)
            ?.id,
        }),
      });
      setMessage(`Delivery created for fulfillment ${item.fulfillmentNumber}.`);
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create delivery.');
      setMessageTone('danger');
    } finally {
      setBusy(false);
    }
  };

  const inProgress = fulfillments.filter((item) =>
    ['READY', 'PICKING', 'PACKED'].includes(item.status),
  ).length;
  const awaitingDispatch = fulfillments.filter((item) => item.status === 'PACKED').length;
  const nextAction = selected ? nextActionFor(selected.status) : undefined;

  return (
    <main className="space-y-6">
      <OperationalPageHeader
        eyebrow="Operations / Warehouse"
        title="Fulfillments"
        description="Pick, pack, and prepare physical shipments while tracking stock consumption."
        actions={
          <FulfillmentCreateDialog
            locations={locations}
            onSuccess={async (id?: string) => {
              await reload();
              if (id) setSelectedId(id);
            }}
          />
        }
      />

      <section className="space-y-6">
        <Stats>
          <StatsCard>
            <StatsTitle>Open fulfillments</StatsTitle>
            <StatsValue>{fulfillments.length}</StatsValue>
            <StatsDescription>Active operational units</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Floor activity</StatsTitle>
            <StatsValue>{inProgress}</StatsValue>
            <StatsDescription>Ready, picking, or packed</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Ready to dispatch</StatsTitle>
            <StatsValue>{awaitingDispatch}</StatsValue>
            <StatsDescription>Physical stock not yet consumed</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Stock-holding locations</StatsTitle>
            <StatsValue>{locations.length}</StatsValue>
            <StatsDescription>Eligible fulfillment warehouses</StatsDescription>
          </StatsCard>
        </Stats>

        {locations.length === 0 && !loading ? (
          <OperationalFeedback tone="warning">
            Create an active stock-holding warehouse before fulfilling orders.
          </OperationalFeedback>
        ) : null}
        {message ? <OperationalFeedback tone={messageTone}>{message}</OperationalFeedback> : null}

        <OperationalWorklistToolbar
          query={worklist.query}
          onQueryChange={worklist.setQuery}
          status={worklist.status}
          onStatusChange={worklist.setStatus}
          statuses={['DRAFT', 'READY', 'PICKING', 'PACKED', 'DISPATCHED', 'CANCELLED']}
          sort={worklist.sort}
          onSortChange={worklist.setSort}
          density={worklist.density}
          onDensityChange={worklist.setDensity}
          resultCount={worklist.visibleItems.length}
          savedViews={worklist.savedViews}
          onSaveView={worklist.saveView}
          onApplyView={worklist.applyView}
          searchLabel="Search fulfillment, order, SKU, or warehouse"
        />

        <div className={`grid grid-cols-1 ${selected ? 'lg:grid-cols-12' : ''} gap-6 items-start`}>
          <section className={`${selected ? 'lg:col-span-7' : 'w-full'} rounded-lg border border-border bg-card overflow-hidden`}>
            {loading ? (
              <div className="p-12 text-center space-y-3" aria-label="Loading fulfillments">
                <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground">Loading fulfillments…</p>
              </div>
            ) : worklist.visibleItems.length ? (
              <div className="overflow-x-auto">
                <Table density={worklist.density === 'compact' ? 'compact' : 'comfortable'}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fulfillment</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16">
                        <span className="sr-only">Open</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {worklist.visibleItems.map((item) => {
                      const isSelected = item.id === selectedId;
                      return (
                        <TableRow key={item.id} className={isSelected ? 'bg-primary/5' : undefined}>
                          <TableCell className="font-medium text-foreground">
                            {item.fulfillmentNumber}
                          </TableCell>
                          <TableCell>{item.orderNumber}</TableCell>
                          <TableCell>{item.locationName}</TableCell>
                          <TableCell className="text-right tabular-nums">{item.lines.length}</TableCell>
                          <TableCell>
                            <StatusBadge status={item.status} />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => setSelectedId(item.id)}
                            >
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-8">
                <OperationalEmptyState
                  title="No matching fulfillments"
                  description="Clear filters or create a fulfillment from an eligible order."
                  action={
                    <Link className={buttonVariants({ variant: 'outline' })} href="/orders">
                      Open orders
                    </Link>
                  }
                />
              </div>
            )}
          </section>

          {selected ? (
            <aside
              className="lg:col-span-5 rounded-lg border border-border bg-card p-5 space-y-5 sticky top-20"
              aria-label={`${selected.fulfillmentNumber} detail`}
            >
              <header className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fulfillment</p>
                  <h2 className="text-lg font-semibold text-foreground mt-0.5">{selected.fulfillmentNumber}</h2>
                  <div className="mt-1.5">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSelectedId(undefined)}
                  aria-label="Close detail"
                >
                  <X className="size-4" />
                </Button>
              </header>

              {nextAction ? (
                <section className="p-4 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between gap-4">
                  <div>
                    <strong className="block text-sm font-medium text-foreground">Recommended next action</strong>
                    <p className="text-xs text-muted-foreground">Continue the canonical fulfillment lifecycle.</p>
                  </div>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void action(selected, nextAction[1])}
                  >
                    {nextAction[0]}
                  </Button>
                </section>
              ) : null}

              <div className="space-y-5">
                <dl className="grid grid-cols-3 gap-3 text-xs bg-muted/20 rounded-md p-3 border border-border/60">
                  <div>
                    <dt className="text-muted-foreground">Order</dt>
                    <dd className="font-medium text-foreground mt-0.5">{selected.orderNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Warehouse</dt>
                    <dd className="font-medium text-foreground mt-0.5">{selected.locationName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Version</dt>
                    <dd className="font-medium text-foreground mt-0.5">{selected.version}</dd>
                  </div>
                </dl>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Physical lines</h3>
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table density="compact">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product / SKU</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Consumed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.lines.map((line) => (
                          <TableRow key={`${line.sku}-${line.productTitle}`}>
                            <TableCell>
                              <div className="font-medium text-foreground">{line.productTitle}</div>
                              <span className="text-xs text-muted-foreground">{line.sku}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {selected.status === 'DISPATCHED' ? line.consumed : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {['PACKED', 'DISPATCHED'].includes(selected.status) ? (
                    <Button
                      disabled={busy}
                      onClick={() => void createDelivery(selected)}
                      type="button"
                      className="gap-1.5"
                    >
                      <Truck className="size-4" aria-hidden="true" /> Prepare delivery
                    </Button>
                  ) : null}
                  {['DRAFT', 'READY', 'PICKING', 'PACKED'].includes(selected.status) ? (
                    <Button
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void action(selected, 'cancel')}
                      type="button"
                    >
                      Cancel fulfillment
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2.5 pt-2">
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/20 border border-border/60 text-xs">
                    <Boxes className="size-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <strong className="block font-medium text-foreground">Inventory boundary</strong>
                      <p className="text-muted-foreground mt-0.5">Cart and checkout never consume stock. Dispatch is the physical event.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/20 border border-border/60 text-xs">
                    <PackageCheck className="size-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <strong className="block font-medium text-foreground">Costing boundary</strong>
                      <p className="text-muted-foreground mt-0.5">FIFO assignment is committed atomically with dispatch.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-md bg-muted/20 border border-border/60 text-xs">
                    <Warehouse className="size-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <strong className="block font-medium text-foreground">Warehouse</strong>
                      <p className="text-muted-foreground mt-0.5">{selected.locationName} owns the physical fulfillment movement.</p>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
