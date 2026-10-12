'use client';

import Link from 'next/link';
import { ArrowRight, Boxes, ShieldCheck } from 'lucide-react';
import type { InventoryUnitDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface UnitMoveDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly units: readonly InventoryUnitDto[];
  readonly onSuccess?: () => void;
}

/** Routes identity-aware moves through the authoritative warehouse Transfer workflow. */
export function UnitMoveDialog({ open, onOpenChange, units }: UnitMoveDialogProps) {
  const firstUnit = units[0];
  const oneSource = units.every((unit) => unit.locationId === firstUnit?.locationId);
  const transferHref = oneSource && firstUnit
    ? `/inventory/transfers/new?sourceLocationId=${encodeURIComponent(firstUnit.locationId)}`
    : '/inventory/transfers/new';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Boxes className="size-4 text-primary" aria-hidden="true" />
            Transfer serialized units
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-info/25 bg-info/10 p-3 text-sm text-foreground">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-medium">Location changes use a warehouse transfer.</p>
                <p className="text-muted-foreground">
                  This keeps each Unit ID, aggregate quantity, condition, and inventory cost moving
                  together with dispatch and receipt evidence.
                </p>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-3 text-sm">
            <dt className="text-muted-foreground">Selected</dt>
            <dd className="text-right font-mono tabular-nums">
              {units.length} unit{units.length === 1 ? '' : 's'}
            </dd>
            <dt className="text-muted-foreground">Current location</dt>
            <dd className="text-right font-medium">
              {oneSource
                ? (firstUnit?.locationName || firstUnit?.locationCode || 'Unknown')
                : 'Multiple locations'}
            </dd>
          </dl>

          {!oneSource ? (
            <p className="text-xs text-warning">
              Create separate transfers for units held at different source locations.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            render={<Link href={transferHref} />}
            size="sm"
            className="gap-1.5"
            onClick={() => onOpenChange(false)}
          >
            Open transfer workflow
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
