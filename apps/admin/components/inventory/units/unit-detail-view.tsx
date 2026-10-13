'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Boxes,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Printer,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type {
  InventoryUnitDto,
  UnitEventDto,
  UnitInspectionDto,
  UnitRepairDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  AdminPage,
  ErrorState,
  LoadingState,
  PageActions,
  PageDescription,
  PageHeader,
  PageSection,
  PageTitle,
} from '@/components/ui/page-shell';
import {
  getInventoryUnit,
  getUnitEvents,
  getUnitInspections,
  getUnitRepairs,
} from '@/lib/inventory/units';
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
import { UnitBarcodeModal } from './unit-barcode-modal';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitEventTimeline } from './unit-event-timeline';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitMoveDialog } from './unit-move-dialog';
import { UnitOverviewPanels } from './unit-overview-panels';
import { UnitQualityHistory } from './unit-quality-history';
import { UnitReleaseDialog } from './unit-release-dialog';
import { UnitRepairDialog } from './unit-repair-dialog';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitWriteOffDialog } from './unit-write-off-dialog';

interface SectionErrors {
  readonly inspections: string | undefined;
  readonly repairs: string | undefined;
  readonly events: string | undefined;
}

const EMPTY_SECTION_ERRORS: SectionErrors = {
  inspections: undefined,
  repairs: undefined,
  events: undefined,
};

function rejectionMessage(result: PromiseSettledResult<unknown>, fallback: string) {
  if (result.status !== 'rejected') return undefined;
  return result.reason instanceof Error ? result.reason.message : fallback;
}

export function UnitDetailView({ unitId }: { readonly unitId: string }) {
  const canManage = useAdminCapability('inventory.units.manage');
  const canTransfer = useAdminCapability('inventory.transfer');
  const canReleaseUnits = useAdminCapability('inventory.units.release');
  const canWriteOffUnits = useAdminCapability('inventory.units.write_off');

  const [unit, setUnit] = useState<InventoryUnitDto | null>(null);
  const [inspections, setInspections] = useState<readonly UnitInspectionDto[]>([]);
  const [repairs, setRepairs] = useState<readonly UnitRepairDto[]>([]);
  const [events, setEvents] = useState<readonly UnitEventDto[]>([]);
  const [sectionErrors, setSectionErrors] = useState<SectionErrors>(EMPTY_SECTION_ERRORS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [printOpen, setPrintOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairMode, setRepairMode] = useState<'request' | 'complete'>('request');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const loadUnitData = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const currentUnit = await getInventoryUnit(unitId);
        setUnit(currentUnit);

        const [inspectionResult, repairResult, eventResult] = await Promise.allSettled([
          getUnitInspections(unitId),
          getUnitRepairs(unitId),
          getUnitEvents(unitId),
        ]);

        setInspections(inspectionResult.status === 'fulfilled' ? inspectionResult.value : []);
        setRepairs(repairResult.status === 'fulfilled' ? repairResult.value : []);
        setEvents(eventResult.status === 'fulfilled' ? eventResult.value : []);
        setSectionErrors({
          inspections: rejectionMessage(
            inspectionResult,
            'Inspection history could not be loaded.',
          ),
          repairs: rejectionMessage(repairResult, 'Repair history could not be loaded.'),
          events: rejectionMessage(eventResult, 'Lifecycle history could not be loaded.'),
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : 'Failed to load physical unit details.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [unitId],
  );

  useEffect(() => {
    setUnit(null);
    setInspections([]);
    setRepairs([]);
    setEvents([]);
    setSectionErrors(EMPTY_SECTION_ERRORS);
    void loadUnitData(true);
  }, [loadUnitData]);

  const handleCopyCode = async () => {
    if (!unit) return;
    await navigator.clipboard.writeText(unit.unitCode);
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 2000);
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
          message={
            error || 'The physical unit was not found or is outside your authorized locations.'
          }
          onRetry={() => void loadUnitData(true)}
        />
        <div>
          <Button variant="outline" size="sm" render={<Link href="/inventory/units" />}>
            <ArrowLeft className="mr-1.5 size-3.5" aria-hidden="true" /> Back to units
          </Button>
        </div>
      </AdminPage>
    );
  }

  const canInspect = canManage && unitCanBeInspected(unit);
  const canMove = canTransfer && unitCanEnterTransfer(unit);
  const canRequestRepair = canManage && unitCanEnterRepair(unit);
  const canCompleteRepair = canManage && unitCanCompleteRepair(unit);
  const canRelease = canReleaseUnits && unitCanBeReleased(unit);
  const canWriteOff = canWriteOffUnits && unitCanBeWrittenOff(unit);

  const openRepair = (mode: 'request' | 'complete') => {
    setRepairMode(mode);
    setRepairOpen(true);
  };

  return (
    <AdminPage>
      <Breadcrumb
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Quality', href: '/inventory/units' },
          { label: unit.unitCode, current: true },
        ]}
      />
      <QualityWorkspaceTabs />

      <PageHeader>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <PageTitle className="font-mono">{unit.unitCode}</PageTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => void handleCopyCode()}
              aria-label="Copy Unit ID"
            >
              {copiedCode ? (
                <Check className="size-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </Button>
            <UnitConditionBadge condition={unit.currentCondition} />
            <UnitStatusBadge status={unit.status} />
          </div>
          <PageDescription>
            <Link
              href={`/products/${unit.productId}`}
              className="font-semibold text-foreground hover:underline"
            >
              {unit.productTitle}
            </Link>
            {' · '}
            <span className="font-mono">{unit.sku}</span>
            {unit.optionSummary ? ` · ${unit.optionSummary}` : ''}
          </PageDescription>
        </div>

        <PageActions className="flex-wrap gap-2">
          {canInspect ? (
            <Button variant="outline" size="sm" onClick={() => setInspectOpen(true)}>
              <ShieldCheck className="text-info" aria-hidden="true" /> Inspect
            </Button>
          ) : null}
          {canMove ? (
            <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
              <Boxes aria-hidden="true" /> Transfer
            </Button>
          ) : null}
          {canRequestRepair ? (
            <Button variant="outline" size="sm" onClick={() => openRepair('request')}>
              <Wrench aria-hidden="true" /> Send for repair
            </Button>
          ) : null}
          {canCompleteRepair ? (
            <Button size="sm" onClick={() => openRepair('complete')}>
              <Wrench aria-hidden="true" /> Complete repair
            </Button>
          ) : null}
          {canRelease ? (
            <Button size="sm" onClick={() => setReleaseOpen(true)}>
              <CheckCircle aria-hidden="true" /> Release for sale
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
            <Printer aria-hidden="true" /> Print label
          </Button>
          {canWriteOff ? (
            <Button variant="destructive" size="sm" onClick={() => setWriteOffOpen(true)}>
              <Ban aria-hidden="true" /> Write off
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm">
          <p className="flex items-start gap-2 text-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            {error} The last loaded state is still shown.
          </p>
          <Button variant="outline" size="xs" onClick={() => void loadUnitData()}>
            Retry
          </Button>
        </div>
      ) : null}

      <PageSection>
        <UnitOverviewPanels unit={unit} />
      </PageSection>

      <PageSection>
        <UnitQualityHistory
          inspections={inspections}
          repairs={repairs}
          inspectionError={sectionErrors.inspections}
          repairError={sectionErrors.repairs}
          canInspect={canInspect}
          canRequestRepair={canRequestRepair}
          currentStatus={unit.status}
          onInspect={() => setInspectOpen(true)}
          onRequestRepair={() => openRepair('request')}
        />
      </PageSection>

      <PageSection>
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-2xs sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Clock className="size-4 text-primary" aria-hidden="true" /> Lifecycle evidence
              </h2>
              <p className="text-xs text-muted-foreground">
                Audited reception, inspection, movement, repair, allocation, and custody events.
              </p>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => void loadUnitData()}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          {sectionErrors.events ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-foreground">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <p>{sectionErrors.events} Use Refresh to retry this evidence feed.</p>
            </div>
          ) : (
            <UnitEventTimeline events={events} />
          )}
        </section>
      </PageSection>

      <UnitBarcodeModal open={printOpen} onOpenChange={setPrintOpen} units={[unit]} />

      {canTransfer ? (
        <UnitMoveDialog open={moveOpen} onOpenChange={setMoveOpen} units={[unit]} />
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
