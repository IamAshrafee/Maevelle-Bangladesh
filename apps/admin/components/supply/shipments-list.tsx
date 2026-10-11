'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Image as ImageIcon,
  PackageCheck,
  PackageOpen,
  Plane,
  Plus,
  Search,
  Ship,
  Train,
  Truck,
  X,
} from 'lucide-react';
import type { InboundShipmentDto, SupplyOverviewDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { SupplyWorkspaceNav } from '@/components/supply/supply-workspace-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSupplyDate, formatSupplyNumber, supplyRequest } from '@/lib/supply/api';
import type { PagedEnvelope } from '@/lib/supply/types';
import { PlanShipmentDialog } from './plan-shipment-dialog';

const PAGE_SIZE = 15;
const TRANSPORT_MODES = [
  { value: 'ALL', label: 'All Modes' },
  { value: 'SEA', label: 'Sea Freight' },
  { value: 'AIR', label: 'Air Freight' },
  { value: 'ROAD', label: 'Road Transport' },
  { value: 'RAIL', label: 'Rail' },
  { value: 'OTHER', label: 'Other' },
] as const;
const SHIPMENT_STATUSES = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'ARRIVED', label: 'Arrived' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

function TransportIcon({ mode }: { readonly mode: string }) {
  const normalized = mode.toUpperCase();
  if (normalized === 'AIR') return <Plane aria-hidden="true" className="size-4 text-info" />;
  if (normalized === 'ROAD') return <Truck aria-hidden="true" className="size-4 text-warning" />;
  if (normalized === 'RAIL') return <Train aria-hidden="true" className="size-4 text-success" />;
  return <Ship aria-hidden="true" className="size-4 text-primary" />;
}

function shipmentAction(shipment: InboundShipmentDto) {
  if (shipment.status === 'PLANNED') return { label: 'Open to Record Departure', query: '' };
  if (shipment.status === 'IN_TRANSIT') return { label: 'Open to Record Arrival', query: '' };
  if (shipment.status === 'ARRIVED' && shipment.receivingStatus !== 'RECEIVED') {
    return { label: 'Open Receiving', query: '?tab=receipts' };
  }
  if (shipment.receivingStatus === 'RECEIVED') {
    return { label: 'Review Landed Cost', query: '?tab=costing' };
  }
  return { label: 'Open Shipment', query: '' };
}

function shipmentTotals(shipment: InboundShipmentDto) {
  const allocated = shipment.allocations.reduce(
    (sum, allocation) => sum + Number(allocation.allocatedQuantity),
    0,
  );
  const received = shipment.allocations.reduce(
    (sum, allocation) => sum + Number(allocation.receivedQuantity),
    0,
  );
  return { allocated, received };
}

export function ShipmentsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManageShipments = useAdminCapability('inbound_shipment.manage');
  const status = searchParams.get('status') ?? 'ALL';
  const mode = searchParams.get('mode') ?? 'ALL';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10));
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const [shipments, setShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [overview, setOverview] = useState<SupplyOverviewDto>();
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [planOpen, setPlanOpen] = useState(searchParams.get('create') === 'shipment');

  function updateQuery(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === 'ALL') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in updates)) next.delete('page');
    const nextQuery = next.toString();
    router.replace(nextQuery ? `/inbound-shipments?${nextQuery}` : '/inbound-shipments', {
      scroll: false,
    });
  }

  function setPlanDialog(open: boolean) {
    setPlanOpen(open);
    if (!open && searchParams.has('create')) updateQuery({ create: undefined });
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (deferredQuery) params.set('q', deferredQuery);
    if (status !== 'ALL') params.set('status', status);
    if (mode !== 'ALL') params.set('transportMode', mode);

    setLoading(true);
    setError(undefined);
    void Promise.all([
      supplyRequest<PagedEnvelope<InboundShipmentDto>>(
        `/admin/inbound-shipments?${params.toString()}`,
        { signal: controller.signal },
      ),
      supplyRequest<{ data: SupplyOverviewDto }>('/admin/supply/overview', {
        signal: controller.signal,
      }),
    ])
      .then(([shipmentResult, overviewResult]) => {
        setShipments(shipmentResult.data);
        setOverview(overviewResult.data);
        setTotalItems(shipmentResult.pagination?.totalItems ?? shipmentResult.data.length);
        setTotalPages(shipmentResult.pagination?.totalPages ?? 1);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(
          loadError instanceof Error ? loadError.message : 'Inbound shipments could not be loaded.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [deferredQuery, mode, page, status]);

  const metrics = [
    ['Planned', overview?.plannedShipments ?? 0, 'Awaiting departure', PackageOpen],
    ['In Transit', overview?.inTransitShipments ?? 0, 'Moving to warehouse', Truck],
    ['Overdue', overview?.overdueShipments ?? 0, 'Past expected arrival', CalendarClock],
    [
      'Ready to Receive',
      overview?.awaitingReceiptShipments ?? 0,
      'Arrived for counting',
      PackageCheck,
    ],
  ] as const;

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-pretty font-heading text-2xl font-bold tracking-tight">
              Inbound Shipments
            </h1>
            <Badge variant="outline" className="font-mono text-xs tabular-nums">
              {totalItems}
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-pretty text-sm text-muted-foreground">
            Plan and monitor freight movement. Open a shipment to record lifecycle events,
            receiving, and landed cost in one context.
          </p>
        </div>
        {canManageShipments ? (
          <Button
            size="sm"
            onClick={() => setPlanDialog(true)}
            className="gap-1.5 self-start sm:self-auto"
          >
            <Plus aria-hidden="true" className="size-4" />
            <span>Plan Shipment</span>
          </Button>
        ) : null}
      </header>

      <SupplyWorkspaceNav />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map(([label, value, description, Icon]) => (
          <Card key={label} className="p-3.5 shadow-2xs sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{value}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>
              </div>
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Icon aria-hidden="true" className="size-4" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      {error ? (
        <OperationalFeedback tone="danger" onDismiss={() => setError(undefined)}>
          {error} Check your filters or retry the page.
        </OperationalFeedback>
      ) : null}
      {success ? (
        <OperationalFeedback onDismiss={() => setSuccess(undefined)}>{success}</OperationalFeedback>
      ) : null}

      <section className="space-y-3" aria-label="Shipment filters and results">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              name="shipment-search"
              autoComplete="off"
              aria-label="Search inbound shipments"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                updateQuery({ q: event.target.value.trim() || undefined });
              }}
              placeholder="Search shipment, tracking, provider, or origin…"
              className="pl-9 pr-9"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setQuery('');
                  updateQuery({ q: undefined });
                }}
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                aria-label="Clear shipment search"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <NativeSelect
              name="shipment-status-filter"
              aria-label="Filter shipments by status"
              value={status}
              onChange={(event) => updateQuery({ status: event.target.value })}
              size="sm"
              className="h-11 w-full sm:h-8 sm:w-40"
            >
              {SHIPMENT_STATUSES.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              name="shipment-mode-filter"
              aria-label="Filter shipments by transport mode"
              value={mode}
              onChange={(event) => updateQuery({ mode: event.target.value })}
              size="sm"
              className="h-11 w-full sm:h-8 sm:w-40"
            >
              {TRANSPORT_MODES.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        {loading ? (
          <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading inbound shipments…
          </p>
        ) : null}
        {!loading && shipments.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <Ship aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No Shipments Found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear the filters or plan a shipment from placed purchase lines.
            </p>
          </div>
        ) : null}

        {!loading && shipments.length > 0 ? (
          <>
            <div className="grid gap-3 md:hidden">
              {shipments.map((shipment) => {
                const totals = shipmentTotals(shipment);
                const action = shipmentAction(shipment);
                return (
                  <article key={shipment.id} className="rounded-xl border bg-card p-4 shadow-2xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/inbound-shipments/${shipment.id}`}
                          className="font-mono font-semibold text-primary hover:underline"
                        >
                          {shipment.shipmentNumber}
                        </Link>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {shipment.originText ?? 'Origin not recorded'} →{' '}
                          {shipment.receivingLocationName}
                        </p>
                      </div>
                      <TransportIcon mode={shipment.transportMode} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={shipment.status} />
                      <StatusBadge status={shipment.receivingStatus} />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {shipment.allocations.slice(0, 3).map((allocation) => (
                        <div
                          key={allocation.id}
                          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted"
                          title={`${allocation.productTitle} · ${allocation.optionSummary ?? allocation.sku}`}
                        >
                          {allocation.primaryImageUrl ? (
                            <img
                              src={allocation.primaryImageUrl}
                              alt={`${allocation.productTitle} ${allocation.optionSummary ?? allocation.sku}`}
                              width={48}
                              height={48}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <ImageIcon
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                            />
                          )}
                        </div>
                      ))}
                      <div className="min-w-0 text-xs text-muted-foreground">
                        <p>
                          {shipment.allocations.length} variant line
                          {shipment.allocations.length === 1 ? '' : 's'}
                        </p>
                        <p className="font-mono tabular-nums">
                          {formatSupplyNumber(String(totals.received))} /{' '}
                          {formatSupplyNumber(String(totals.allocated))} units received
                        </p>
                      </div>
                    </div>
                    <Button
                      render={<Link href={`/inbound-shipments/${shipment.id}${action.query}`} />}
                      className="mt-4 h-11 w-full justify-between"
                    >
                      <span>{action.label}</span>
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Button>
                  </article>
                );
              })}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipment</TableHead>
                    <TableHead>Route & Tracking</TableHead>
                    <TableHead>Contents</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Next Step</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((shipment) => {
                    const totals = shipmentTotals(shipment);
                    const action = shipmentAction(shipment);
                    return (
                      <TableRow key={shipment.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <TransportIcon mode={shipment.transportMode} />
                            <div>
                              <Link
                                href={`/inbound-shipments/${shipment.id}`}
                                className="font-mono font-semibold text-primary hover:underline"
                              >
                                {shipment.shipmentNumber}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {shipment.transportMode} ·{' '}
                                {formatSupplyDate(shipment.expectedArrivalDate)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="max-w-64 truncate">
                            {shipment.originText ?? 'Origin not recorded'} →{' '}
                            {shipment.receivingLocationName}
                          </p>
                          <p className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                            {shipment.trackingReference ??
                              shipment.providerReference ??
                              'No tracking reference'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p>
                            {shipment.allocations.length} variant line
                            {shipment.allocations.length === 1 ? '' : 's'}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground tabular-nums">
                            {formatSupplyNumber(String(totals.received))} /{' '}
                            {formatSupplyNumber(String(totals.allocated))} units received
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={shipment.status} />
                            <StatusBadge status={shipment.receivingStatus} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            render={
                              <Link href={`/inbound-shipments/${shipment.id}${action.query}`} />
                            }
                            className="gap-1.5 whitespace-nowrap"
                          >
                            <span>{action.label}</span>
                            <ArrowRight aria-hidden="true" className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </section>

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalItems} shipments
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => updateQuery({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => updateQuery({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <PlanShipmentDialog
        open={planOpen}
        onOpenChange={setPlanDialog}
        onSuccess={(created) => {
          setPlanDialog(false);
          setSuccess(`Inbound shipment ${created?.shipmentNumber ?? ''} created.`);
          if (created?.id) router.push(`/inbound-shipments/${created.id}`);
        }}
      />
    </main>
  );
}
