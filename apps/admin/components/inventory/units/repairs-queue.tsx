'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Wrench,
  Boxes,
  ShieldCheck,
  CheckCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  ExternalLink,
  Tag,
  ArrowRight,
  Printer,
} from 'lucide-react';
import type { InventoryUnitDto, WarehouseLocationDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/page-shell';
import { listInventoryUnits } from '@/lib/inventory/units';
import { fetchApiData } from '@/lib/api';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitRepairDialog } from './unit-repair-dialog';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitReleaseDialog } from './unit-release-dialog';
import { cn } from '@/lib/utils';

export function RepairsQueue() {
  const [units, setUnits] = useState<readonly InventoryUnitDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
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
      // Query units that have condition REPAIR_REQUIRED or status ON_HOLD
      const [repairRes, holdRes] = await Promise.all([
        listInventoryUnits({
          condition: 'REPAIR_REQUIRED',
          locationId: locationId || undefined,
          search: search.trim() || undefined,
          pageSize: 100,
        }),
        listInventoryUnits({
          status: 'ON_HOLD',
          locationId: locationId || undefined,
          search: search.trim() || undefined,
          pageSize: 100,
        }),
      ]);

      // Deduplicate by ID
      const map = new Map<string, InventoryUnitDto>();
      for (const u of repairRes.data) map.set(u.id, u);
      for (const u of holdRes.data) map.set(u.id, u);

      setUnits(Array.from(map.values()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repair queue units.');
    } finally {
      setLoading(false);
    }
  }, [locationId, search]);

  useEffect(() => {
    void loadRepairUnits();
  }, [loadRepairUnits]);

  return (
    <AdminPage>
      {/* Header */}
      <PageHeader>
        <div>
          <PageTitle className="flex items-center gap-2">
            <Wrench className="size-6 text-amber-500" />
            <span>Garment Repair & Tailoring Queue</span>
          </PageTitle>
          <PageDescription>
            Manage physical items set aside for seam sewing, zipper fixes, ironing, cleaning, or tailoring before quality reinspection.
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadRepairUnits()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            <span>Refresh</span>
          </Button>
        </PageActions>
      </PageHeader>

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
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs font-sans h-9"
              />
            </div>

            <NativeSelect
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
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
            <strong>{units.length}</strong> items awaiting or in repair
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
            <Table>
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
                        <p className="text-xs text-amber-900 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded inline-block max-w-[300px] truncate">
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
                          <Button
                            variant="default"
                            size="xs"
                            onClick={() => {
                              setSelectedUnit(unit);
                              setRepairMode(unit.activeRepair ? 'complete' : 'request');
                              setRepairOpen(true);
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white shadow-2xs gap-1"
                          >
                            <Wrench className="size-3" />
                            <span>{unit.activeRepair ? 'Complete' : 'Log Work'}</span>
                          </Button>

                          {/* Reinspect button */}
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setSelectedUnit(unit);
                              setInspectOpen(true);
                            }}
                            className="gap-1 text-blue-700 dark:text-blue-400"
                            title="Reinspect Unit"
                          >
                            <ShieldCheck className="size-3" />
                            <span>Reinspect</span>
                          </Button>

                          {/* Authorize Release button */}
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setSelectedUnit(unit);
                              setReleaseOpen(true);
                            }}
                            className="gap-1 text-emerald-700 dark:text-emerald-400"
                            title="Release for Sale"
                          >
                            <CheckCircle className="size-3" />
                            <span>Release</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </PageSection>

      {/* Sub-Dialogs */}
      {selectedUnit ? (
        <>
          <UnitRepairDialog
            open={repairOpen}
            onOpenChange={setRepairOpen}
            unit={selectedUnit}
            existingRepair={selectedUnit.activeRepair}
            mode={repairMode}
            onSuccess={() => void loadRepairUnits()}
          />

          <UnitInspectDialog
            open={inspectOpen}
            onOpenChange={setInspectOpen}
            unit={selectedUnit}
            defaultStage="REINSPECTION"
            onSuccess={() => void loadRepairUnits()}
          />

          <UnitReleaseDialog
            open={releaseOpen}
            onOpenChange={setReleaseOpen}
            unit={selectedUnit}
            onSuccess={() => void loadRepairUnits()}
          />
        </>
      ) : null}
    </AdminPage>
  );
}
