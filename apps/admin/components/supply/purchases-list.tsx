'use client';

import { useEffect, useState, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  Filter,
  Package,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Ship,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  PurchaseDto,
  SupplierDto,
  SupplyOverviewDto,
} from '@maevelle/contracts';
import type { PagedEnvelope } from '@/lib/supply/types';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  formatSupplyDate,
  formatSupplyMoney,
  formatSupplyNumber,
  supplyRequest,
} from '@/lib/supply/api';
import { purchaseWorkflowStatus } from '@/lib/supply/status';
import { CreatePurchaseDialog } from './create-purchase-dialog';
import { PlanShipmentDialog } from './plan-shipment-dialog';

const STATUS_TABS = [
  { value: 'ALL', label: 'All Orders' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PLACED', label: 'Active (Placed)' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

export function PurchasesList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const canManageProcurement = useAdminCapability('procurement.manage');
  const canManageShipments = useAdminCapability('inbound_shipment.manage');

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const currentStatus = searchParams.get('status') ?? 'ALL';
  const currentSupplier = searchParams.get('supplier') ?? '';
  const currentCurrency = searchParams.get('currency') ?? '';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const PAGE_SIZE = 15;

  const [purchases, setPurchases] = useState<readonly PurchaseDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [overview, setOverview] = useState<SupplyOverviewDto>();
  const [suppliers, setSuppliers] = useState<readonly SupplierDto[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === 'purchase');
  const [planShipmentOpen, setPlanShipmentOpen] = useState(false);
  const [targetPurchaseIdForShipment, setTargetPurchaseIdForShipment] = useState<string>();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Fetch overview stats and active suppliers once
  useEffect(() => {
    supplyRequest<{ data: SupplyOverviewDto }>('/admin/supply/overview')
      .then((res) => setOverview(res.data))
      .catch(() => {});

    supplyRequest<{ data: readonly SupplierDto[] }>('/admin/suppliers?pageSize=100')
      .then((res) => setSuppliers(res.data))
      .catch(() => {});
  }, []);

  // Fetch paginated purchases on filter change
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(PAGE_SIZE));
    if (deferredQuery) params.set('q', deferredQuery);
    if (currentStatus !== 'ALL') params.set('status', currentStatus);
    if (currentSupplier) params.set('supplierId', currentSupplier);
    if (currentCurrency) params.set('currencyCode', currentCurrency);

    supplyRequest<PagedEnvelope<PurchaseDto>>(`/admin/purchases?${params.toString()}`)
      .then((res) => {
        if (!active) return;
        setPurchases(res.data ?? []);
        if (res.pagination) {
          setTotalItems(res.pagination.totalItems);
          setTotalPages(res.pagination.totalPages || 1);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load purchase orders.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentPage, deferredQuery, currentStatus, currentSupplier, currentCurrency]);

  function updateFilter(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || value === 'ALL') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    // Always reset to page 1 on filter/search change (unless changing page itself)
    if (!('page' in updates)) {
      next.set('page', '1');
    }
    router.replace(`/purchases?${next.toString()}`, { scroll: false });
  }

  function toggleExpandRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePlaceOrder(purchase: PurchaseDto) {
    if (!canManageProcurement) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await supplyRequest(`/admin/purchases/${purchase.id}/place`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: purchase.version }),
      });
      setSuccess(`Purchase order ${purchase.purchaseNumber} placed successfully.`);
      // Refresh list
      router.refresh();
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', String(PAGE_SIZE));
      if (deferredQuery) params.set('q', deferredQuery);
      if (currentStatus !== 'ALL') params.set('status', currentStatus);
      const res = await supplyRequest<PagedEnvelope<PurchaseDto>>(`/admin/purchases?${params.toString()}`);
      setPurchases(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place purchase order.');
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('pageSize', '500');
      if (deferredQuery) params.set('q', deferredQuery);
      if (currentStatus !== 'ALL') params.set('status', currentStatus);
      if (currentSupplier) params.set('supplierId', currentSupplier);
      if (currentCurrency) params.set('currencyCode', currentCurrency);

      const res = await supplyRequest<PagedEnvelope<PurchaseDto>>(`/admin/purchases?${params.toString()}`);
      const rows = res.data ?? [];

      const headers = [
        'Purchase Number',
        'Supplier Name',
        'Status',
        'Order Date',
        'Expected Date',
        'Destination',
        'Currency',
        'Total Amount',
        'Lines Count',
        'Units Ordered',
        'Units Allocated',
        'Units Received',
      ];

      const csvContent = [
        headers.join(','),
        ...rows.map((p: PurchaseDto) => {
          const ordered = p.lines.reduce((s: number, l) => s + Number(l.quantity), 0);
          const allocated = p.lines.reduce((s: number, l) => s + Number(l.allocatedQuantity), 0);
          const received = p.lines.reduce((s: number, l) => s + Number(l.receivedQuantity), 0);
          return [
            `"${p.purchaseNumber}"`,
            `"${p.supplierName.replaceAll('"', '""')}"`,
            `"${p.status}"`,
            `"${p.orderDate}"`,
            `"${p.expectedDate ?? ''}"`,
            `"${p.destinationLocationName ?? ''}"`,
            `"${p.currencyCode}"`,
            `"${p.totalAmount}"`,
            p.lines.length,
            ordered,
            allocated,
            received,
          ].join(',');
        }),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `purchases-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export CSV.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight">Purchase Orders</h1>
            <Badge variant="outline" className="font-mono text-xs">
              {totalItems} {totalItems === 1 ? 'record' : 'records'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage vendor purchase contracts, allocate ordered lines into freight shipments, and monitor delivery costs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exporting || loading}>
            <Download className="size-4" />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </Button>

          {canManageProcurement ? (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              <span>New Purchase Order</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Operational Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Draft POs</span>
            <span className="rounded-md bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-400">
              <FileText className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.draftPurchases ?? 0}</span>
            <span className="text-xs text-muted-foreground">Awaiting placement</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Orders</span>
            <span className="rounded-md bg-primary/10 p-1.5 text-primary">
              <PackageCheck className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.openPurchases ?? 0}</span>
            <span className="text-xs text-muted-foreground">Confirmed with vendors</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">In Transit</span>
            <span className="rounded-md bg-sky-500/10 p-1.5 text-sky-600 dark:text-sky-400">
              <Truck className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.inTransitShipments ?? 0}</span>
            <span className="text-xs text-muted-foreground">Shipments en route</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Awaiting Intake</span>
            <span className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
              <PackageOpen className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.awaitingReceiptShipments ?? 0}</span>
            <span className="text-xs text-muted-foreground">Ready for count</span>
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

      {/* Filter Tabs & Toolbar */}
      <div className="space-y-3">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
          {STATUS_TABS.map((tab) => {
            const isSelected = currentStatus === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => updateFilter({ status: tab.value === 'ALL' ? null : tab.value })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                updateFilter({ q: e.target.value.trim() || null });
              }}
              placeholder="Search by PO number, supplier, or note…"
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

          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={currentSupplier}
              onChange={(e) => updateFilter({ supplier: e.target.value || null })}
              size="sm"
              className="w-44"
            >
              <NativeSelectOption value="">All Suppliers</NativeSelectOption>
              {suppliers.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>

            <NativeSelect
              value={currentCurrency}
              onChange={(e) => updateFilter({ currency: e.target.value || null })}
              size="sm"
              className="w-32"
            >
              <NativeSelectOption value="">All Currencies</NativeSelectOption>
              <NativeSelectOption value="CNY">CNY</NativeSelectOption>
              <NativeSelectOption value="USD">USD</NativeSelectOption>
              <NativeSelectOption value="BDT">BDT</NativeSelectOption>
            </NativeSelect>

            {(query || currentStatus !== 'ALL' || currentSupplier || currentCurrency) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('');
                  updateFilter({ q: null, status: null, supplier: null, currency: null });
                }}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
                <span>Reset</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Order # & Status</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Warehouse / Date</TableHead>
              <TableHead>Fulfillment Progress</TableHead>
              <TableHead className="text-right">Order Value</TableHead>
              <TableHead className="w-12 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-44 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                    <span>Loading purchase orders…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : purchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Package className="size-8 text-muted-foreground/60" />
                    <p className="font-heading text-sm font-semibold">No purchase orders found</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {query || currentStatus !== 'ALL' || currentSupplier
                        ? 'Try clearing the search or status filters to find matching records.'
                        : 'Create your first purchase order to start procuring goods from vendors.'}
                    </p>
                    {canManageProcurement && !query && currentStatus === 'ALL' ? (
                      <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
                        <Plus className="size-4" />
                        <span>Create Purchase Order</span>
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              purchases.map((purchase) => {
                const isExpanded = expandedRows.has(purchase.id);
                const workflow = purchaseWorkflowStatus(purchase);
                const orderedUnits = purchase.lines.reduce((s, l) => s + Number(l.quantity), 0);
                const allocatedUnits = purchase.lines.reduce((s, l) => s + Number(l.allocatedQuantity), 0);
                const receivedUnits = purchase.lines.reduce((s, l) => s + Number(l.receivedQuantity), 0);
                const unallocatedUnits = Math.max(0, orderedUnits - allocatedUnits);

                return (
                  <TableRow key={purchase.id} className="group hover:bg-muted/40">
                    {/* Expand Chevron */}
                    <TableCell className="p-2 text-center">
                      {purchase.lines.length > 0 ? (
                        <button
                          onClick={() => toggleExpandRow(purchase.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Show line items"
                        >
                          <ChevronRight
                            className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        </button>
                      ) : null}
                    </TableCell>

                    {/* Order Number & Status */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/purchases/${purchase.id}`}
                            className="font-heading font-semibold text-primary hover:underline"
                          >
                            {purchase.purchaseNumber}
                          </Link>
                          {purchase.supplierReference ? (
                            <span className="font-mono text-xs text-muted-foreground" title="Supplier Reference">
                              ({purchase.supplierReference})
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={workflow} />
                        </div>
                      </div>
                    </TableCell>

                    {/* Supplier */}
                    <TableCell>
                      <div className="flex flex-col">
                        <Link
                          href={`/suppliers/${purchase.supplierId}`}
                          className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {purchase.supplierName}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          Ordered on {formatSupplyDate(purchase.orderDate)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Destination & Expected Date */}
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        <span className="font-medium text-foreground">
                          {purchase.destinationLocationName ?? 'Standard Warehouse'}
                        </span>
                        <span className="text-muted-foreground">
                          {purchase.expectedDate
                            ? `ETA: ${formatSupplyDate(purchase.expectedDate)}`
                            : 'No ETA set'}
                        </span>
                      </div>
                    </TableCell>

                    {/* Fulfillment Progress */}
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {purchase.lines.length} {purchase.lines.length === 1 ? 'line' : 'lines'} · {formatSupplyNumber(String(orderedUnits))} units
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatSupplyNumber(String(receivedUnits))}/{formatSupplyNumber(String(orderedUnits))} rcvd
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{
                              width: `${orderedUnits > 0 ? Math.min(100, (receivedUnits / orderedUnits) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    {/* Total Amount */}
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-heading font-semibold tabular-nums">
                          {formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {purchase.currencyCode}
                        </span>
                      </div>
                    </TableCell>

                    {/* Actions Dropdown */}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="xs" className="size-8 p-0" title="Order options">
                              <span className="sr-only">Open menu</span>
                              <Eye className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            render={<Link href={`/purchases/${purchase.id}`} className="w-full flex items-center gap-2" />}
                          >
                            <Eye className="size-4" />
                            <span>View Details</span>
                          </DropdownMenuItem>

                          {purchase.status === 'DRAFT' && canManageProcurement ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={busy || purchase.lines.length === 0}
                                onClick={() => void handlePlaceOrder(purchase)}
                                className="text-primary font-medium"
                              >
                                <Check className="size-4" />
                                <span>Place Order</span>
                              </DropdownMenuItem>
                            </>
                          ) : null}

                          {purchase.status === 'PLACED' && canManageShipments && unallocatedUnits > 0 ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setTargetPurchaseIdForShipment(purchase.id);
                                  setPlanShipmentOpen(true);
                                }}
                              >
                                <Ship className="size-4" />
                                <span>Plan Shipment</span>
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Expanded Rows Rendering */}
        {purchases
          .filter((p) => expandedRows.has(p.id))
          .map((purchase) => (
            <div key={`expanded-${purchase.id}`} className="border-t bg-muted/20 px-6 py-4">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Order Line Items ({purchase.lines.length})
                </span>
                <Link
                  href={`/purchases/${purchase.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Edit lines in purchase detail &rarr;
                </Link>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {purchase.lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex flex-col justify-between rounded-lg border bg-card p-3 text-xs shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/products/${line.productId}`}
                          className="font-medium text-foreground hover:text-primary hover:underline truncate"
                        >
                          {line.productTitle}
                        </Link>
                        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                          {line.sku}
                        </Badge>
                      </div>
                      {line.optionSummary ? (
                        <p className="mt-0.5 text-muted-foreground">{line.optionSummary}</p>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t pt-2 text-muted-foreground">
                      <span>
                        Ordered: <strong className="text-foreground">{formatSupplyNumber(line.quantity)}</strong>
                      </span>
                      <span>
                        Allocated: <strong className="text-foreground">{formatSupplyNumber(line.allocatedQuantity)}</strong>
                      </span>
                      <span>
                        Received: <strong className="text-emerald-600 dark:text-emerald-400">{formatSupplyNumber(line.receivedQuantity)}</strong>
                      </span>
                      <span className="font-mono text-foreground font-semibold">
                        {formatSupplyMoney(line.unitPrice, purchase.currencyCode)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {/* Pager Footer */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>
              Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({totalItems} total orders)
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
      </div>

      {/* Creation Modal */}
      <CreatePurchaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(created) => {
          setSuccess(`Purchase order ${created.purchaseNumber} created.`);
          router.push(`/purchases/${created.id}`);
        }}
      />

      {/* Plan Shipment Modal */}
      <PlanShipmentDialog
        open={planShipmentOpen}
        onOpenChange={setPlanShipmentOpen}
        defaultPurchaseId={targetPurchaseIdForShipment}
        onSuccess={(shipment) => {
          setPlanShipmentOpen(false);
          setSuccess(`Inbound shipment ${shipment?.shipmentNumber ?? ''} planned.`);
          if (shipment?.id) router.push(`/inbound-shipments/${shipment.id}`);
        }}
      />
    </main>
  );
}
