'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boxes, ScanBarcode, Wrench } from 'lucide-react';
import type {
  InventoryUnitDto,
  PaginationDto,
  UnitConditionDto,
  UnitStatusDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { Button } from '@/components/ui/button';
import {
  AdminPage,
  PageActions,
  PageDescription,
  PageHeader,
  PageSection,
  PageTitle,
} from '@/components/ui/page-shell';
import { fetchApiData } from '@/lib/api';
import { bulkInspectUnits, listInventoryUnits } from '@/lib/inventory/units';
import { QualityWorkspaceTabs } from './quality-workspace-tabs';
import { recommendedInspectionStage } from './unit-action-policy';
import { UnitBarcodeModal } from './unit-barcode-modal';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitMoveDialog } from './unit-move-dialog';
import { UnitScanLookupDialog } from './unit-scan-lookup-dialog';
import { UnitsBulkToolbar } from './units-bulk-toolbar';
import { UnitsCollection } from './units-collection';
import { UnitsListFilters } from './units-list-filters';

const PAGE_SIZE = 25;

export function UnitsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManage = useAdminCapability('inventory.units.manage');
  const canTransfer = useAdminCapability('inventory.transfer');

  const [search, setSearch] = useState(searchParams.get('search') || searchParams.get('q') || '');
  const [contextSku, setContextSku] = useState(searchParams.get('sku') || '');
  const [status, setStatus] = useState<UnitStatusDto | ''>(
    (searchParams.get('status') as UnitStatusDto) || '',
  );
  const [condition, setCondition] = useState<UnitConditionDto | ''>(
    (searchParams.get('condition') as UnitConditionDto) || '',
  );
  const [locationId, setLocationId] = useState(searchParams.get('locationId') || '');
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page')) || 1));

  const [units, setUnits] = useState<readonly InventoryUnitDto[]>([]);
  const [pagination, setPagination] = useState<PaginationDto>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
  });
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [scanLookupOpen, setScanLookupOpen] = useState(false);
  const [singleTargetUnit, setSingleTargetUnit] = useState<InventoryUnitDto | null>(null);

  useEffect(() => {
    void fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations')
      .then((result) => setLocations(result.filter((location) => location.status === 'ACTIVE')))
      .catch(() => setLocations([]));
  }, []);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listInventoryUnits({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
        sku: contextSku || undefined,
        status: status || undefined,
        condition: condition || undefined,
        locationId: locationId || undefined,
      });
      if (page > result.pagination.totalPages) {
        setPage(result.pagination.totalPages);
        return;
      }
      setUnits(result.data);
      setPagination(result.pagination);
      setSelectedIds(new Set());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Physical units could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [condition, contextSku, locationId, page, search, status]);

  useEffect(() => {
    void fetchUnits();
  }, [fetchUnits]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (contextSku) params.set('sku', contextSku);
    if (status) params.set('status', status);
    if (condition) params.set('condition', condition);
    if (locationId) params.set('locationId', locationId);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    router.replace(`/inventory/units${query ? `?${query}` : ''}`, { scroll: false });
  }, [condition, contextSku, locationId, page, router, search, status]);

  const selectedUnits = useMemo(
    () => units.filter((unit) => selectedIds.has(unit.id)),
    [selectedIds, units],
  );

  const updateFilter = (update: () => void) => {
    update();
    setPage(1);
    setSelectedIds(new Set());
    setSingleTargetUnit(null);
  };

  const resetFilters = () => {
    setSearch('');
    setContextSku('');
    setStatus('');
    setCondition('');
    setLocationId('');
    setPage(1);
    setSelectedIds(new Set());
    setSingleTargetUnit(null);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(units.map((unit) => unit.id)) : new Set());
  };

  const handleToggleSelected = (unitId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const openSingleTarget = (unit: InventoryUnitDto, open: (value: boolean) => void) => {
    setSingleTargetUnit(unit);
    open(true);
  };

  const closeTargetModal = (open: boolean, setOpen: (value: boolean) => void) => {
    setOpen(open);
    if (!open) setSingleTargetUnit(null);
  };

  const handleBulkPass = async () => {
    if (selectedUnits.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await bulkInspectUnits({
        units: selectedUnits.map((unit) => ({ unitId: unit.id, expectedVersion: unit.version })),
        inspectionStage: 'INBOUND_INTAKE',
        conditionResult: 'GRADE_A',
        disposition: 'RELEASE_SELLABLE',
        notes: 'Bulk passed from the physical-unit intake queue.',
      });
      await fetchUnits();
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : 'Bulk inspection failed.');
    } finally {
      setBusy(false);
    }
  };

  const hasActiveFilters = Boolean(search || contextSku || status || condition || locationId);

  return (
    <AdminPage>
      <PageHeader>
        <div>
          <PageTitle className="flex items-center gap-2">
            <Boxes className="size-6 text-primary" aria-hidden="true" /> Physical units
          </PageTitle>
          <PageDescription>
            Find and operate exact serialized identities across quality, storage, repair, and
            custody.
          </PageDescription>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" onClick={() => setScanLookupOpen(true)}>
            <ScanBarcode className="text-primary" aria-hidden="true" /> Scan Unit ID
          </Button>
          <Button variant="secondary" size="sm" render={<Link href="/inventory/units/repairs" />}>
            <Wrench className="text-warning" aria-hidden="true" /> Repair queue
          </Button>
        </PageActions>
      </PageHeader>
      <QualityWorkspaceTabs />

      <PageSection>
        <UnitsListFilters
          search={search}
          contextSku={contextSku}
          status={status}
          condition={condition}
          locationId={locationId}
          locations={locations}
          shownCount={units.length}
          totalCount={pagination.totalItems}
          loading={loading}
          hasActiveFilters={hasActiveFilters}
          onSearchChange={(value) => updateFilter(() => setSearch(value))}
          onStatusChange={(value) => updateFilter(() => setStatus(value))}
          onConditionChange={(value) => updateFilter(() => setCondition(value))}
          onLocationChange={(value) => updateFilter(() => setLocationId(value))}
          onClearContextSku={() => updateFilter(() => setContextSku(''))}
          onReset={resetFilters}
          onRefresh={() => void fetchUnits()}
        />
      </PageSection>

      <UnitsBulkToolbar
        units={selectedUnits}
        busy={busy}
        canManage={canManage}
        canTransfer={canTransfer}
        onPrint={() => {
          setSingleTargetUnit(null);
          setBarcodeModalOpen(true);
        }}
        onTransfer={() => {
          setSingleTargetUnit(null);
          setMoveModalOpen(true);
        }}
        onPass={() => void handleBulkPass()}
        onClear={() => setSelectedIds(new Set())}
      />

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive"
        >
          <span>{error}</span>
          <Button variant="outline" size="xs" onClick={() => void fetchUnits()}>
            Retry
          </Button>
        </div>
      ) : null}

      <PageSection>
        <UnitsCollection
          units={units}
          pagination={pagination}
          page={page}
          selectedIds={selectedIds}
          loading={loading}
          hasActiveFilters={hasActiveFilters}
          canManage={canManage}
          canTransfer={canTransfer}
          onSelectAll={handleSelectAll}
          onToggleSelected={handleToggleSelected}
          onInspect={(unit) => openSingleTarget(unit, setInspectModalOpen)}
          onTransfer={(unit) => openSingleTarget(unit, setMoveModalOpen)}
          onPrint={(unit) => openSingleTarget(unit, setBarcodeModalOpen)}
          onPageChange={(nextPage) => {
            setSelectedIds(new Set());
            setSingleTargetUnit(null);
            setPage(nextPage);
          }}
          onResetFilters={resetFilters}
        />
      </PageSection>

      <UnitBarcodeModal
        open={barcodeModalOpen}
        onOpenChange={(open) => closeTargetModal(open, setBarcodeModalOpen)}
        units={singleTargetUnit ? [singleTargetUnit] : selectedUnits}
      />
      {canTransfer ? (
        <UnitMoveDialog
          open={moveModalOpen}
          onOpenChange={(open) => closeTargetModal(open, setMoveModalOpen)}
          units={singleTargetUnit ? [singleTargetUnit] : selectedUnits}
        />
      ) : null}
      {canManage && singleTargetUnit ? (
        <UnitInspectDialog
          open={inspectModalOpen}
          onOpenChange={(open) => closeTargetModal(open, setInspectModalOpen)}
          unit={singleTargetUnit}
          defaultStage={recommendedInspectionStage(singleTargetUnit)}
          onSuccess={() => void fetchUnits()}
        />
      ) : null}
      <UnitScanLookupDialog open={scanLookupOpen} onOpenChange={setScanLookupOpen} />
    </AdminPage>
  );
}
