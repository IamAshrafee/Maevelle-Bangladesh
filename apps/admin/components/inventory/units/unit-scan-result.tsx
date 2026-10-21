'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Boxes, Check, Copy, ExternalLink, Printer, ShieldCheck } from 'lucide-react';
import type { UnitBarcodeLookupDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { Button } from '@/components/ui/button';
import { lookupUnitByCode } from '@/lib/inventory/units';
import { cn } from '@/lib/utils';
import { UnitBarcodeModal } from './unit-barcode-modal';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitMoveDialog } from './unit-move-dialog';
import { UnitStatusBadge } from './unit-status-badge';
import {
  recommendedInspectionStage,
  unitCanBeInspected,
  unitCanEnterTransfer,
} from './unit-action-policy';

export function UnitScanResult({
  result,
  onResultChange,
  onNavigate,
  compact = false,
}: {
  readonly result: UnitBarcodeLookupDto;
  readonly onResultChange: (result: UnitBarcodeLookupDto) => void;
  readonly onNavigate?: () => void;
  readonly compact?: boolean;
}) {
  const canManage = useAdminCapability('inventory.units.manage');
  const canTransfer = useAdminCapability('inventory.transfer');
  const [copied, setCopied] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const unit = result.unit;

  const refresh = async () => {
    onResultChange(await lookupUnitByCode(unit.unitCode));
  };

  const copyCode = () => {
    void navigator.clipboard.writeText(unit.unitCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <article
        className={cn(
          'animate-in fade-in space-y-4 rounded-xl border border-border bg-card p-4 shadow-2xs duration-150',
          !compact && 'sm:p-5',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold tabular-nums text-foreground sm:text-lg">
                {unit.unitCode}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Copy unit code ${unit.unitCode}`}
              >
                {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              </button>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">{unit.productTitle}</p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {unit.sku}{unit.optionSummary ? ` · ${unit.optionSummary}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <UnitConditionBadge condition={unit.currentCondition} />
            <UnitStatusBadge status={unit.status} />
          </div>
        </div>

        <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Current location</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {unit.locationName || unit.locationCode || 'Unassigned'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source reference</dt>
            <dd className="mt-0.5 truncate font-mono tabular-nums text-foreground">
              {unit.sourceReceiptNumber || unit.sourceType.replaceAll('_', ' ')}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
          {canManage && unitCanBeInspected(unit) ? (
            <Button variant="outline" size="sm" onClick={() => setInspectOpen(true)}>
              <ShieldCheck className="size-3.5 text-info" /> Inspect
            </Button>
          ) : null}
          {canTransfer && unitCanEnterTransfer(unit) ? (
            <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
              <Boxes className="size-3.5" /> Transfer
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
            <Printer className="size-3.5" /> Label
          </Button>
          <Button
            size="sm"
            render={
              <Link
                href={`/inventory/units/${unit.id}`}
                {...(onNavigate ? { onClick: onNavigate } : {})}
              />
            }
          >
            Details <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </article>

      {canManage ? (
        <UnitInspectDialog
          open={inspectOpen}
          onOpenChange={setInspectOpen}
          unit={unit}
          defaultStage={recommendedInspectionStage(unit)}
          onSuccess={() => void refresh()}
        />
      ) : null}
      {canTransfer ? (
        <UnitMoveDialog open={moveOpen} onOpenChange={setMoveOpen} units={[unit]} />
      ) : null}
      <UnitBarcodeModal open={printOpen} onOpenChange={setPrintOpen} units={[unit]} />
    </>
  );
}
