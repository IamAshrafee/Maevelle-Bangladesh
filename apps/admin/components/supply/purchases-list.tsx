'use client';

import { useEffect, useState, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  Download,
  FileText,
  Package,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import type { PurchaseDto, SupplierDto, SupplyOverviewDto } from '@maevelle/contracts';
import type { PagedEnvelope } from '@/lib/supply/types';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
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
import {
  formatSupplyDate,
  formatSupplyMoney,
  formatSupplyNumber,
  supplyRequest,
} from '@/lib/supply/api';
import { purchaseWorkflowStatus } from '@/lib/supply/status';
import { CreatePurchaseDialog } from './create-purchase-dialog';
import { SupplyWorkspaceNav } from './supply-workspace-nav';

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === 'purchase');
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

      const res = await supplyRequest<PagedEnvelope<PurchaseDto>>(
        `/admin/purchases?${params.toString()}`,
      );
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
      link.setAttribute(
        'download',
        `purchases-export-${new Date().toISOString().slice(0, 10)}.csv`,
      );
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
            Manage vendor purchase contracts, allocate ordered lines into freight shipments, and
            monitor delivery costs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton
            loading={loading}
            tooltip="Refresh purchase orders"
          />

          {canManageProcurement ? (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="h-11 gap-1.5 sm:h-8">
              <Plus aria-hidden="true" className="size-4" />
              <span>New Purchase</span>
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportCsv()}
            disabled={exporting || loading}
          >
            <Download aria-hidden="true" className="size-4" />
            <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
          </Button>
        </div>
      </div>

      <SupplyWorkspaceNav />

      {/* Operational Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Draft POs</span>
            <span className="rounded-md bg-warning/10 p-1.5 text-warning">
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
            <span className="rounded-md bg-info/10 p-1.5 text-info">
              <Truck className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">
              {overview?.inTransitShipments ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">Shipments en route</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Awaiting Intake</span>
            <span className="rounded-md bg-success/10 p-1.5 text-success">
              <PackageOpen className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">
              {overview?.awaitingReceiptShipments ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">Ready for count</span>
          </div>
        </Card>
      </div>

      {/* Notifications / Feedback */}
      {error ? (
        <OperationalFeedback tone="danger" onDismiss={() => setError(null)}>
          {error}
        </OperationalFeedback>
      ) : null}

      {success ? (
        <OperationalFeedback onDismiss={() => setSuccess(null)}>{success}</OperationalFeedback>
      ) : null}

      {/* Filter Tabs & Toolbar */}
      <div className="space-y-3">
        {/* Status Tabs */}
        <div
          role="tablist"
          aria-label="Purchase status"
          className="flex flex-wrap items-center gap-1.5 border-b pb-2"
        >
          {STATUS_TABS.map((tab) => {
            const isSelected = currentStatus === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => updateFilter({ status: tab.value === 'ALL' ? null : tab.value })}
                className={`min-h-11 touch-manipulation rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
              type="search"
              name="purchase-search"
              autoComplete="off"
              aria-label="Search purchase orders"
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
                type="button"
                aria-label="Clear purchase search"
                onClick={() => {
                  setQuery('');
                  updateFilter({ q: null });
                }}
                className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 touch-manipulation place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              name="purchase-supplier-filter"
              aria-label="Filter purchases by supplier"
              value={currentSupplier}
              onChange={(e) => updateFilter({ supplier: e.target.value || null })}
              size="sm"
              className="h-11 w-44 sm:h-8"
            >
              <NativeSelectOption value="">All Suppliers</NativeSelectOption>
              {suppliers.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>

            <NativeSelect
              name="purchase-currency-filter"
              aria-label="Filter purchases by currency"
              value={currentCurrency}
              onChange={(e) => updateFilter({ currency: e.target.value || null })}
              size="sm"
              className="h-11 w-32 sm:h-8"
            >
              <NativeSelectOption value="">All Currencies</NativeSelectOption>
              <NativeSelectOption value="CNY">CNY</NativeSelectOption>
              <NativeSelectOption value="USD">USD</NativeSelectOption>
              <NativeSelectOption value="BDT">BDT</NativeSelectOption>
            </NativeSelect>

            {query || currentStatus !== 'ALL' || currentSupplier || currentCurrency ? (
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

      <div className="grid gap-3 md:hidden">
        {loading ? (
          <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading purchase orders…
          </p>
        ) : null}
        {!loading && purchases.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <Package aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No Purchase Orders Found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear the filters or create a purchase for a supplier.
            </p>
          </div>
        ) : null}
        {!loading
          ? purchases.map((purchase) => {
              const workflow = purchaseWorkflowStatus(purchase);
              const ordered = purchase.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
              const received = purchase.lines.reduce(
                (sum, line) => sum + Number(line.receivedQuantity),
                0,
              );
              return (
                <article key={purchase.id} className="rounded-xl border bg-card p-4 shadow-2xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/purchases/${purchase.id}`}
                        className="block truncate font-mono font-semibold text-primary hover:underline"
                      >
                        {purchase.purchaseNumber}
                      </Link>
                      <Link
                        href={`/suppliers/${purchase.supplierId}`}
                        className="mt-1 block truncate text-sm font-medium hover:underline"
                      >
                        {purchase.supplierName}
                      </Link>
                    </div>
                    <StatusBadge status={workflow} />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    {purchase.lines.slice(0, 3).map((line) => (
                      <div
                        key={line.id}
                        className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted"
                        title={`${line.productTitle} · ${line.optionSummary ?? line.sku}`}
                      >
                        {line.primaryImageUrl ? (
                          <img
                            src={line.primaryImageUrl}
                            alt={`${line.productTitle} ${line.optionSummary ?? line.sku}`}
                            width={48}
                            height={48}
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package aria-hidden="true" className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <p>
                        {purchase.lines.length} variant line{purchase.lines.length === 1 ? '' : 's'}
                      </p>
                      <p className="font-mono tabular-nums">
                        {formatSupplyNumber(String(received))} /{' '}
                        {formatSupplyNumber(String(ordered))} units received
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3 border-t pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Purchase Value</p>
                      <p className="font-mono font-semibold tabular-nums">
                        {formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      render={<Link href={`/purchases/${purchase.id}`} />}
                      className="h-11"
                    >
                      Open Purchase
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                </article>
              );
            })
          : null}
      </div>

      {/* Main Table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
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
                      <Button
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                        className="mt-2 gap-1.5"
                      >
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
                const receivedUnits = purchase.lines.reduce(
                  (s, l) => s + Number(l.receivedQuantity),
                  0,
                );
                return (
                  <TableRow key={purchase.id} className="group hover:bg-muted/40">
                    {/* Expand Chevron */}
                    <TableCell className="p-2 text-center">
                      {purchase.lines.length > 0 ? (
                        <button
                          type="button"
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} line items for ${purchase.purchaseNumber}`}
                          aria-expanded={isExpanded}
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
                            <span
                              className="font-mono text-xs text-muted-foreground"
                              title="Supplier Reference"
                            >
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
                            {purchase.lines.length} {purchase.lines.length === 1 ? 'line' : 'lines'}{' '}
                            · {formatSupplyNumber(String(orderedUnits))} units
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatSupplyNumber(String(receivedUnits))}/
                            {formatSupplyNumber(String(orderedUnits))} rcvd
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-success transition-[width] duration-150"
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

                    {/* Mutations live in the purchase detail workspace. */}
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/purchases/${purchase.id}`} />}
                        className="gap-1.5 whitespace-nowrap"
                      >
                        <span>Open Purchase</span>
                        <ChevronRight aria-hidden="true" className="size-3.5" />
                      </Button>
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
                    className="flex gap-3 rounded-lg border bg-card p-3 text-xs shadow-xs"
                  >
                    <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                      {line.primaryImageUrl ? (
                        <img
                          src={line.primaryImageUrl}
                          alt={`${line.productTitle} ${line.optionSummary || line.sku}`}
                          width={96}
                          height={96}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Package className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
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

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-2 text-muted-foreground">
                      <span>
                        Ordered:{' '}
                        <strong className="text-foreground">
                          {formatSupplyNumber(line.quantity)}
                        </strong>
                      </span>
                      <span>
                        Allocated:{' '}
                        <strong className="text-foreground">
                          {formatSupplyNumber(line.allocatedQuantity)}
                        </strong>
                      </span>
                      <span>
                        Received:{' '}
                        <strong className="text-success">
                          {formatSupplyNumber(line.receivedQuantity)}
                        </strong>
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
              Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> (
              {totalItems} total orders)
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

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t pt-4 text-xs text-muted-foreground md:hidden">
          <span>
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> · {totalItems}{' '}
            purchases
          </span>
          <div className="grid grid-cols-2 gap-2">
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

      {/* Creation Modal */}
      <CreatePurchaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(created) => {
          setSuccess(`Purchase order ${created.purchaseNumber} created.`);
          router.push(`/purchases/${created.id}`);
        }}
      />
    </main>
  );
}
