'use client';

import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Search,
  Truck,
  Warehouse,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchApiData } from '@/lib/api';
import type { FulfillmentDto, WarehouseLocationDto } from '@maevelle/contracts';

import { FulfillmentStatusBadge } from '../delivery/delivery-status-badges';
import { FulfillmentCreateDialog } from './fulfillment-create-dialog';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-BD', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return value;
  }
}

type LifecycleAction = 'ready' | 'start-picking' | 'pack' | 'cancel';

function getRecommendedAction(
  status: FulfillmentDto['status'],
): { label: string; action: LifecycleAction; description: string } | null {
  switch (status) {
    case 'DRAFT':
      return {
        label: 'Mark Ready',
        action: 'ready',
        description: 'Approve this fulfillment for warehouse picking.',
      };
    case 'READY':
      return {
        label: 'Start Picking',
        action: 'start-picking',
        description: 'Assign pickers to collect physical items from stock shelves.',
      };
    case 'PICKING':
      return {
        label: 'Mark Packed',
        action: 'pack',
        description: 'Verify all physical items are packed into parcel containers.',
      };
    default:
      return null;
  }
}

export function FulfillmentConsole() {
  const searchParams = useSearchParams();
  const urlSelected = searchParams.get('selected');
  const urlQuery = searchParams.get('q') || searchParams.get('search');

  const [fulfillments, setFulfillments] = useState<readonly FulfillmentDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(urlSelected ?? undefined);
  const [query, setQuery] = useState(urlQuery ?? '');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'danger' } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [fData, lData] = await Promise.all([
        fetchApiData<readonly FulfillmentDto[]>('/admin/fulfillments?pageSize=100'),
        fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations'),
      ]);
      setFulfillments(fData || []);
      const eligibleLocs = (lData || []).filter((l) => l.capabilities.includes('STOCK_HOLDING'));
      setLocations(eligibleLocs);

      // Select initial from URL or first item if none selected
      setSelectedId((current) => {
        if (urlSelected && fData?.some((f) => f.id === urlSelected)) return urlSelected;
        if (current && fData?.some((f) => f.id === current)) return current;
        return fData?.[0]?.id;
      });
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to load fulfillment data.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [urlSelected]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => fulfillments.find((f) => f.id === selectedId),
    [fulfillments, selectedId],
  );

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return fulfillments.filter((item) => {
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesSearch =
        !term ||
        item.fulfillmentNumber.toLowerCase().includes(term) ||
        item.orderNumber.toLowerCase().includes(term) ||
        item.locationName.toLowerCase().includes(term) ||
        item.lines.some(
          (l) => l.sku.toLowerCase().includes(term) || l.productTitle.toLowerCase().includes(term),
        );
      return matchesStatus && matchesSearch;
    });
  }, [fulfillments, query, statusFilter]);

  // Operational metrics
  const inProgressCount = fulfillments.filter((f) =>
    ['READY', 'PICKING', 'PACKED'].includes(f.status),
  ).length;
  const readyToDispatchCount = fulfillments.filter((f) => f.status === 'PACKED').length;

  const handleLifecycleTransition = async (fulfillment: FulfillmentDto, act: LifecycleAction) => {
    if (
      act === 'cancel' &&
      !window.confirm(
        'Cancel this fulfillment? Reserved inventory will be retained for the order.',
      )
    ) {
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      await fetchApiData(`/admin/fulfillments/${fulfillment.id}/${act}`, {
        method: 'POST',
        headers: act === 'cancel' ? { 'idempotency-key': crypto.randomUUID() } : {},
        body: JSON.stringify({ version: fulfillment.version }),
      });
      setFeedback({
        message: `Fulfillment ${fulfillment.fulfillmentNumber} successfully transitioned (${act.replace('-', ' ')}).`,
        tone: 'success',
      });
      await reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Lifecycle transition was rejected.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDelivery = async (fulfillment: FulfillmentDto) => {
    setBusy(true);
    setFeedback(null);
    try {
      await fetchApiData(`/admin/fulfillments/${fulfillment.id}/deliveries`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      setFeedback({
        message: `Delivery successfully created for ${fulfillment.fulfillmentNumber}. You can now book a courier or record handover in Deliveries.`,
        tone: 'success',
      });
      await reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Could not prepare delivery.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDispatchHandover = async (fulfillment: FulfillmentDto) => {
    if (
      !window.confirm(
        'Confirm physical dispatch and inventory consumption? Outbound FIFO cost will be committed atomically.',
      )
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await fetchApiData(`/admin/fulfillments/${fulfillment.id}/dispatch`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: fulfillment.version }),
      });
      setFeedback({
        message: `Fulfillment ${fulfillment.fulfillmentNumber} dispatched. Inventory reservation consumed.`,
        tone: 'success',
      });
      await reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Dispatch failed.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const nextAction = selected ? getRecommendedAction(selected.status) : null;

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Operations / Delivery
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Fulfillments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage warehouse pick, pack, and physical dispatch workflows with strict inventory reservation safety.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FulfillmentCreateDialog
            locations={locations}
            onSuccess={async (newId) => {
              setFeedback({
                message: 'Fulfillment created successfully.',
                tone: 'success',
              });
              await reload();
              if (newId) setSelectedId(newId);
            }}
          />
          <Button
            render={<Link href="/deliveries" />}
            variant="outline"
            className="gap-1.5"
          >
            <Truck className="size-4" /> Open Deliveries
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void reload()}
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Operational Stats Cards */}
      <Stats>
        <StatsCard>
          <StatsTitle>All fulfillments</StatsTitle>
          <StatsValue>{fulfillments.length}</StatsValue>
          <StatsDescription>Total in tenant lifecycle</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>In progress</StatsTitle>
          <StatsValue>{inProgressCount}</StatsValue>
          <StatsDescription>Ready, picking, or packed</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Ready for dispatch</StatsTitle>
          <StatsValue>{readyToDispatchCount}</StatsValue>
          <StatsDescription>Packed & awaiting handover</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Stock warehouses</StatsTitle>
          <StatsValue>{locations.length}</StatsValue>
          <StatsDescription>Eligible source locations</StatsDescription>
        </StatsCard>
      </Stats>

      {/* Feedback Banner */}
      {feedback ? (
        <div
          className={`rounded-lg border p-3 text-xs flex items-center justify-between gap-2 ${
            feedback.tone === 'success'
              ? 'border-emerald-500/20 bg-emerald-50/50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.tone === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-64 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search fulfillment #, order #, warehouse, SKU…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <select
            className="rounded-md border bg-background px-2.5 py-1 text-xs focus:ring-2 focus:ring-primary"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses ({fulfillments.length})</option>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="PICKING">Picking</option>
            <option value="PACKED">Packed</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Main Workspace Layout (Table on left, Detail panel on right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Table Column */}
        <div className={selected ? 'lg:col-span-7' : 'lg:col-span-12'}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" /> Loading fulfillments…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Boxes className="size-8 opacity-20 mb-2" />
                <p className="text-sm font-medium">No matching fulfillments found.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Adjust filters or create a fulfillment from an unfulfilled order.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fulfillment</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-center">Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const isSelected = item.id === selectedId;
                    return (
                      <TableRow
                        key={item.id}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/5 font-medium' : 'hover:bg-muted/40'
                        }`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <TableCell>
                          <span className="font-semibold text-foreground">
                            {item.fulfillmentNumber}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {formatDate(item.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/orders/${item.orderId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline font-mono text-xs flex items-center gap-1"
                          >
                            {item.orderNumber}
                            <ExternalLink className="size-2.5 opacity-60" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.locationName}
                        </TableCell>
                        <TableCell className="text-center font-medium text-xs">
                          {item.lines.length}
                        </TableCell>
                        <TableCell>
                          <FulfillmentStatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={isSelected ? 'default' : 'ghost'}
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(item.id);
                            }}
                          >
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Detail Panel Column */}
        {selected ? (
          <div className="lg:col-span-5 space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Fulfillment Details
                    </span>
                    <CardTitle className="text-lg font-bold flex items-center gap-2 mt-0.5">
                      {selected.fulfillmentNumber}
                      <FulfillmentStatusBadge status={selected.status} />
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelectedId(undefined)}
                    className="h-7 px-2 text-muted-foreground"
                  >
                    Close
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4 text-xs">
                {/* Recommended Next Action Banner */}
                {nextAction ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col gap-2">
                    <div>
                      <p className="font-semibold text-primary text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5" /> Next Recommended Action
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {nextAction.description}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleLifecycleTransition(selected, nextAction.action)}
                      className="gap-1.5 w-fit"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        nextAction.label
                      )}
                    </Button>
                  </div>
                ) : null}

                {/* Key Facts Grid */}
                <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[11px]">Commercial Order:</span>
                    <p className="font-semibold text-foreground mt-0.5">
                      <Link
                        href={`/orders/${selected.orderId}`}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {selected.orderNumber}
                        <ExternalLink className="size-3" />
                      </Link>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Warehouse:</span>
                    <p className="font-semibold text-foreground mt-0.5 flex items-center gap-1">
                      <Warehouse className="size-3 text-muted-foreground" />
                      {selected.locationName}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Created Date:</span>
                    <p className="text-foreground mt-0.5">{formatDate(selected.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Dispatched Date:</span>
                    <p className="text-foreground mt-0.5">{formatDate(selected.dispatchedAt)}</p>
                  </div>
                </div>

                {/* Physical Lines Table */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground text-xs">
                    Allocated Items ({selected.lines.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="text-left font-medium p-2">Item / SKU</th>
                          <th className="text-center font-medium p-2">Qty</th>
                          <th className="text-right font-medium p-2">Consumed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selected.lines.map((line) => (
                          <tr key={line.id} className="hover:bg-muted/10">
                            <td className="p-2">
                              <p className="font-medium text-foreground">{line.productTitle}</p>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {line.sku}
                              </span>
                            </td>
                            <td className="p-2 text-center font-semibold">{line.quantity}</td>
                            <td className="p-2 text-right text-muted-foreground font-mono">
                              {selected.status === 'DISPATCHED' ? line.consumed : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Operations & Handover Actions */}
                <div className="space-y-2 pt-2 border-t">
                  <h4 className="font-semibold text-foreground text-xs">
                    Fulfillment Operations
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {['PACKED', 'DISPATCHED'].includes(selected.status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void handleCreateDelivery(selected)}
                        className="gap-1.5"
                      >
                        <Truck className="size-3.5" /> Prepare Delivery Shipment
                      </Button>
                    ) : null}

                    {selected.status === 'PACKED' ? (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={busy}
                        onClick={() => void handleDispatchHandover(selected)}
                        className="gap-1.5"
                      >
                        <PackageCheck className="size-3.5" /> Record Physical Dispatch
                      </Button>
                    ) : null}

                    {['DRAFT', 'READY', 'PICKING', 'PACKED'].includes(selected.status) ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void handleLifecycleTransition(selected, 'cancel')}
                        className="gap-1.5"
                      >
                        <XCircle className="size-3.5" /> Cancel Fulfillment
                      </Button>
                    ) : null}

                    {/* Direct link to Deliveries if delivery might exist */}
                    {['PACKED', 'DISPATCHED'].includes(selected.status) ? (
                      <Button
                        render={
                          <Link
                            href={`/deliveries?search=${encodeURIComponent(
                              selected.fulfillmentNumber,
                            )}`}
                          />
                        }
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                      >
                        View in Deliveries <ArrowRight className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Architectural Invariants Guidance */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-[11px] text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Info className="size-3.5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground font-medium">Inventory & Costing Boundary:</strong>
                      <p className="mt-0.5">
                        Stock reservation is consumed and FIFO COGS is recognized atomically upon physical dispatch. Packing preserves stock reservation without premature movement.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
