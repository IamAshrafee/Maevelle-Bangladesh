'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Boxes,
  ArrowLeft,
  Printer,
  ShieldCheck,
  Wrench,
  CheckCircle,
  Ban,
  Copy,
  Check,
  ExternalLink,
  Clock,
  RefreshCw,
  ShoppingBag,
  PackageCheck,
  Truck,
} from 'lucide-react';
import type {
  InventoryUnitDto,
  UnitInspectionDto,
  UnitRepairDto,
  UnitEventDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  AdminPage,
  PageHeader,
  PageActions,
  PageSection,
  ErrorState,
  LoadingState,
} from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';
import { useAdminCapability } from '@/components/admin-capabilities';
import {
  getInventoryUnit,
  getUnitInspections,
  getUnitRepairs,
  getUnitEvents,
  getUnitBarcodeSvgUrl,
} from '@/lib/inventory/units';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitBarcodeModal } from './unit-barcode-modal';
import { UnitMoveDialog } from './unit-move-dialog';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitRepairDialog } from './unit-repair-dialog';
import { UnitReleaseDialog } from './unit-release-dialog';
import { UnitWriteOffDialog } from './unit-write-off-dialog';
import { UnitEventTimeline } from './unit-event-timeline';
import { QualityWorkspaceTabs } from './quality-workspace-tabs';
import {
  recommendedInspectionStage,
  unitCanBeInspected,
  unitCanBeReleased,
  unitCanBeWrittenOff,
  unitCanCompleteRepair,
  unitCanEnterRepair,
  unitCanEnterTransfer,
} from './unit-action-policy';

export function UnitDetailView({ unitId }: { readonly unitId: string }) {
  const canManage = useAdminCapability('inventory.units.manage');
  const canTransfer = useAdminCapability('inventory.transfer');
  const canReleaseUnits = useAdminCapability('inventory.units.release');
  const canWriteOffUnits = useAdminCapability('inventory.units.write_off');

  const [unit, setUnit] = useState<InventoryUnitDto | null>(null);
  const [inspections, setInspections] = useState<readonly UnitInspectionDto[]>([]);
  const [repairs, setRepairs] = useState<readonly UnitRepairDto[]>([]);
  const [events, setEvents] = useState<readonly UnitEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);

  // Modals state
  const [printOpen, setPrintOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairMode, setRepairMode] = useState<'request' | 'complete'>('request');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const loadUnitData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, insp, rep, ev] = await Promise.all([
        getInventoryUnit(unitId),
        getUnitInspections(unitId),
        getUnitRepairs(unitId),
        getUnitEvents(unitId),
      ]);
      setUnit(u);
      setInspections(insp);
      setRepairs(rep);
      setEvents(ev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load physical unit details.');
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void loadUnitData();
  }, [loadUnitData]);

  const handleCopyCode = () => {
    if (!unit) return;
    void navigator.clipboard.writeText(unit.unitCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (loading) {
    return (
      <AdminPage>
        <LoadingState message="Loading physical unit details…" />
      </AdminPage>
    );
  }

  if (!unit) {
    return (
      <AdminPage>
        <ErrorState
          title="Physical unit unavailable"
          message={error || 'The physical unit was not found or is outside your authorized locations.'}
          onRetry={() => void loadUnitData()}
        />
        <div>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/inventory/units" />}
          >
            <ArrowLeft className="size-3.5 mr-1.5" /> Back to Units
          </Button>
        </div>
      </AdminPage>
    );
  }

  // Permitted actions based on operational status
  const canInspect = canManage && unitCanBeInspected(unit);
  const canMove = canTransfer && unitCanEnterTransfer(unit);
  const canRequestRepair = canManage && unitCanEnterRepair(unit);
  const canCompleteRepair = canManage && unitCanCompleteRepair(unit);
  const canRelease = canReleaseUnits && unitCanBeReleased(unit);
  const canWriteOff = canWriteOffUnits && unitCanBeWrittenOff(unit);

  return (
    <AdminPage>
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Physical Units', href: '/inventory/units' },
          { label: unit.unitCode, current: true },
        ]}
      />
      <QualityWorkspaceTabs />

      {/* Header */}
      <PageHeader>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {unit.unitCode}
            </h1>
            <button
              type="button"
              onClick={handleCopyCode}
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              title="Copy Unit Code"
            >
              {copiedCode ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
            <UnitConditionBadge condition={unit.currentCondition} />
            <UnitStatusBadge status={unit.status} />
          </div>

          <p className="text-sm text-muted-foreground">
            <Link
              href={`/products/${unit.productId}`}
              className="font-semibold text-foreground hover:underline"
            >
              {unit.productTitle}
            </Link>
            {' · '}
            <span className="font-mono">{unit.sku}</span>
            {unit.optionSummary ? ` · ${unit.optionSummary}` : ''}
          </p>
        </div>

        {/* Action Controls */}
        <PageActions className="flex-wrap gap-2">
          {canInspect ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInspectOpen(true)}
              className="gap-1.5"
            >
              <ShieldCheck className="size-3.5 text-info" />
              <span>Inspect</span>
            </Button>
          ) : null}

          {canMove ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoveOpen(true)}
              className="gap-1.5"
            >
              <Boxes className="size-3.5" />
              <span>Move Location</span>
            </Button>
          ) : null}

          {canRequestRepair ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRepairMode('request');
                setRepairOpen(true);
              }}
              className="gap-1.5"
            >
              <Wrench className="size-3.5" />
              <span>Send for Repair</span>
            </Button>
          ) : null}

          {canCompleteRepair ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setRepairMode('complete');
                setRepairOpen(true);
              }}
              className="gap-1.5"
            >
              <Wrench className="size-3.5" />
              <span>Complete Repair</span>
            </Button>
          ) : null}

          {canRelease ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => setReleaseOpen(true)}
              className="gap-1.5"
            >
              <CheckCircle className="size-3.5" />
              <span>Release for Sale</span>
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrintOpen(true)}
            className="gap-1.5"
          >
            <Printer className="size-3.5" />
            <span>Print Label</span>
          </Button>

          {canWriteOff ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWriteOffOpen(true)}
              className="gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <Ban className="size-3.5" />
              <span>Write Off</span>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      {/* Overview Cards Grid */}
      <PageSection>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Physical Identity & Barcode */}
          <Card className="rounded-xl shadow-2xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Physical Barcode</span>
                <span className="font-mono text-[10px] text-muted-foreground">Code 128</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-white p-3 rounded-lg border flex flex-col items-center justify-center">
                <img
                  src={getUnitBarcodeSvgUrl(unit.id)}
                  alt={`Barcode for ${unit.unitCode}`}
                  className="max-h-12 w-auto object-contain filter contrast-200"
                />
                <span className="font-mono text-xs font-bold text-black mt-1">
                  {unit.unitCode}
                </span>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Barcode Payload:</span>
                  <span className="font-mono font-medium">{unit.barcodePayload}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registered:</span>
                  <span className="font-mono">
                    {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                      new Date(unit.createdAt),
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Warehouse Location & Storage */}
          <Card className="rounded-xl shadow-2xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Current Storage Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-muted/40 rounded-lg border space-y-1">
                <span className="text-xs text-muted-foreground">Warehouse:</span>
                <p className="text-base font-semibold text-foreground">
                  {unit.locationName || unit.locationCode || 'Unassigned'}
                </p>
                <span className="text-xs font-mono text-muted-foreground block">
                  Code: {unit.locationCode || '—'}
                </span>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Packaging Ref:</span>
                  <span className="font-mono font-medium">
                    {unit.packageReference || 'None recorded'}
                  </span>
                </div>
                {unit.storageNotes ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Storage Notes:</span>
                    <span className="truncate max-w-[150px]">{unit.storageNotes}</span>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Inbound Source & Commercial Linkage */}
          <Card className="rounded-xl shadow-2xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Traceability References
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-muted/30 border">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <PackageCheck className="size-3.5" /> Source Receipt:
                  </span>
                  {unit.sourceReceiptId ? (
                    <Link
                      href={`/receiving/${unit.sourceReceiptId}`}
                      className="font-mono font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {unit.sourceReceiptNumber || 'View Receipt'}
                      <ExternalLink className="size-2.5" />
                    </Link>
                  ) : (
                    <span className="capitalize">{unit.sourceType.toLowerCase()}</span>
                  )}
                </div>

                {unit.currentFulfillmentId ? (
                  <div className="flex items-center justify-between p-2 rounded bg-muted/30 border">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Truck className="size-3.5" /> Fulfillment:
                    </span>
                    <Link
                      href={`/fulfillments?selected=${unit.currentFulfillmentId}`}
                      className="font-mono font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {unit.currentFulfillmentNumber || 'View Fulfillment'}
                      <ExternalLink className="size-2.5" />
                    </Link>
                  </div>
                ) : null}

                {unit.currentOrderId ? (
                  <div className="flex items-center justify-between p-2 rounded bg-muted/30 border">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ShoppingBag className="size-3.5" /> Order:
                    </span>
                    <Link
                      href={`/orders/${unit.currentOrderId}`}
                      className="font-mono font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {unit.currentOrderNumber || 'View Order'}
                      <ExternalLink className="size-2.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageSection>

      {/* QC & Repair History Section */}
      <PageSection>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Quality Control Inspections */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <span>Quality Control Inspections ({inspections.length})</span>
              </h3>
              {canInspect ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setInspectOpen(true)}
                  className="gap-1"
                >
                  <ShieldCheck className="size-3" /> New Inspection
                </Button>
              ) : null}
            </div>

            {inspections.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No inspection records logged yet. Item is currently {unit.status.replaceAll('_', ' ')}.
              </p>
            ) : (
              <div className="space-y-3">
                {inspections.map((insp) => (
                  <div key={insp.id} className="p-3 rounded-lg border bg-muted/20 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UnitConditionBadge condition={insp.conditionResult} short />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {insp.inspectionNumber}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {new Intl.DateTimeFormat('en-BD', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(insp.createdAt))}
                      </span>
                    </div>

                    {insp.defectDescription ? (
                      <p className="rounded border border-warning/30 bg-warning/10 p-2 text-xs text-foreground">
                        <strong>Defect:</strong> {insp.defectDescription}
                      </p>
                    ) : null}

                    {insp.notes ? (
                      <p className="text-[11px] text-muted-foreground italic">
                        Notes: {insp.notes}
                      </p>
                    ) : null}

                    <div className="flex items-center justify-between pt-1 border-t text-[11px] text-muted-foreground">
                      <span>Stage: {insp.inspectionStage.replaceAll('_', ' ')}</span>
                      <span>Outcome: {insp.inspectionOutcome.replaceAll('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Repair & Cleaning Records */}
          <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Wrench className="size-4 text-warning" />
                <span>Repair & Tailoring Records ({repairs.length})</span>
              </h3>
              {canRequestRepair ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setRepairMode('request');
                    setRepairOpen(true);
                  }}
                  className="gap-1"
                >
                  <Wrench className="size-3" /> Log Repair
                </Button>
              ) : null}
            </div>

            {repairs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No repairs recorded for this unit.
              </p>
            ) : (
              <div className="space-y-3">
                {repairs.map((rep) => (
                  <div key={rep.id} className="p-3 rounded-lg border bg-muted/20 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-foreground">
                        {rep.repairNumber}
                      </span>
                      <StatusBadge status={rep.repairStatus} />
                    </div>

                    <p className="text-xs text-foreground">
                      <strong>Defect:</strong> {rep.defectDescription}
                    </p>

                    {rep.actionPerformed ? (
                      <p className="text-xs text-foreground">
                        <strong>Work Done:</strong> {rep.actionPerformed}
                      </p>
                    ) : null}

                    <div className="flex items-center justify-between pt-1 border-t text-[11px] text-muted-foreground">
                      <span>Technician: {rep.technicianName || 'In-house tailoring'}</span>
                      {rep.costAmount ? (
                        <span className="font-mono font-semibold text-foreground">
                          Cost: ৳{rep.costAmount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageSection>

      {/* Lifecycle Timeline Section */}
      <PageSection>
        <div className="rounded-xl border bg-card p-6 shadow-2xs space-y-4">
          <div className="border-b pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <span>Chronological Traceability History</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Audited timeline of physical receptions, QC grades, movements, repairs, and allocations.
              </p>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => void loadUnitData()}
              className="gap-1"
            >
              <RefreshCw className="size-3" /> Refresh
            </Button>
          </div>

          <UnitEventTimeline events={events} />
        </div>
      </PageSection>

      {/* Modals & Dialogs */}
      <UnitBarcodeModal
        open={printOpen}
        onOpenChange={setPrintOpen}
        units={[unit]}
      />

      {canTransfer ? (
        <UnitMoveDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          units={[unit]}
          onSuccess={() => void loadUnitData()}
        />
      ) : null}

      {canManage ? (
        <UnitInspectDialog
          open={inspectOpen}
          onOpenChange={setInspectOpen}
          unit={unit}
          defaultStage={recommendedInspectionStage(unit)}
          onSuccess={() => void loadUnitData()}
        />
      ) : null}

      {canManage ? (
        <UnitRepairDialog
          open={repairOpen}
          onOpenChange={setRepairOpen}
          unit={unit}
          existingRepair={unit.activeRepair}
          mode={repairMode}
          onSuccess={() => void loadUnitData()}
        />
      ) : null}

      {canReleaseUnits ? (
        <UnitReleaseDialog
          open={releaseOpen}
          onOpenChange={setReleaseOpen}
          unit={unit}
          onSuccess={() => void loadUnitData()}
        />
      ) : null}

      {canWriteOffUnits ? (
        <UnitWriteOffDialog
          open={writeOffOpen}
          onOpenChange={setWriteOffOpen}
          unit={unit}
          onSuccess={() => void loadUnitData()}
        />
      ) : null}
    </AdminPage>
  );
}
