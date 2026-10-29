'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Wrench, Boxes, ShieldCheck, CheckCircle, Search, Loader2 } from 'lucide-react';
import type { InventoryUnitDto, PaginationDto, WarehouseLocationDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
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
  ErrorState,
} from '@/components/ui/page-shell';
import { listInventoryUnits } from '@/lib/inventory/units';
import { fetchApiData } from '@/lib/api';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitRepairDialog } from './unit-repair-dialog';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitReleaseDialog } from './unit-release-dialog';
import { cn } from '@/lib/utils';
import { useAdminCapability } from '@/components/admin-capabilities';
import { QualityWorkspaceTabs } from './quality-workspace-tabs';
import {
  unitCanBeInspected,
  unitCanBeReleased,
  unitCanCompleteRepair,
  unitCanEnterRepair,
} from './unit-action-policy';

export function RepairsQueue() {
  const canManage = useAdminCapability('inventory.units.manage');
  const canRelease = useAdminCapability('inventory.units.release');
  const [units, setUnits] = useState<readonly InventoryUnitDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [pagination, setPagination] = useState<PaginationDto>({
    page: 1,
    pageSize,
    totalItems: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialogs state
  const [selectedUnit, setSelectedUnit] = useState<InventoryUnitDto | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairMode, setRepairMode] = useState<'request' | 'complete'>('complete');
  const [inspectOpen, setInspectOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  // Load locations
  useEffect(() => {
    void fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations')
      .then((locs) => {
        setLocations((locs || []).filter((l) => l.status === 'ACTIVE'));
      })
      .catch(() => {});
  }, []);

  const loadRepairUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listInventoryUnits({
        attention: 'REPAIR',
        locationId: locationId || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      });
      setUnits(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repair queue units.');
    } finally {
      setLoading(false);
    }
  }, [locationId, page, search]);

  useEffect(() => {
    void loadRepairUnits();
  }, [loadRepairUnits]);

  return (
    <AdminPage>
      {/* Header */}
      <PageHeader>
        <div>
          <PageTitle className="flex items-center gap-2">
            <Wrench className="size-6 text-warning" />
            <span>Garment Repair & Tailoring Queue</span>
          </PageTitle>
          <PageDescription>
            Manage physical items set aside for seam sewing, zipper fixes, ironing, cleaning, or
            tailoring before quality reinspection.
          </PageDescription>
        </div>

        <PageActions>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/inventory/units" />}
            className="gap-1.5"
          >
            <Boxes className="size-3.5" />
            <span>All Units</span>
          </Button>

          <RefreshButton
            loading={loading}
            onRefresh={() => void loadRepairUnits()}
            tooltip="Refresh repairs queue"
          />
        </PageActions>
      </PageHeader>
      <QualityWorkspaceTabs />
      {error ? <ErrorState message={error} onRetry={() => void loadRepairUnits()} /> : null}

      {/* Filter Bar */}
      <PageSection>
        <div className="rounded-xl border bg-card p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search Unit Code or SKU in repair queue…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 text-xs font-sans h-9"
              />
            </div>

            <NativeSelect
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setPage(1);
              }}
              className="text-xs h-9 min-w-[180px]"
            >
              <option value="">All Warehouses</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="text-xs font-medium text-muted-foreground">
            <strong className="font-mono tabular-nums">{pagination.totalItems}</strong> items
            awaiting or in repair
          </div>
        </div>
      </PageSection>

      {/* Table Section */}
      <PageSection>
        <div className="rounded-xl border bg-card shadow-2xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin mx-auto mb-2 text-primary" />
              Loading repair queue…
            </div>
          ) : units.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No garments in repair queue"
              description="No physical units currently require repair or tailoring. Flawless items are ready in available inventory."
            />
          ) : (
            <>
              <div className="grid gap-3 p-3 md:hidden">
                {units.map((unit) => {
                  const defect =
                    unit.activeRepair?.defectDescription ||
                    unit.latestInspection?.defectDescription ||
                    'Defect logged during QC';
                  return (
                    <article key={unit.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/inventory/units/${unit.id}`}
                            className="font-mono text-sm font-semibold tabular-nums hover:text-primary"
                          >
                            {unit.unitCode}
                          </Link>
                          <p className="mt-1 truncate text-sm font-medium">{unit.productTitle}</p>
                          <p className="font-mono text-xs text-muted-foreground">{unit.sku}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <UnitConditionBadge condition={unit.currentCondition} short />
                          <UnitStatusBadge status={unit.status} />
                        </div>
                      </div>
                      <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs">
                        {defect}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {unit.locationName || unit.locationCode || 'Unassigned'}
                      </p>
                      {canManage || canRelease ? (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {canManage &&
                          (unitCanCompleteRepair(unit) || unitCanEnterRepair(unit)) ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedUnit(unit);
                                setRepairMode(unit.activeRepair ? 'complete' : 'request');
                                setRepairOpen(true);
                              }}
                            >
                              <Wrench className="size-4" />
                              {unit.activeRepair ? 'Complete repair' : 'Log work'}
                            </Button>
                          ) : null}
                          {canManage && unitCanBeInspected(unit) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUnit(unit);
                                setInspectOpen(true);
                              }}
                            >
                              <ShieldCheck className="size-4" /> Reinspect
                            </Button>
                          ) : null}
                          {canRelease && unitCanBeReleased(unit) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="col-span-2"
                              onClick={() => {
                                setSelectedUnit(unit);
                                setReleaseOpen(true);
                              }}
                            >
                              <CheckCircle className="size-4" /> Release for sale
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              <div className="hidden md:block">
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Unit Code</TableHead>
                      <TableHead className="text-xs">Product / SKU</TableHead>
                      <TableHead className="text-xs">Defect Description</TableHead>
                      <TableHead className="text-xs">Storage Location</TableHead>
                      <TableHead className="text-xs">Condition / Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((unit) => {
                      const defect =
                        unit.activeRepair?.defectDescription ||
                        unit.latestInspection?.defectDescription ||
                        'Defect logged during QC';

                      return (
                        <TableRow key={unit.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-mono text-xs font-bold text-foreground">
                            <Link
                              href={`/inventory/units/${unit.id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {unit.unitCode}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs font-medium text-foreground truncate max-w-[220px]">
                              {unit.productTitle}
                            </p>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {unit.sku}
                            </span>
                          </TableCell>
                          <TableCell>
                            <p className="inline-block max-w-[300px] truncate rounded border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs text-foreground">
                              {defect}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-foreground">
                            {unit.locationName || unit.locationCode || 'Unassigned'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <UnitConditionBadge condition={unit.currentCondition} short />
                              <UnitStatusBadge status={unit.status} />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Log / Complete Repair button */}
                          {canManage &&
                          (unitCanCompleteRepair(unit) || unitCanEnterRepair(unit)) ? (
                                <Button
                                  variant="default"
                                  size="xs"
                                  onClick={() => {
                                    setSelectedUnit(unit);
                                    setRepairMode(unit.activeRepair ? 'complete' : 'request');
                                    setRepairOpen(true);
                                  }}
                                  className="gap-1 shadow-2xs"
                                >
                                  <Wrench className="size-3" />
                                  <span>{unit.activeRepair ? 'Complete' : 'Log Work'}</span>
                                </Button>
                              ) : null}

                              {/* Reinspect button */}
                          {canManage && unitCanBeInspected(unit) ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => {
                                    setSelectedUnit(unit);
                                    setInspectOpen(true);
                                  }}
                                  className="gap-1"
                                  title="Reinspect Unit"
                                >
                                  <ShieldCheck className="size-3" />
                                  <span>Reinspect</span>
                                </Button>
                              ) : null}

                              {/* Authorize Release button */}
                          {canRelease && unitCanBeReleased(unit) ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => {
                                    setSelectedUnit(unit);
                                    setReleaseOpen(true);
                                  }}
                                  className="gap-1"
                                  title="Release for Sale"
                                >
                                  <CheckCircle className="size-3" />
                                  <span>Release</span>
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
        {!loading && pagination.totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page <span className="font-mono tabular-nums">{pagination.page}</span> of{' '}
              <span className="font-mono tabular-nums">{pagination.totalPages}</span>
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </PageSection>

      {/* Sub-Dialogs */}
      {selectedUnit ? (
        <>
          {canManage ? (
            <UnitRepairDialog
              open={repairOpen}
              onOpenChange={setRepairOpen}
              unit={selectedUnit}
              existingRepair={selectedUnit.activeRepair}
              mode={repairMode}
              onSuccess={() => void loadRepairUnits()}
            />
          ) : null}

          {canManage ? (
            <UnitInspectDialog
              open={inspectOpen}
              onOpenChange={setInspectOpen}
              unit={selectedUnit}
              defaultStage="REINSPECTION"
              onSuccess={() => void loadRepairUnits()}
            />
          ) : null}

          {canRelease ? (
            <UnitReleaseDialog
              open={releaseOpen}
              onOpenChange={setReleaseOpen}
              unit={selectedUnit}
              onSuccess={() => void loadRepairUnits()}
            />
          ) : null}
        </>
      ) : null}
    </AdminPage>
  );
}
