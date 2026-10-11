'use client';

import { useEffect, useState, useDeferredValue } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  Calendar,
  Download,
  Edit3,
  Eye,
  Mail,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  User,
  X,
} from 'lucide-react';
import type { SupplierDto, SupplierTypeDto, SupplyOverviewDto } from '@maevelle/contracts';
import type { PagedEnvelope } from '@/lib/supply/types';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
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
import { supplyRequest } from '@/lib/supply/api';
import { SupplierDialog } from './supplier-dialog';
import { CreatePurchaseDialog } from './create-purchase-dialog';
import { SupplyWorkspaceNav } from './supply-workspace-nav';

const STATUS_TABS = [
  { value: 'ALL', label: 'All Suppliers' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

const SUPPLIER_TYPES: { value: SupplierTypeDto | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'WHOLESALER', label: 'Wholesaler' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'AGENT', label: 'Sourcing Agent' },
  { value: 'LOCAL_VENDOR', label: 'Local Vendor' },
  { value: 'OTHER', label: 'Other' },
];

export function SuppliersList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const canManageProcurement = useAdminCapability('procurement.manage');

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const currentStatus = searchParams.get('status') ?? 'ALL';
  const currentType = searchParams.get('type') ?? 'ALL';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const PAGE_SIZE = 15;

  const [suppliers, setSuppliers] = useState<readonly SupplierDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [overview, setOverview] = useState<SupplyOverviewDto>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDto | undefined>();
  const [poSupplierId, setPoSupplierId] = useState<string | undefined>();
  const [createPoOpen, setCreatePoOpen] = useState(false);

  // Load overview stats once
  useEffect(() => {
    supplyRequest<{ data: SupplyOverviewDto }>('/admin/supply/overview')
      .then((res) => setOverview(res.data))
      .catch(() => {});
  }, []);

  // Fetch paginated suppliers
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(PAGE_SIZE));
    if (deferredQuery) params.set('q', deferredQuery);
    if (currentStatus !== 'ALL') params.set('status', currentStatus);
    if (currentType !== 'ALL') params.set('supplierType', currentType);

    supplyRequest<PagedEnvelope<SupplierDto>>(`/admin/suppliers?${params.toString()}`)
      .then((res) => {
        if (!active) return;
        setSuppliers(res.data ?? []);
        if (res.pagination) {
          setTotalItems(res.pagination.totalItems);
          setTotalPages(res.pagination.totalPages || 1);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load suppliers.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentPage, deferredQuery, currentStatus, currentType]);

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
    router.replace(`/suppliers?${next.toString()}`, { scroll: false });
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('pageSize', '500');
      if (deferredQuery) params.set('q', deferredQuery);
      if (currentStatus !== 'ALL') params.set('status', currentStatus);
      if (currentType !== 'ALL') params.set('supplierType', currentType);

      const res = await supplyRequest<PagedEnvelope<SupplierDto>>(
        `/admin/suppliers?${params.toString()}`,
      );
      const rows = res.data ?? [];

      const headers = [
        'Code',
        'Name',
        'Status',
        'Type',
        'Country',
        'Preferred Currency',
        'Lead Time Days',
        'Payment Terms',
        'Contact Person',
        'Email',
        'Phone',
        'Website',
      ];

      const csvContent = [
        headers.join(','),
        ...rows.map((s: SupplierDto) =>
          [
            `"${s.code}"`,
            `"${s.name.replaceAll('"', '""')}"`,
            `"${s.status}"`,
            `"${s.supplierType}"`,
            `"${s.countryCode ?? ''}"`,
            `"${s.preferredCurrencyCode ?? ''}"`,
            s.leadTimeDays ?? '',
            `"${(s.paymentTerms ?? '').replaceAll('"', '""')}"`,
            `"${(s.contactName ?? '').replaceAll('"', '""')}"`,
            `"${s.contactEmail ?? ''}"`,
            `"${s.contactPhone ?? ''}"`,
            `"${s.websiteUrl ?? ''}"`,
          ].join(','),
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `suppliers-export-${new Date().toISOString().slice(0, 10)}.csv`,
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
            <h1 className="font-heading text-2xl font-bold tracking-tight">Suppliers</h1>
            <Badge variant="outline" className="font-mono text-xs">
              {totalItems} {totalItems === 1 ? 'vendor' : 'vendors'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage factory and wholesaler commercial profiles, lead times, preferred currencies, and
            contact representatives.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageProcurement ? (
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="h-11 gap-1.5 sm:h-8"
            >
              <Plus aria-hidden="true" className="size-4" />
              <span>Add Supplier</span>
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
            <span className="text-xs font-medium text-muted-foreground">Active Vendors</span>
            <span className="rounded-md bg-primary/10 p-1.5 text-primary">
              <Building2 className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">
              {overview?.activeSuppliers ?? totalItems}
            </span>
            <span className="text-xs text-muted-foreground">Ready for orders</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Open POs</span>
            <span className="rounded-md bg-success/10 p-1.5 text-success">
              <Receipt className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.openPurchases ?? 0}</span>
            <span className="text-xs text-muted-foreground">Active orders placed</span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">In Transit</span>
            <span className="rounded-md bg-info/10 p-1.5 text-info">
              <Calendar className="size-4" />
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
            <span className="text-xs font-medium text-muted-foreground">Draft POs</span>
            <span className="rounded-md bg-warning/10 p-1.5 text-warning">
              <Building2 className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-2xl font-bold">{overview?.draftPurchases ?? 0}</span>
            <span className="text-xs text-muted-foreground">Awaiting placement</span>
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

      {/* Filters Toolbar */}
      <div className="space-y-3">
        {/* Status Tabs */}
        <div
          role="tablist"
          aria-label="Supplier status"
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

        {/* Search & Type Bar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="supplier-search"
              autoComplete="off"
              aria-label="Search suppliers"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                updateFilter({ q: e.target.value.trim() || null });
              }}
              placeholder="Search by vendor name, code, contact person, or email…"
              className="pl-9 text-sm"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear supplier search"
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
              name="supplier-type-filter"
              aria-label="Filter suppliers by type"
              value={currentType}
              onChange={(e) => updateFilter({ type: e.target.value || null })}
              size="sm"
              className="h-11 w-44 sm:h-8"
            >
              {SUPPLIER_TYPES.map((t) => (
                <NativeSelectOption key={t.value} value={t.value}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>

            {query || currentStatus !== 'ALL' || currentType !== 'ALL' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery('');
                  updateFilter({ q: null, status: null, type: null });
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
            Loading suppliers…
          </p>
        ) : null}
        {!loading && suppliers.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <Building2 aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No Suppliers Found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear the filters or add the first supplier profile.
            </p>
          </div>
        ) : null}
        {!loading
          ? suppliers.map((supplier) => (
              <article key={supplier.id} className="rounded-xl border bg-card p-4 shadow-2xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/suppliers/${supplier.id}`}
                      className="block truncate font-semibold text-primary hover:underline"
                    >
                      {supplier.name}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{supplier.code}</p>
                  </div>
                  <StatusBadge status={supplier.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="mt-0.5 font-medium">
                      {supplier.supplierType.replaceAll('_', ' ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Buying Currency</dt>
                    <dd className="mt-0.5 font-mono font-medium">
                      {supplier.preferredCurrencyCode ?? 'Not Set'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Lead Time</dt>
                    <dd className="mt-0.5 font-mono font-medium tabular-nums">
                      {supplier.leadTimeDays !== undefined
                        ? `${supplier.leadTimeDays} days`
                        : 'Not Set'}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd className="mt-0.5 truncate font-medium">
                      {supplier.contactName ?? supplier.contactPhone ?? 'Not Set'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {canManageProcurement && supplier.status === 'ACTIVE' ? (
                    <Button
                      size="sm"
                      className="h-11"
                      onClick={() => {
                        setPoSupplierId(supplier.id);
                        setCreatePoOpen(true);
                      }}
                    >
                      <Plus aria-hidden="true" className="size-4" /> New Purchase
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href={`/suppliers/${supplier.id}`} />}
                    className={`h-11 ${canManageProcurement && supplier.status === 'ACTIVE' ? '' : 'col-span-2'}`}
                  >
                    Open Profile
                  </Button>
                </div>
              </article>
            ))
          : null}
      </div>

      {/* Main Table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor & Code</TableHead>
              <TableHead>Type & Origin</TableHead>
              <TableHead>Terms & Lead Time</TableHead>
              <TableHead>Primary Contact</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-44 text-center text-sm text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                    <span>Loading suppliers…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Building2 className="size-8 text-muted-foreground/60" />
                    <p className="font-heading text-sm font-semibold">No suppliers found</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {query || currentStatus !== 'ALL' || currentType !== 'ALL'
                        ? 'Try clearing the search or status filters to find matching records.'
                        : 'Register your first vendor to start placing purchase orders.'}
                    </p>
                    {canManageProcurement && !query && currentStatus === 'ALL' ? (
                      <Button
                        size="sm"
                        onClick={() => setCreateDialogOpen(true)}
                        className="mt-2 gap-1.5"
                      >
                        <Plus className="size-4" />
                        <span>Add Supplier</span>
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier) => (
                <TableRow key={supplier.id} className="hover:bg-muted/40">
                  {/* Vendor & Code */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/suppliers/${supplier.id}`}
                          className="font-heading font-semibold text-primary hover:underline"
                        >
                          {supplier.name}
                        </Link>
                        <Badge variant="outline" className="font-mono text-xs">
                          {supplier.code}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <StatusBadge status={supplier.status} />
                      </div>
                    </div>
                  </TableCell>

                  {/* Type & Origin */}
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span className="font-medium text-foreground">
                        {supplier.supplierType.replaceAll('_', ' ')}
                      </span>
                      <span className="text-muted-foreground">
                        {supplier.countryCode
                          ? `Country: ${supplier.countryCode}`
                          : 'Country not set'}
                      </span>
                    </div>
                  </TableCell>

                  {/* Terms & Lead Time */}
                  <TableCell>
                    <div className="flex flex-col text-xs gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {supplier.preferredCurrencyCode ?? 'Any currency'}
                        </span>
                        {supplier.leadTimeDays !== undefined ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {supplier.leadTimeDays}d lead time
                          </span>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground truncate max-w-xs">
                        {supplier.paymentTerms || 'Terms not set'}
                      </span>
                    </div>
                  </TableCell>

                  {/* Contact */}
                  <TableCell>
                    <div className="flex flex-col text-xs gap-0.5">
                      {supplier.contactName ? (
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <User className="size-3 text-muted-foreground" />
                          <span>{supplier.contactName}</span>
                        </div>
                      ) : null}

                      {supplier.contactEmail ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="size-3" />
                          <a href={`mailto:${supplier.contactEmail}`} className="hover:underline">
                            {supplier.contactEmail}
                          </a>
                        </div>
                      ) : null}

                      {supplier.contactPhone ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="size-3" />
                          <a href={`tel:${supplier.contactPhone}`} className="hover:underline">
                            {supplier.contactPhone}
                          </a>
                        </div>
                      ) : null}

                      {!supplier.contactName && !supplier.contactEmail && !supplier.contactPhone ? (
                        <span className="text-muted-foreground italic">No contact details</span>
                      ) : null}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {canManageProcurement && supplier.status === 'ACTIVE' ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setPoSupplierId(supplier.id);
                            setCreatePoOpen(true);
                          }}
                          className="gap-1 text-xs"
                          title="Start purchase order with this supplier"
                        >
                          <Plus className="size-3" />
                          <span>New PO</span>
                        </Button>
                      ) : null}

                      {canManageProcurement ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setEditingSupplier(supplier)}
                          title="Edit supplier"
                        >
                          <Edit3 className="size-3.5" />
                        </Button>
                      ) : null}

                      <Button
                        variant="ghost"
                        size="xs"
                        render={<Link href={`/suppliers/${supplier.id}`} />}
                        title="View profile"
                      >
                        <Eye className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pager Footer */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>
              Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> (
              {totalItems} total suppliers)
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
            suppliers
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

      {/* Supplier Create/Edit Dialog */}
      <SupplierDialog
        open={createDialogOpen || Boolean(editingSupplier)}
        supplier={editingSupplier}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditingSupplier(undefined);
          }
        }}
        onSuccess={(saved) => {
          setSuccess(`Supplier ${saved.name} (${saved.code}) saved.`);
          setCreateDialogOpen(false);
          setEditingSupplier(undefined);
          router.refresh();
          // Reload current query
          const params = new URLSearchParams();
          params.set('page', String(currentPage));
          params.set('pageSize', String(PAGE_SIZE));
          supplyRequest<PagedEnvelope<SupplierDto>>(`/admin/suppliers?${params.toString()}`).then(
            (res) => setSuppliers(res.data ?? []),
          );
        }}
      />

      {/* New Purchase Order from Supplier */}
      <CreatePurchaseDialog
        open={createPoOpen}
        onOpenChange={setCreatePoOpen}
        defaultSupplierId={poSupplierId}
        onSuccess={(created) => {
          setCreatePoOpen(false);
          setSuccess(`Purchase order ${created.purchaseNumber} created.`);
          router.push(`/purchases/${created.id}`);
        }}
      />
    </main>
  );
}
