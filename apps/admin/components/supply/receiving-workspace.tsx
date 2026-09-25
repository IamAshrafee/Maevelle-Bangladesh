'use client';

import { type FormEvent, useEffect, useState, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CheckCircle,
  ExternalLink,
  Eye,
  FileCheck2,
  HelpCircle,
  Layers3,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Search,
  Ship,
  Sparkles,
  Warehouse,
  X,
} from 'lucide-react';
import type {
  InboundReceiptDto,
  InboundReceiptLineDto,
  InboundShipmentDto,
  SupplyOverviewDto,
} from '@maevelle/contracts';
import type { PagedEnvelope } from '@/lib/supply/types';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatSupplyDate,
  formatSupplyNumber,
  remainingSupplyQuantity,
  supplyRequest,
} from '@/lib/supply/api';
import type { ReceiptDraftLine } from '@/lib/supply/types';
import { ReceiveGoodsDialog } from './shipment-detail/dialogs/receive-goods-dialog';
import { ReceiptResolveConditionDialog } from './receipt-resolve-condition-dialog';

export function ReceivingWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const canReceive = useAdminCapability('receiving.post');
  const canAdjust = useAdminCapability('receiving.adjust');
  const canViewReceiving = useAdminCapability('receiving.view');

  const activeTab = searchParams.get('tab') ?? 'intake'; // 'intake' | 'history' | 'resolution'
  const currentPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const PAGE_SIZE = 15;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const [arrivedShipments, setArrivedShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [receipts, setReceipts] = useState<readonly InboundReceiptDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [overview, setOverview] = useState<SupplyOverviewDto>();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Receiving Goods Dialog state
  const [receivingShipment, setReceivingShipment] = useState<InboundShipmentDto | null>(null);
  const [receiptLines, setReceiptLines] = useState<ReceiptDraftLine[]>([]);
  const [savingReceipt, setSavingReceipt] = useState(false);

  // Resolve Condition Dialog state
  const [resolvingReceipt, setResolvingReceipt] = useState<InboundReceiptDto | null>(null);
  const [resolvingLine, setResolvingLine] = useState<InboundReceiptLineDto | null>(null);
  const [resolvingBusy, setResolvingBusy] = useState(false);

  // Fetch overview stats
  useEffect(() => {
    supplyRequest<{ data: SupplyOverviewDto }>('/admin/supply/overview')
      .then((res) => setOverview(res.data))
      .catch(() => {});
  }, []);

  // Fetch data depending on activeTab
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(PAGE_SIZE));
    if (deferredQuery) params.set('q', deferredQuery);

    if (activeTab === 'intake') {
      params.set('status', 'ARRIVED');
      params.set('receivingStatus', 'NOT_RECEIVED,PARTIALLY_RECEIVED');

      supplyRequest<PagedEnvelope<InboundShipmentDto>>(`/admin/inbound-shipments?${params.toString()}`)
        .then((res) => {
          if (!active) return;
          setArrivedShipments(res.data ?? []);
          if (res.pagination) {
            setTotalItems(res.pagination.totalItems);
            setTotalPages(res.pagination.totalPages || 1);
          }
        })
        .catch((err) => {
          if (!active) return;
          setError(err instanceof Error ? err.message : 'Failed to load arrived shipments.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      // 'history' or 'resolution'
      supplyRequest<PagedEnvelope<InboundReceiptDto>>(`/admin/inbound-receipts?${params.toString()}`)
        .then((res) => {
          if (!active) return;
          setReceipts(res.data ?? []);
          if (res.pagination) {
            setTotalItems(res.pagination.totalItems);
            setTotalPages(res.pagination.totalPages || 1);
          }
        })
        .catch((err) => {
          if (!active) return;
          setError(err instanceof Error ? err.message : 'Failed to load inbound receipts.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [activeTab, currentPage, deferredQuery]);

  function updateFilter(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || value === 'ALL') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    if (!('page' in updates)) {
      next.set('page', '1');
    }
    router.replace(`/receiving?${next.toString()}`, { scroll: false });
  }

  function openReceiveDialog(shipment: InboundShipmentDto) {
    setReceivingShipment(shipment);
    setReceiptLines(
      shipment.allocations
        .filter((a) => Number(a.receivedQuantity) < Number(a.allocatedQuantity))
        .map((a) => ({
          shipmentAllocationId: a.id,
          condition: 'SELLABLE',
          quantity: remainingSupplyQuantity(a.allocatedQuantity, a.receivedQuantity),
        })),
    );
  }

  async function handlePostReceiptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receivingShipment || !receiptLines.length) return;
    setSavingReceipt(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const packingSlip = form.get('packingSlipReference')?.toString().trim();
    const notes = form.get('notes')?.toString().trim();

    try {
      await supplyRequest(`/admin/inbound-shipments/${receivingShipment.id}/receipts`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          packingSlipReference: packingSlip || undefined,
          notes: notes || undefined,
          lines: receiptLines,
        }),
      });

      setSuccess(`Inbound receipt posted! Warehouse stock and provisional cost layers updated.`);
      setReceivingShipment(null);
      setReceiptLines([]);
      router.refresh();

      // Refresh list
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('pageSize', String(PAGE_SIZE));
      params.set('status', 'ARRIVED');
      params.set('receivingStatus', 'NOT_RECEIVED,PARTIALLY_RECEIVED');
      const res = await supplyRequest<PagedEnvelope<InboundShipmentDto>>(`/admin/inbound-shipments?${params.toString()}`);
      setArrivedShipments(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post receiving voucher.');
    } finally {
      setSavingReceipt(false);
    }
  }

  async function handleResolveConditionSubmit(data: {
    lineId: string;
    targetCondition: 'SELLABLE' | 'DAMAGED';
    quantity: string;
    reason?: string | undefined;
  }) {
    if (!resolvingReceipt) return;
    setResolvingBusy(true);
    setError(null);
    try {
      await supplyRequest(`/admin/inbound-receipts/${resolvingReceipt.id}/resolve-condition`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(data),
      });

      setSuccess(`Condition resolved: ${data.quantity} units reclassified to ${data.targetCondition}.`);
      setResolvingLine(null);
      setResolvingReceipt(null);
      router.refresh();

      // Refresh receipts
      const res = await supplyRequest<PagedEnvelope<InboundReceiptDto>>(
        `/admin/inbound-receipts?page=${currentPage}&pageSize=${PAGE_SIZE}`,
      );
      setReceipts(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve condition.');
    } finally {
      setResolvingBusy(false);
    }
  }

  // Find non-sellable lines for inspection resolution queue
  const nonSellableLines: { receipt: InboundReceiptDto; line: InboundReceiptLineDto }[] = [];
  for (const receipt of receipts) {
    if (receipt.status === 'POSTED') {
      for (const line of receipt.lines) {
        if (line.condition === 'DAMAGED' || line.condition === 'QUARANTINE' || line.condition === 'INSPECTION') {
          nonSellableLines.push({ receipt, line });
        }
      }
    }
  }

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight">Inbound Receiving & Inspection</h1>
            <Badge variant="outline" className="font-mono text-xs">
              Physical Intake
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Count physical arrivals, inspect condition (sellable, damaged, quarantine), and commit authoritative stock increases to Inventory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/inventory/history?type=INBOUND_RECEIPT" />}
            className="gap-1.5"
          >
            <Warehouse className="size-4 text-primary" />
            <span>Open Inventory Ledger</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            render={<Link href="/inbound-shipments" />}
            className="gap-1.5"
          >
            <Ship className="size-4 text-muted-foreground" />
            <span>View All Shipments</span>
          </Button>
        </div>
      </div>

      {/* Operational Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Ready to Count</span>
            <span className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
              <PackageCheck className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.awaitingReceiptShipments ?? 0}</span>
            <span className="text-xs text-muted-foreground">Arrived shipments</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Receipts Today</span>
            <span className="rounded-md bg-primary/10 p-1.5 text-primary">
              <FileCheck2 className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.receiptsToday ?? 0}</span>
            <span className="text-xs text-muted-foreground">Posted receiving vouchers</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">In Transit</span>
            <span className="rounded-md bg-sky-500/10 p-1.5 text-sky-600 dark:text-sky-400">
              <Ship className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.inTransitShipments ?? 0}</span>
            <span className="text-xs text-muted-foreground">Expected soon</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Condition Attention</span>
            <span className="rounded-md bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{nonSellableLines.length}</span>
            <span className="text-xs text-muted-foreground">Quarantine / damaged lines</span>
          </div>
        </Card>
      </div>

      {/* Notifications / Feedback */}
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <button className="ml-auto text-xs underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      ) : null}

      {success ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <Check className="size-4 shrink-0" />
          <span>{success}</span>
          <button className="ml-auto text-xs underline" onClick={() => setSuccess(null)}>Dismiss</button>
        </div>
      ) : null}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <button
          onClick={() => updateFilter({ tab: 'intake' })}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'intake'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <span>Arrived Shipments Awaiting Intake</span>
          {arrivedShipments.length > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {arrivedShipments.length}
            </Badge>
          ) : null}
        </button>

        <button
          onClick={() => updateFilter({ tab: 'history' })}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          Posted Receiving Vouchers
        </button>

        <button
          onClick={() => updateFilter({ tab: 'resolution' })}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'resolution'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <span>Quarantine & Inspection Resolution</span>
          {nonSellableLines.length > 0 ? (
            <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
              {nonSellableLines.length}
            </Badge>
          ) : null}
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            updateFilter({ q: e.target.value.trim() || null });
          }}
          placeholder={
            activeTab === 'intake'
              ? 'Filter arrived shipments by number, location…'
              : 'Filter vouchers by RCV number, packing slip…'
          }
          className="pl-9 text-sm"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery('');
              updateFilter({ q: null });
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Tab Content: Intake Queue */}
      {activeTab === 'intake' ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment #</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Arrived Date</TableHead>
                <TableHead>Goods Pending Count</TableHead>
                <TableHead>Receiving Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-44 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                      <span>Checking warehouse arrival queue…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : arrivedShipments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <PackageCheck className="size-8 text-emerald-600/70" />
                      <p className="font-heading text-sm font-semibold">Receiving queue is clear!</p>
                      <p className="max-w-xs text-xs text-muted-foreground">
                        All arrived shipments have been physically counted. When new shipments arrive at a warehouse, they will appear here.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href="/inbound-shipments" />}
                        className="mt-2"
                      >
                        View in-transit shipments
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                arrivedShipments.map((shipment) => {
                  const totalAllocated = shipment.allocations.reduce((s, a) => s + Number(a.allocatedQuantity), 0);
                  const totalReceived = shipment.allocations.reduce((s, a) => s + Number(a.receivedQuantity), 0);
                  const pending = Math.max(0, totalAllocated - totalReceived);

                  return (
                    <TableRow key={shipment.id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="flex flex-col">
                          <Link
                            href={`/inbound-shipments/${shipment.id}`}
                            className="font-heading font-semibold text-primary hover:underline"
                          >
                            {shipment.shipmentNumber}
                          </Link>
                          <span className="text-xs text-muted-foreground capitalize">
                            {shipment.transportMode.toLowerCase()} &bull; {shipment.trackingReference || 'No tracking'}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Warehouse className="size-3.5 text-muted-foreground" />
                          <span className="font-medium text-foreground">{shipment.receivingLocationName}</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {formatSupplyDate(shipment.arrivedAt)}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          <span>
                            <strong>{formatSupplyNumber(String(pending))}</strong> units remaining
                          </span>
                          <span className="text-muted-foreground">
                            ({shipment.allocations.length} product lines)
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <StatusBadge status={shipment.receivingStatus} />
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canReceive ? (
                            <Button
                              size="sm"
                              onClick={() => openReceiveDialog(shipment)}
                              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <PackageOpen className="size-4" />
                              <span>Count & Receive</span>
                            </Button>
                          ) : null}

                          <Button
                            variant="outline"
                            size="sm"
                            render={<Link href={`/inbound-shipments/${shipment.id}`} />}
                          >
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {/* Tab Content: History */}
      {activeTab === 'history' ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>Shipment</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Count Breakdown</TableHead>
                <TableHead>Posted Timestamp</TableHead>
                <TableHead className="text-right">Inventory Proof</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-44 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                      <span>Loading receipt vouchers…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : receipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-sm text-muted-foreground">
                    No receipt vouchers found matching your filter.
                  </TableCell>
                </TableRow>
              ) : (
                receipts.map((receipt) => {
                  const totalCounted = receipt.lines.reduce((s, l) => s + Number(l.quantity), 0);
                  const damaged = receipt.lines
                    .filter((l) => l.condition === 'DAMAGED')
                    .reduce((s, l) => s + Number(l.quantity), 0);
                  const quarantine = receipt.lines
                    .filter((l) => l.condition === 'QUARANTINE' || l.condition === 'INSPECTION')
                    .reduce((s, l) => s + Number(l.quantity), 0);

                  return (
                    <TableRow key={receipt.id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/receiving/${receipt.id}`}
                            className="font-heading font-semibold text-primary hover:underline"
                          >
                            {receipt.receiptNumber}
                          </Link>
                          <StatusBadge status={receipt.status} />
                        </div>
                      </TableCell>

                      <TableCell>
                        <Link
                          href={`/inbound-shipments/${receipt.shipmentId}`}
                          className="font-medium text-foreground hover:underline hover:text-primary"
                        >
                          {receipt.shipmentNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {receipt.packingSlipReference ? `Slip: ${receipt.packingSlipReference}` : 'No slip recorded'}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Warehouse className="size-3.5 text-muted-foreground" />
                          <span>{receipt.locationName}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-semibold text-foreground">
                            {formatSupplyNumber(String(totalCounted))} total units
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {damaged > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {damaged} Damaged
                              </Badge>
                            ) : null}
                            {quarantine > 0 ? (
                              <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 text-[10px]">
                                {quarantine} Quarantine
                              </Badge>
                            ) : null}
                            {damaged === 0 && quarantine === 0 ? (
                              <span className="text-muted-foreground">All sellable</span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {formatSupplyDate(receipt.postedAt)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/inventory/history?q=${receipt.receiptNumber}`}
                            className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted"
                            title="Verify stock ledger entry"
                          >
                            <span>Ledger Movement</span>
                            <ExternalLink className="size-3" />
                          </Link>

                          <Button
                            variant="ghost"
                            size="xs"
                            render={<Link href={`/receiving/${receipt.id}`} />}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {/* Tab Content: Inspection Resolution Queue */}
      {activeTab === 'resolution' ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>SKU & Product</TableHead>
                <TableHead>Current Condition</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nonSellableLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-44 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CheckCircle className="size-8 text-emerald-600/70" />
                      <p className="font-heading text-sm font-semibold">No quarantine or inspection items pending!</p>
                      <p className="max-w-xs text-xs text-muted-foreground">
                        All counted goods across recent receipts are either classified as Sellable or have completed resolution.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                nonSellableLines.map(({ receipt, line }) => (
                  <TableRow key={`${receipt.id}-${line.id}`} className="hover:bg-muted/40">
                    <TableCell>
                      <Link
                        href={`/receiving/${receipt.id}`}
                        className="font-heading font-semibold text-primary hover:underline"
                      >
                        {receipt.receiptNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        Posted {formatSupplyDate(receipt.postedAt)}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        <Link
                          href={`/products/${line.productId}`}
                          className="font-medium hover:underline hover:text-primary truncate"
                        >
                          {line.productTitle}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground">{line.sku}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={line.condition === 'DAMAGED' ? 'destructive' : 'secondary'}
                        className={
                          line.condition === 'QUARANTINE' || line.condition === 'INSPECTION'
                            ? 'bg-amber-500/10 text-amber-700'
                            : ''
                        }
                      >
                        {line.condition}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-semibold text-sm">
                      {formatSupplyNumber(line.quantity)} units
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {receipt.locationName}
                    </TableCell>

                    <TableCell className="text-right">
                      {canAdjust ? (
                        <Button
                          size="xs"
                          onClick={() => {
                            setResolvingReceipt(receipt);
                            setResolvingLine(line);
                          }}
                          className="gap-1.5"
                        >
                          <Sparkles className="size-3.5" />
                          <span>Resolve Condition</span>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {/* Receive Goods Dialog */}
      {receivingShipment ? (
        <ReceiveGoodsDialog
          open={Boolean(receivingShipment)}
          onOpenChange={(open) => {
            if (!open) {
              setReceivingShipment(null);
              setReceiptLines([]);
            }
          }}
          shipment={receivingShipment}
          lines={receiptLines}
          setLines={setReceiptLines}
          onSubmit={handlePostReceiptSubmit}
          saving={savingReceipt}
        />
      ) : null}

      {/* Resolve Condition Dialog */}
      {resolvingReceipt && resolvingLine ? (
        <ReceiptResolveConditionDialog
          line={resolvingLine}
          receipt={resolvingReceipt}
          busy={resolvingBusy}
          onClose={() => {
            setResolvingLine(null);
            setResolvingReceipt(null);
          }}
          onResolve={handleResolveConditionSubmit}
        />
      ) : null}
    </main>
  );
}
