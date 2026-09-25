'use client';

import { type FormEvent, useEffect, useState, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Package,
  PackageCheck,
  PackageOpen,
  Plane,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Ship,
  Train,
  Truck,
  Warehouse,
  X,
} from 'lucide-react';
import type {
  InboundReceiptDto,
  InboundShipmentDto,
  SupplyOverviewDto,
} from '@maevelle/contracts';
import type { PagedEnvelope } from '@/lib/supply/types';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  formatSupplyDate,
  formatSupplyNumber,
  remainingSupplyQuantity,
  supplyRequest,
} from '@/lib/supply/api';
import type { ReceiptDraftLine } from '@/lib/supply/types';
import { PlanShipmentDialog } from './plan-shipment-dialog';
import { ReceiveGoodsDialog } from './shipment-detail/dialogs/receive-goods-dialog';

const TRANSPORT_MODES = [
  { value: 'ALL', label: 'All Modes' },
  { value: 'SEA', label: 'Sea Freight' },
  { value: 'AIR', label: 'Air Freight' },
  { value: 'ROAD', label: 'Road Transport' },
  { value: 'RAIL', label: 'Rail' },
  { value: 'OTHER', label: 'Other' },
] as const;

const SHIPMENT_STATUS_TABS = [
  { value: 'ALL', label: 'All Shipments' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'ARRIVED', label: 'Arrived (Intake Ready)' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

function TransportIcon({ mode }: { mode: string }) {
  const m = mode.toUpperCase();
  if (m === 'AIR') return <Plane className="size-4 text-sky-600 dark:text-sky-400" />;
  if (m === 'ROAD') return <Truck className="size-4 text-amber-600 dark:text-amber-400" />;
  if (m === 'RAIL') return <Train className="size-4 text-purple-600 dark:text-purple-400" />;
  return <Ship className="size-4 text-primary" />;
}

export function ShipmentsList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const canManageShipments = useAdminCapability('inbound_shipment.manage');
  const canReceive = useAdminCapability('receiving.post');
  const canViewReceiving = useAdminCapability('receiving.view');

  const activeTab = searchParams.get('tab') ?? 'shipments'; // 'shipments' | 'queue' | 'receipts'
  const currentStatus = searchParams.get('status') ?? 'ALL';
  const currentMode = searchParams.get('mode') ?? '';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const PAGE_SIZE = 15;

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const [shipments, setShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [receipts, setReceipts] = useState<readonly InboundReceiptDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [overview, setOverview] = useState<SupplyOverviewDto>();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialog states
  const [planOpen, setPlanOpen] = useState(searchParams.get('create') === 'shipment');
  const [receivingShipment, setReceivingShipment] = useState<InboundShipmentDto | null>(null);
  const [receiptLines, setReceiptLines] = useState<ReceiptDraftLine[]>([]);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [expandedShipmentId, setExpandedShipmentId] = useState<string | null>(null);

  // Load overview stats once
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

    if (activeTab === 'receipts') {
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
          setError(err instanceof Error ? err.message : 'Failed to load receipt history.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      if (activeTab === 'queue') {
        params.set('status', 'ARRIVED');
        params.set('receivingStatus', 'NOT_RECEIVED,PARTIALLY_RECEIVED');
      } else {
        if (currentStatus !== 'ALL') params.set('status', currentStatus);
        if (currentMode) params.set('transportMode', currentMode);
      }

      supplyRequest<PagedEnvelope<InboundShipmentDto>>(`/admin/inbound-shipments?${params.toString()}`)
        .then((res) => {
          if (!active) return;
          setShipments(res.data ?? []);
          if (res.pagination) {
            setTotalItems(res.pagination.totalItems);
            setTotalPages(res.pagination.totalPages || 1);
          }
        })
        .catch((err) => {
          if (!active) return;
          setError(err instanceof Error ? err.message : 'Failed to load inbound shipments.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [activeTab, currentPage, deferredQuery, currentStatus, currentMode]);

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
    router.replace(`/inbound-shipments?${next.toString()}`, { scroll: false });
  }

  async function handleDepart(shipment: InboundShipmentDto) {
    if (!canManageShipments) return;
    setBusy(true);
    setError(null);
    try {
      await supplyRequest(`/admin/inbound-shipments/${shipment.id}/depart`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: shipment.version }),
      });
      setSuccess(`Shipment ${shipment.shipmentNumber} marked as In Transit.`);
      router.refresh();
      // Reload current query
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', String(PAGE_SIZE));
      if (currentStatus !== 'ALL') params.set('status', currentStatus);
      const res = await supplyRequest<PagedEnvelope<InboundShipmentDto>>(`/admin/inbound-shipments?${params.toString()}`);
      setShipments(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark departure.');
    } finally {
      setBusy(false);
    }
  }

  async function handleArrive(shipment: InboundShipmentDto) {
    if (!canManageShipments) return;
    setBusy(true);
    setError(null);
    try {
      await supplyRequest(`/admin/inbound-shipments/${shipment.id}/arrive`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: shipment.version }),
      });
      setSuccess(`Arrival recorded for ${shipment.shipmentNumber}. Ready for warehouse intake.`);
      router.refresh();
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', String(PAGE_SIZE));
      if (currentStatus !== 'ALL') params.set('status', currentStatus);
      const res = await supplyRequest<PagedEnvelope<InboundShipmentDto>>(`/admin/inbound-shipments?${params.toString()}`);
      setShipments(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record arrival.');
    } finally {
      setBusy(false);
    }
  }

  function openReceiveDialog(shipment: InboundShipmentDto) {
    setReceivingShipment(shipment);
    // Pre-populate sellable lines
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

      setSuccess(`Receipt posted! Inventory stock and provisional cost layers updated.`);
      setReceivingShipment(null);
      setReceiptLines([]);
      router.refresh();

      // Refresh shipments list
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', String(PAGE_SIZE));
      const res = await supplyRequest<PagedEnvelope<InboundShipmentDto>>(`/admin/inbound-shipments?${params.toString()}`);
      setShipments(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post receiving voucher.');
    } finally {
      setSavingReceipt(false);
    }
  }

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight">Inbound Shipments</h1>
            <Badge variant="outline" className="font-mono text-xs">
              {totalItems} {totalItems === 1 ? 'record' : 'records'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track freight logistics from vendor dispatch through customs arrival and physical warehouse receipt.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageShipments ? (
            <Button size="sm" onClick={() => setPlanOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              <span>Plan Inbound Shipment</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Operational Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">In Transit</span>
            <span className="rounded-md bg-sky-500/10 p-1.5 text-sky-600 dark:text-sky-400">
              <Truck className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.inTransitShipments ?? 0}</span>
            <span className="text-xs text-muted-foreground">En route to warehouse</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Awaiting Intake</span>
            <span className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
              <PackageCheck className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.awaitingReceiptShipments ?? 0}</span>
            <span className="text-xs text-muted-foreground">Arrived at warehouse</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Planned</span>
            <span className="rounded-md bg-muted p-1.5 text-muted-foreground">
              <PackageOpen className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.plannedShipments ?? 0}</span>
            <span className="text-xs text-muted-foreground">Awaiting departure</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Receipts Today</span>
            <span className="rounded-md bg-primary/10 p-1.5 text-primary">
              <Check className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.receiptsToday ?? 0}</span>
            <span className="text-xs text-muted-foreground">Counted into stock</span>
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

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <button
          onClick={() => updateFilter({ tab: 'shipments', status: null })}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'shipments'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          All Logistics Shipments
        </button>

        <button
          onClick={() => updateFilter({ tab: 'queue', status: null })}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'queue'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <span>Receiving Queue (Intake Ready)</span>
          {(overview?.awaitingReceiptShipments ?? 0) > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {overview?.awaitingReceiptShipments}
            </Badge>
          ) : null}
        </button>

        <button
          onClick={() => updateFilter({ tab: 'receipts', status: null })}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'receipts'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          Receipts History & Inventory Proofs
        </button>
      </div>

      {/* Secondary Controls Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              updateFilter({ q: e.target.value.trim() || null });
            }}
            placeholder={
              activeTab === 'receipts'
                ? 'Search receipts by RCV number, packing slip, notes…'
                : 'Search shipments by number, tracking reference, origin…'
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

        {activeTab === 'shipments' ? (
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={currentStatus}
              onChange={(e) => updateFilter({ status: e.target.value || null })}
              size="sm"
              className="w-40"
            >
              {SHIPMENT_STATUS_TABS.map((t) => (
                <NativeSelectOption key={t.value} value={t.value}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>

            <NativeSelect
              value={currentMode}
              onChange={(e) => updateFilter({ mode: e.target.value || null })}
              size="sm"
              className="w-36"
            >
              {TRANSPORT_MODES.map((m) => (
                <NativeSelectOption key={m.value} value={m.value}>
                  {m.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>

            {(query || currentStatus !== 'ALL' || currentMode) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('');
                  updateFilter({ q: null, status: null, mode: null });
                }}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
                <span>Reset</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Table: Receipts Tab */}
      {activeTab === 'receipts' ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>Shipment Reference</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Counted Quantities</TableHead>
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
                      <span>Loading receipt history…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : receipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <PackageCheck className="size-8 text-muted-foreground/60" />
                      <p className="font-heading text-sm font-semibold">No receiving vouchers found</p>
                      <p className="max-w-xs text-xs text-muted-foreground">
                        When warehouse workers count arrived shipments, permanent receipt vouchers appear here.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                receipts.map((receipt) => {
                  const totalCounted = receipt.lines.reduce((s, l) => s + Number(l.quantity), 0);
                  const damagedCount = receipt.lines
                    .filter((l) => l.condition === 'DAMAGED')
                    .reduce((s, l) => s + Number(l.quantity), 0);
                  const quarantineCount = receipt.lines
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
                        <div className="flex flex-col">
                          <Link
                            href={`/inbound-shipments/${receipt.shipmentId}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {receipt.shipmentNumber}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {receipt.packingSlipReference ? `Slip: ${receipt.packingSlipReference}` : 'No slip recorded'}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Warehouse className="size-3.5 text-muted-foreground" />
                          <span>{receipt.locationName}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-xs">
                            {formatSupplyNumber(String(totalCounted))} total units
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {damagedCount > 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {damagedCount} Damaged
                              </Badge>
                            ) : null}
                            {quarantineCount > 0 ? (
                              <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 text-[10px]">
                                {quarantineCount} Quarantine
                              </Badge>
                            ) : null}
                            {damagedCount === 0 && quarantineCount === 0 ? (
                              <span className="text-xs text-muted-foreground">All sellable</span>
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
      ) : (
        /* Table: Shipments Tab (All or Receiving Queue) */
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Shipment & Mode</TableHead>
                <TableHead>Origin / Destination</TableHead>
                <TableHead>Logistics & Tracking</TableHead>
                <TableHead>Allocated Goods</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-44 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                      <span>Loading inbound shipments…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : shipments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Ship className="size-8 text-muted-foreground/60" />
                      <p className="font-heading text-sm font-semibold">
                        {activeTab === 'queue' ? 'Receiving queue is clear' : 'No shipments found'}
                      </p>
                      <p className="max-w-xs text-xs text-muted-foreground">
                        {activeTab === 'queue'
                          ? 'No shipments are currently arrived and waiting for intake.'
                          : 'Plan a freight shipment from placed purchase orders to start tracking delivery.'}
                      </p>
                      {activeTab !== 'queue' && canManageShipments ? (
                        <Button size="sm" onClick={() => setPlanOpen(true)} className="mt-2 gap-1.5">
                          <Plus className="size-4" />
                          <span>Plan Inbound Shipment</span>
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                shipments.map((shipment) => {
                  const isExpanded = expandedShipmentId === shipment.id;
                  const totalAllocated = shipment.allocations.reduce((s, a) => s + Number(a.allocatedQuantity), 0);
                  const totalReceived = shipment.allocations.reduce((s, a) => s + Number(a.receivedQuantity), 0);
                  const remaining = Math.max(0, totalAllocated - totalReceived);

                  return (
                    <TableRow key={shipment.id} className="group hover:bg-muted/40">
                      {/* Expand Chevron */}
                      <TableCell className="p-2 text-center">
                        {shipment.allocations.length > 0 ? (
                          <button
                            onClick={() => setExpandedShipmentId(isExpanded ? null : shipment.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Show allocated goods"
                          >
                            <ChevronRight
                              className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                          </button>
                        ) : null}
                      </TableCell>

                      {/* Shipment & Mode */}
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <TransportIcon mode={shipment.transportMode} />
                            <Link
                              href={`/inbound-shipments/${shipment.id}`}
                              className="font-heading font-semibold text-primary hover:underline"
                            >
                              {shipment.shipmentNumber}
                            </Link>
                          </div>
                          <span className="text-xs text-muted-foreground capitalize">
                            {shipment.transportMode.toLowerCase()} freight
                          </span>
                        </div>
                      </TableCell>

                      {/* Origin & Destination */}
                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span className="font-medium text-foreground">
                            &rarr; {shipment.receivingLocationName}
                          </span>
                          <span className="text-muted-foreground">
                            {shipment.originText ? `From: ${shipment.originText}` : 'Origin: Not specified'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Tracking & ETA */}
                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span className="font-mono font-medium text-foreground">
                            {shipment.trackingReference || 'No tracking reference'}
                          </span>
                          <span className="text-muted-foreground">
                            {shipment.arrivedAt
                              ? `Arrived: ${formatSupplyDate(shipment.arrivedAt)}`
                              : shipment.expectedArrivalDate
                                ? `ETA: ${formatSupplyDate(shipment.expectedArrivalDate)}`
                                : 'No arrival ETA'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Allocated Goods */}
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              {shipment.allocations.length} {shipment.allocations.length === 1 ? 'line' : 'lines'} · {formatSupplyNumber(String(totalAllocated))} units
                            </span>
                            <span className="font-mono text-xs">
                              {formatSupplyNumber(String(totalReceived))}/{formatSupplyNumber(String(totalAllocated))}
                            </span>
                          </div>
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{
                                width: `${totalAllocated > 0 ? Math.min(100, (totalReceived / totalAllocated) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      {/* Status Badges */}
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={shipment.status} />
                          <StatusBadge status={shipment.receivingStatus} />
                        </div>
                      </TableCell>

                      {/* Contextual Action Button */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {shipment.status === 'PLANNED' && canManageShipments ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void handleDepart(shipment)}
                              className="gap-1 text-xs"
                            >
                              <Truck className="size-3.5" />
                              <span>Depart</span>
                            </Button>
                          ) : null}

                          {shipment.status === 'IN_TRANSIT' && canManageShipments ? (
                            <Button
                              size="xs"
                              disabled={busy}
                              onClick={() => void handleArrive(shipment)}
                              className="gap-1 text-xs"
                            >
                              <PackageCheck className="size-3.5" />
                              <span>Mark Arrived</span>
                            </Button>
                          ) : null}

                          {shipment.status === 'ARRIVED' && shipment.receivingStatus !== 'RECEIVED' && canReceive ? (
                            <Button
                              size="xs"
                              onClick={() => openReceiveDialog(shipment)}
                              className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <PackageOpen className="size-3.5" />
                              <span>Receive Goods</span>
                            </Button>
                          ) : null}

                          <Button
                            variant="ghost"
                            size="xs"
                            render={<Link href={`/inbound-shipments/${shipment.id}`} />}
                            title="View details"
                          >
                            <Eye className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Expanded Shipment Allocations */}
          {shipments
            .filter((s) => expandedShipmentId === s.id)
            .map((shipment) => (
              <div key={`expanded-shipment-${shipment.id}`} className="border-t bg-muted/20 px-6 py-4">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Shipment Contents ({shipment.allocations.length} line allocations)
                  </span>
                  <Link
                    href={`/inbound-shipments/${shipment.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Open shipment inspection &rarr;
                  </Link>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {shipment.allocations.map((alloc) => (
                    <div
                      key={alloc.id}
                      className="flex flex-col justify-between rounded-lg border bg-card p-3 text-xs shadow-xs"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/products/${alloc.productId}`}
                            className="font-medium text-foreground hover:text-primary hover:underline truncate"
                          >
                            {alloc.productTitle}
                          </Link>
                          <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                            {alloc.sku}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                          <span>PO: {alloc.purchaseNumber}</span>
                          <span>&bull;</span>
                          <span>{alloc.supplierName}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t pt-2 text-muted-foreground">
                        <span>
                          Allocated: <strong className="text-foreground">{formatSupplyNumber(alloc.allocatedQuantity)}</strong>
                        </span>
                        <span>
                          Received: <strong className="text-emerald-600 dark:text-emerald-400">{formatSupplyNumber(alloc.receivedQuantity)}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Pager Footer */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({totalItems} total records)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => updateFilter({ page: String(currentPage - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || loading}
              onClick={() => updateFilter({ page: String(currentPage + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {/* Plan Shipment Dialog */}
      <PlanShipmentDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        onSuccess={(created) => {
          setPlanOpen(false);
          setSuccess(`Inbound shipment ${created?.shipmentNumber ?? ''} created.`);
          if (created?.id) router.push(`/inbound-shipments/${created.id}`);
        }}
      />

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
    </main>
  );
}
