'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Boxes,
  Search,
  Printer,
  ShieldCheck,
  Wrench,
  Copy,
  Check,
  ChevronRight,
  RefreshCw,
  Loader2,
  X,
  ScanBarcode,
} from 'lucide-react';
import type {
  InventoryUnitDto,
  UnitConditionDto,
  UnitStatusDto,
  WarehouseLocationDto,
  PaginationDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AdminPage,
  PageHeader,
  PageTitle,
  PageDescription,
  PageActions,
  PageSection,
  EmptyState,
} from '@/components/ui/page-shell';
import { listInventoryUnits, bulkInspectUnits } from '@/lib/inventory/units';
import { fetchApiData } from '@/lib/api';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitBarcodeModal } from './unit-barcode-modal';
import { UnitMoveDialog } from './unit-move-dialog';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitScanLookupDialog } from './unit-scan-lookup-dialog';
import { cn } from '@/lib/utils';
import { useAdminCapability } from '@/components/admin-capabilities';
import { QualityWorkspaceTabs } from './quality-workspace-tabs';
import {
  recommendedInspectionStage,
  unitCanBeBulkPassed,
  unitCanBeInspected,
  unitCanEnterTransfer,
} from './unit-action-policy';

export function UnitsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManage = useAdminCapability('inventory.units.manage');
  const canTransfer = useAdminCapability('inventory.transfer');

  // Query filters from URL or defaults
  const [search, setSearch] = useState(searchParams.get('search') || searchParams.get('q') || '');
  const [sku, setSku] = useState(searchParams.get('sku') || '');
  const [status, setStatus] = useState<UnitStatusDto | ''>(
    (searchParams.get('status') as UnitStatusDto) || '',
  );
  const [condition, setCondition] = useState<UnitConditionDto | ''>(
    (searchParams.get('condition') as UnitConditionDto) || '',
  );
  const [locationId, setLocationId] = useState(searchParams.get('locationId') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [pageSize] = useState(25);

  // Data state
  const [units, setUnits] = useState<readonly InventoryUnitDto[]>([]);
  const [pagination, setPagination] = useState<PaginationDto>({
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 1,
  });
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bulk actions & selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Modals state
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [scanLookupOpen, setScanLookupOpen] = useState(false);
  const [singleTargetUnit, setSingleTargetUnit] = useState<InventoryUnitDto | null>(null);

  // Load warehouse locations for filter dropdown
  useEffect(() => {
    void fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations')
      .then((locs) => {
        setLocations((locs || []).filter((l) => l.status === 'ACTIVE'));
      })
      .catch(() => {});
  }, []);

  // Fetch paginated units
  const fetchUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listInventoryUnits({
        page,
        pageSize,
        search: search.trim() || undefined,
        sku: sku.trim() || undefined,
        status: status || undefined,
        condition: condition || undefined,
        locationId: locationId || undefined,
      });
      setUnits(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch inventory units.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sku, status, condition, locationId]);

  useEffect(() => {
    void fetchUnits();
  }, [fetchUnits]);

  // Synchronize URL search params
  const updateQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (sku.trim()) params.set('sku', sku.trim());
    if (status) params.set('status', status);
    if (condition) params.set('condition', condition);
    if (locationId) params.set('locationId', locationId);
    if (page > 1) params.set('page', String(page));

    const qs = params.toString();
    router.replace(`/inventory/units${qs ? `?${qs}` : ''}`);
  }, [router, search, sku, status, condition, locationId, page]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(units.map((u) => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedUnits = useMemo(() => {
    return units.filter((u) => selectedIds.has(u.id));
  }, [units, selectedIds]);

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Bulk QC Pass
  const handleBulkPass = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      await bulkInspectUnits({
        units: selectedUnits.map((unit) => ({
          unitId: unit.id,
          expectedVersion: unit.version,
        })),
        conditionResult: 'GRADE_A',
        disposition: 'RELEASE_SELLABLE',
        notes: 'Bulk approved during inventory review.',
      });
      setSelectedIds(new Set());
      await fetchUnits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk inspection failed.');
    } finally {
      setBusy(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSku('');
    setStatus('');
    setCondition('');
    setLocationId('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(search || sku || status || condition || locationId);

  return (
    <AdminPage>
      {/* Header */}
      <PageHeader>
        <div>
          <PageTitle className="flex items-center gap-2">
            <Boxes className="size-6 text-primary" />
            <span>Individual Physical Units</span>
          </PageTitle>
          <PageDescription>
            Permanent serialized tracking for individual garments and accessories across quality
            control, storage locations, fulfillment, and repairs.
          </PageDescription>
        </div>

        <PageActions>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScanLookupOpen(true)}
            className="gap-1.5 shadow-2xs"
          >
            <ScanBarcode className="size-4 text-primary" />
            <span>Barcode Scanner</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            render={<Link href="/inventory/units/repairs" />}
            className="gap-1.5"
          >
            <Wrench className="size-3.5 text-amber-500" />
            <span>Repair Queue</span>
          </Button>
        </PageActions>
      </PageHeader>
      <QualityWorkspaceTabs />

      {/* Search & Filter Bar */}
      <PageSection>
        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-2">
              <label
                htmlFor="unit-search"
                className="text-[11px] font-medium text-muted-foreground block mb-1"
              >
                Search Unit Code / Barcode / Title
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="unit-search"
                  type="text"
                  placeholder="e.g. MVU-000101 or Floral Dress…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && updateQueryParams()}
                  className="pl-8 text-xs font-sans h-9"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label
                htmlFor="unit-status-filter"
                className="text-[11px] font-medium text-muted-foreground block mb-1"
              >
                Operational Status
              </label>
              <NativeSelect
                id="unit-status-filter"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as UnitStatusDto | '');
                  setPage(1);
                }}
                className="text-xs h-9 w-full"
              >
                <option value="">All Statuses</option>
                <option value="AWAITING_QC">Awaiting QC</option>
                <option value="AVAILABLE">Available for Sale</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="RESERVED">Reserved for Order</option>
                <option value="IN_FULFILLMENT">In Fulfillment</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="RETURNED">Returned</option>
                <option value="WRITTEN_OFF">Written Off</option>
              </NativeSelect>
            </div>

            {/* Condition Filter */}
            <div>
              <label
                htmlFor="unit-cond-filter"
                className="text-[11px] font-medium text-muted-foreground block mb-1"
              >
                QC Condition
              </label>
              <NativeSelect
                id="unit-cond-filter"
                value={condition}
                onChange={(e) => {
                  setCondition(e.target.value as UnitConditionDto | '');
                  setPage(1);
                }}
                className="text-xs h-9 w-full"
              >
                <option value="">All Conditions</option>
                <option value="GRADE_A">Grade A (Flawless)</option>
                <option value="GRADE_B">Grade B (Minor Defect)</option>
                <option value="REPAIR_REQUIRED">Repair Required</option>
                <option value="DAMAGED_UNSELLABLE">Damaged / Unsellable</option>
              </NativeSelect>
            </div>

            {/* Warehouse Location Filter */}
            <div>
              <label
                htmlFor="unit-loc-filter"
                className="text-[11px] font-medium text-muted-foreground block mb-1"
              >
                Warehouse Location
              </label>
              <NativeSelect
                id="unit-loc-filter"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  setPage(1);
                }}
                className="text-xs h-9 w-full"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {/* Quick Actions & Filter Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Showing <strong>{units.length}</strong> of{' '}
                <strong className="font-mono tabular-nums">{pagination.totalItems}</strong> units
              </span>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-primary hover:underline flex items-center gap-0.5 ml-2 font-medium"
                >
                  <X className="size-3" /> Reset Filters
                </button>
              ) : null}
            </div>

            <Button
              variant="outline"
              size="xs"
              onClick={() => void fetchUnits()}
              disabled={loading}
              className="gap-1"
            >
              <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </PageSection>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 ? (
        <div className="sticky top-16 z-20 bg-primary/95 text-primary-foreground backdrop-blur-md rounded-xl p-3 shadow-md flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs">
              {selectedIds.size} {selectedIds.size === 1 ? 'Unit' : 'Units'} Selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => setBarcodeModalOpen(true)}
              className="gap-1.5"
            >
              <Printer className="size-3" />
              <span>Print Labels</span>
            </Button>

            {canTransfer ? (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setMoveModalOpen(true)}
                  disabled={selectedUnits.some((unit) => !unitCanEnterTransfer(unit))}
                  className="gap-1.5"
                >
                  <Boxes className="size-3" />
                  <span>Move Location</span>
                </Button>
            ) : null}

            {canManage ? (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={handleBulkPass}
                  disabled={busy || selectedUnits.some((unit) => !unitCanBeBulkPassed(unit))}
                  className="gap-1.5"
                >
                  <ShieldCheck className="size-3" />
                  <span>Mark QC Passed</span>
                </Button>
            ) : null}

            <Button
              size="xs"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              Deselect
            </Button>
          </div>
        </div>
      ) : null}

      {/* Error state */}
      {error ? (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="xs" onClick={() => void fetchUnits()}>
            Retry
          </Button>
        </div>
      ) : null}

      {/* Main Units View: Desktop Table + Mobile Cards */}
      <PageSection>
        <div className="rounded-xl border bg-card shadow-2xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
              Loading physical units…
            </div>
          ) : units.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No physical units found"
              description={
                hasActiveFilters
                  ? 'No physical units match your filter criteria. Try adjusting search or status filters.'
                  : 'No individually tracked inventory units have been registered yet. Serialized units are created during Inbound Receiving or stock conversion.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop Table View (hidden on small mobile screens) */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 p-3">
                        <Checkbox
                          checked={units.length > 0 && selectedIds.size === units.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs">Unit Code</TableHead>
                      <TableHead className="text-xs">Product & Variant</TableHead>
                      <TableHead className="text-xs">Location</TableHead>
                      <TableHead className="text-xs">Condition</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Source / Ref</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((unit) => {
                      const isSelected = selectedIds.has(unit.id);

                      return (
                        <TableRow
                          key={unit.id}
                          className={cn(
                            'transition-colors',
                            isSelected && 'bg-primary/5 font-medium',
                          )}
                        >
                          <TableCell className="p-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleSelect(unit.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground">
                              <Link
                                href={`/inventory/units/${unit.id}`}
                                className="hover:text-primary hover:underline"
                              >
                                {unit.unitCode}
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(unit.unitCode)}
                                className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                                title="Copy Unit Code"
                              >
                                {copiedId === unit.unitCode ? (
                                  <Check className="size-2.5 text-emerald-600" />
                                ) : (
                                  <Copy className="size-2.5" />
                                )}
                              </button>
                            </div>
                            <span className="block font-mono text-[10px] text-muted-foreground">
                              {unit.sku}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/products/${unit.productId}`}
                              className="text-xs font-medium text-foreground hover:underline truncate max-w-[200px] block"
                            >
                              {unit.productTitle}
                            </Link>
                            {unit.optionSummary ? (
                              <span className="text-[11px] text-muted-foreground block truncate">
                                {unit.optionSummary}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-medium text-foreground block">
                              {unit.locationName || unit.locationCode || 'Unassigned'}
                            </span>
                            {unit.packageReference ? (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                Pack: {unit.packageReference}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <UnitConditionBadge condition={unit.currentCondition} short />
                          </TableCell>
                          <TableCell>
                            <UnitStatusBadge status={unit.status} />
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {unit.sourceReceiptNumber ? (
                              <Link
                                href={`/receiving/${unit.sourceReceiptId}`}
                                className="hover:text-primary hover:underline text-foreground"
                              >
                                {unit.sourceReceiptNumber}
                              </Link>
                            ) : (
                              unit.sourceType.replaceAll('_', ' ')
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canManage && unitCanBeInspected(unit) ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    setSingleTargetUnit(unit);
                                    setInspectModalOpen(true);
                                  }}
                                  title="Inspect Unit"
                                  className="size-7 p-0"
                                >
                                  <ShieldCheck className="size-3.5 text-info" />
                                </Button>
                              ) : null}

                              {canTransfer && unitCanEnterTransfer(unit) ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    setSingleTargetUnit(unit);
                                    setMoveModalOpen(true);
                                  }}
                                  title="Move Location"
                                  className="size-7 p-0"
                                >
                                  <Boxes className="size-3.5 text-muted-foreground" />
                                </Button>
                              ) : null}

                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setSingleTargetUnit(unit);
                                  setBarcodeModalOpen(true);
                                }}
                                title="Print Label"
                                className="size-7 p-0"
                              >
                                <Printer className="size-3.5 text-slate-600" />
                              </Button>

                              <Button
                                variant="outline"
                                size="xs"
                                render={<Link href={`/inventory/units/${unit.id}`} />}
                                className="h-6 px-2 text-[11px]"
                              >
                                Detail
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card List View (< md screens) */}
              <div className="md:hidden divide-y">
                {units.map((unit) => {
                  const isSelected = selectedIds.has(unit.id);

                  return (
                    <div
                      key={unit.id}
                      className={cn(
                        'p-3.5 space-y-2.5 transition-colors',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelect(unit.id)}
                          />
                          <div>
                            <div className="flex items-center gap-1 font-mono text-sm font-bold text-foreground">
                              <Link
                                href={`/inventory/units/${unit.id}`}
                                className="hover:text-primary hover:underline"
                              >
                                {unit.unitCode}
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(unit.unitCode)}
                                className="text-muted-foreground p-0.5 rounded"
                              >
                                {copiedId === unit.unitCode ? (
                                  <Check className="size-3 text-emerald-600" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </button>
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground block">
                              {unit.sku}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <UnitStatusBadge status={unit.status} />
                          <UnitConditionBadge condition={unit.currentCondition} short />
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-foreground">{unit.productTitle}</p>
                        {unit.optionSummary ? (
                          <span className="text-[11px] text-muted-foreground block">
                            {unit.optionSummary}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded border">
                        <span className="text-muted-foreground">Location:</span>
                        <span className="font-semibold text-foreground">
                          {unit.locationName || unit.locationCode || 'Unassigned'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1">
                          {canManage && unitCanBeInspected(unit) ? (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                setSingleTargetUnit(unit);
                                setInspectModalOpen(true);
                              }}
                            >
                              Inspect
                            </Button>
                          ) : null}
                          {canTransfer && unitCanEnterTransfer(unit) ? (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                setSingleTargetUnit(unit);
                                setMoveModalOpen(true);
                              }}
                            >
                              Move
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setSingleTargetUnit(unit);
                              setBarcodeModalOpen(true);
                            }}
                          >
                            Label
                          </Button>
                        </div>

                        <Button
                          variant="default"
                          size="xs"
                          render={<Link href={`/inventory/units/${unit.id}`} />}
                          className="gap-1"
                        >
                          <span>Open</span>
                          <ChevronRight className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Footer */}
              {pagination.totalPages > 1 ? (
                <div className="p-3 border-t bg-muted/20 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Page <strong>{pagination.page}</strong> of{' '}
                    <strong>{pagination.totalPages}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </PageSection>

      {/* Modals & Dialogs */}
      <UnitBarcodeModal
        open={barcodeModalOpen}
        onOpenChange={setBarcodeModalOpen}
        units={singleTargetUnit ? [singleTargetUnit] : selectedUnits}
      />

      {canTransfer ? (
        <UnitMoveDialog
          open={moveModalOpen}
          onOpenChange={setMoveModalOpen}
          units={singleTargetUnit ? [singleTargetUnit] : selectedUnits}
          onSuccess={() => {
            setSelectedIds(new Set());
            setSingleTargetUnit(null);
            void fetchUnits();
          }}
        />
      ) : null}

      {canManage && singleTargetUnit ? (
        <UnitInspectDialog
          open={inspectModalOpen}
          onOpenChange={setInspectModalOpen}
          unit={singleTargetUnit}
          defaultStage={recommendedInspectionStage(singleTargetUnit)}
          onSuccess={() => {
            setSingleTargetUnit(null);
            void fetchUnits();
          }}
        />
      ) : null}

      <UnitScanLookupDialog open={scanLookupOpen} onOpenChange={setScanLookupOpen} />
    </AdminPage>
  );
}
