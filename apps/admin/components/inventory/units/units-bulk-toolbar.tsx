import { Boxes, Printer, ShieldCheck } from 'lucide-react';
import type { InventoryUnitDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { unitCanBeBulkPassed, unitCanEnterTransfer } from './unit-action-policy';

export function UnitsBulkToolbar({
  units,
  busy,
  canManage,
  canTransfer,
  onPrint,
  onTransfer,
  onPass,
  onClear,
}: {
  readonly units: readonly InventoryUnitDto[];
  readonly busy: boolean;
  readonly canManage: boolean;
  readonly canTransfer: boolean;
  readonly onPrint: () => void;
  readonly onTransfer: () => void;
  readonly onPass: () => void;
  readonly onClear: () => void;
}) {
  if (units.length === 0) return null;
  const transferBlocked = units.some((unit) => !unitCanEnterTransfer(unit));
  const passBlocked = units.some((unit) => !unitCanBeBulkPassed(unit));

  return (
    <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background/85 p-3 shadow-md ring-1 ring-border backdrop-blur-md">
      <p className="text-xs font-semibold text-foreground">
        <span className="font-mono tabular-nums">{units.length}</span>{' '}
        {units.length === 1 ? 'unit' : 'units'} selected on this page
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="secondary" onClick={onPrint}>
          <Printer aria-hidden="true" /> Print labels
        </Button>
        {canTransfer ? (
          <Button size="xs" variant="secondary" onClick={onTransfer} disabled={transferBlocked}>
            <Boxes aria-hidden="true" /> Transfer
          </Button>
        ) : null}
        {canManage ? (
          <Button size="xs" onClick={onPass} disabled={busy || passBlocked}>
            <ShieldCheck aria-hidden="true" /> Pass intake QC
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" onClick={onClear}>
          Deselect
        </Button>
      </div>
      {transferBlocked || passBlocked ? (
        <p className="w-full text-[11px] text-muted-foreground">
          Unavailable actions contain at least one unit whose current lifecycle state does not
          permit that command.
        </p>
      ) : null}
    </div>
  );
}
