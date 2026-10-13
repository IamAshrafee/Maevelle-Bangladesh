import { AlertCircle, ImageIcon, ShieldCheck, Wrench } from 'lucide-react';
import type { UnitInspectionDto, UnitRepairDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { UnitConditionBadge } from './unit-condition-badge';

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function SectionWarning({ message }: { readonly message: string | undefined }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-foreground">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
      <p>{message} The current unit state remains available above.</p>
    </div>
  );
}

export interface UnitQualityHistoryProps {
  readonly inspections: readonly UnitInspectionDto[];
  readonly repairs: readonly UnitRepairDto[];
  readonly inspectionError: string | undefined;
  readonly repairError: string | undefined;
  readonly canInspect: boolean;
  readonly canRequestRepair: boolean;
  readonly currentStatus: string;
  readonly onInspect: () => void;
  readonly onRequestRepair: () => void;
}

export function UnitQualityHistory({
  inspections,
  repairs,
  inspectionError,
  repairError,
  canInspect,
  canRequestRepair,
  currentStatus,
  onInspect,
  onRequestRepair,
}: UnitQualityHistoryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 text-info" aria-hidden="true" />
            Quality inspections{' '}
            <span className="font-mono tabular-nums">({inspections.length})</span>
          </h2>
          {canInspect ? (
            <Button size="xs" variant="outline" onClick={onInspect} className="gap-1">
              <ShieldCheck className="size-3" aria-hidden="true" /> New inspection
            </Button>
          ) : null}
        </div>

        <SectionWarning message={inspectionError} />
        {!inspectionError && inspections.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No inspection evidence recorded. Current status: {currentStatus.replaceAll('_', ' ')}.
          </p>
        ) : (
          <div className="space-y-3">
            {inspections.map((inspection) => (
              <article
                key={inspection.id}
                className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <UnitConditionBadge condition={inspection.conditionResult} short />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {inspection.inspectionNumber}
                    </span>
                  </div>
                  <time className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatDate(inspection.createdAt)}
                  </time>
                </div>
                {inspection.defectDescription ? (
                  <p className="rounded border border-warning/30 bg-warning/10 p-2 text-foreground">
                    <strong>Defect:</strong> {inspection.defectDescription}
                  </p>
                ) : null}
                {inspection.notes ? (
                  <p className="text-muted-foreground">{inspection.notes}</p>
                ) : null}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-[11px]">
                  <dt className="text-muted-foreground">Stage</dt>
                  <dd className="text-right">{inspection.inspectionStage.replaceAll('_', ' ')}</dd>
                  <dt className="text-muted-foreground">Outcome</dt>
                  <dd className="text-right">
                    {inspection.inspectionOutcome.replaceAll('_', ' ')}
                  </dd>
                  <dt className="text-muted-foreground">Disposition</dt>
                  <dd className="text-right">
                    {inspection.disposition?.replaceAll('_', ' ') || 'No disposition'}
                  </dd>
                  <dt className="text-muted-foreground">Inspector</dt>
                  <dd className="text-right">{inspection.inspectorName || 'System actor'}</dd>
                </dl>
                {inspection.mediaAssetIds.length > 0 ? (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ImageIcon className="size-3" aria-hidden="true" />
                    <span className="font-mono tabular-nums">
                      {inspection.mediaAssetIds.length}
                    </span>
                    evidence photo{inspection.mediaAssetIds.length === 1 ? '' : 's'} attached
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wrench className="size-4 text-warning" aria-hidden="true" />
            Repair and tailoring <span className="font-mono tabular-nums">({repairs.length})</span>
          </h2>
          {canRequestRepair ? (
            <Button size="xs" variant="outline" onClick={onRequestRepair} className="gap-1">
              <Wrench className="size-3" aria-hidden="true" /> Send for repair
            </Button>
          ) : null}
        </div>

        <SectionWarning message={repairError} />
        {!repairError && repairs.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No repair work recorded for this unit.
          </p>
        ) : (
          <div className="space-y-3">
            {repairs.map((repair) => (
              <article
                key={repair.id}
                className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-foreground">
                    {repair.repairNumber}
                  </span>
                  <StatusBadge status={repair.repairStatus} />
                </div>
                <p>
                  <strong>Defect:</strong> {repair.defectDescription}
                </p>
                {repair.actionRequired ? (
                  <p>
                    <strong>Requested:</strong> {repair.actionRequired}
                  </p>
                ) : null}
                {repair.actionPerformed ? (
                  <p>
                    <strong>Work completed:</strong> {repair.actionPerformed}
                  </p>
                ) : null}
                {repair.notes ? <p className="text-muted-foreground">{repair.notes}</p> : null}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-[11px]">
                  <dt className="text-muted-foreground">Technician</dt>
                  <dd className="text-right">{repair.technicianName || 'In-house tailoring'}</dd>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {formatDate(repair.startedAt)}
                  </dd>
                  <dt className="text-muted-foreground">Completed</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {formatDate(repair.completedAt)}
                  </dd>
                  <dt className="text-muted-foreground">Cost</dt>
                  <dd className="text-right font-mono font-semibold tabular-nums">
                    {repair.costAmount
                      ? `${repair.costCurrency} ${repair.costAmount}`
                      : 'Not recorded'}
                  </dd>
                </dl>
                {repair.mediaAssetIds.length > 0 ? (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ImageIcon className="size-3" aria-hidden="true" />
                    <span className="font-mono tabular-nums">{repair.mediaAssetIds.length}</span>
                    evidence photo{repair.mediaAssetIds.length === 1 ? '' : 's'} attached
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
