'use client';

import React, { useState, useEffect } from 'react';
import { RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import type { WarehouseLocationDto, UnitConditionDto, InventoryUnitDto } from '@maevelle/contracts';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { UnitScannerInput } from '@/components/inventory/units/unit-scanner-input';
import { UnitConditionBadge } from '@/components/inventory/units/unit-condition-badge';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
import { fetchApiData } from '@/lib/api';
import { lookupUnitByCode, receiveReturnedUnit } from '@/lib/inventory/units';

export interface ReturnUnitIntakeDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly returnId?: string;
  readonly returnNumber?: string;
  readonly onSuccess?: () => void;
}

export function ReturnUnitIntakeDialog({
  open,
  onOpenChange,
  returnId,
  returnNumber,
  onSuccess,
}: ReturnUnitIntakeDialogProps) {
  const [scannedUnit, setScannedUnit] = useState<InventoryUnitDto | null>(null);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [receivingLocationId, setReceivingLocationId] = useState<string>('');
  const [condition, setCondition] = useState<UnitConditionDto>('GRADE_A');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      void fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations')
        .then((locs) => {
          const active = (locs || []).filter((l) => l.status === 'ACTIVE');
          setLocations(active);
          const firstLoc = active[0];
          if (firstLoc && !receivingLocationId) {
            setReceivingLocationId(firstLoc.id);
          }
        })
        .catch(() => {});
    }
  }, [open, receivingLocationId]);

  const handleCodeScanned = async (code: string) => {
    setError(null);
    const lookup = await lookupUnitByCode(code);
    setScannedUnit(lookup.unit);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedUnit || !receivingLocationId) return;

    setSubmitting(true);
    setError(null);

    try {
      await receiveReturnedUnit(scannedUnit.id, {
        expectedVersion: scannedUnit.version,
        receivingLocationId,
        returnReceiptId: returnId,
        condition,
        notes: notes.trim() || undefined,
      });

      handleOpenChange(false);
      setScannedUnit(null);
      setNotes('');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to receive returned unit.');
    } finally {
      setSubmitting(false);
    }
  };

  const isDirty = Boolean(scannedUnit || notes.trim() !== '');

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    open,
    onOpenChange,
    isDirty,
    isSubmitting: submitting,
    title: 'Discard returned item intake?',
  });

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <RotateCcw className="size-4 text-primary" />
            <span>Receive &amp; Inspect Returned Item Unit</span>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            {returnNumber ? `Return Case #${returnNumber} · ` : ''}Scan physical barcode on returned
            item to verify unit identity and inspect condition.
          </p>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error ? (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Scanner Input */}
            <div className="bg-muted/30 p-3 rounded-xl border space-y-1.5">
              <span className="text-xs font-semibold text-foreground block">
                Scan Return Item Tag / Barcode:
              </span>
              <UnitScannerInput
                autoFocus
                onCodeScanned={handleCodeScanned}
                size="default"
                placeholder="Scan Code 128 barcode or enter MVU code…"
              />
            </div>

            {/* Scanned Unit Details */}
            {scannedUnit ? (
              <div className="rounded-xl border bg-card p-3.5 shadow-2xs space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="font-mono text-sm font-bold text-foreground">
                    {scannedUnit.unitCode}
                  </span>
                  <UnitConditionBadge condition={scannedUnit.currentCondition} short />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {scannedUnit.productTitle}
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    SKU: {scannedUnit.sku}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded border">
                  <span>Previous Outbound Fulfillment: </span>
                  <strong className="font-mono text-foreground">
                    {scannedUnit.currentFulfillmentNumber || 'Unrecorded'}
                  </strong>
                </div>
              </div>
            ) : null}

            {/* Receiving Location */}
            <div className="space-y-1.5">
              <label htmlFor="return-loc" className="text-xs font-medium text-foreground">
                Receiving Quarantine Location *
              </label>
              <NativeSelect
                id="return-loc"
                value={receivingLocationId}
                onChange={(e) => setReceivingLocationId(e.target.value)}
                disabled={submitting}
                className="text-xs w-full"
                required
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </NativeSelect>
            </div>

            {/* Return Condition Grading */}
            <div className="space-y-1.5">
              <label htmlFor="return-cond" className="text-xs font-medium text-foreground">
                Returned Condition Assessment *
              </label>
              <NativeSelect
                id="return-cond"
                value={condition}
                onChange={(e) => setCondition(e.target.value as UnitConditionDto)}
                disabled={submitting}
                className="text-xs w-full"
                required
              >
                <option value="GRADE_A">Grade A — Pristine / Unworn / Restockable</option>
                <option value="GRADE_B">Grade B — Packaging Opened / Minor Smudge</option>
                <option value="REPAIR_REQUIRED">
                  Repair Required — Loose Seam / Missing Button
                </option>
                <option value="DAMAGED_UNSELLABLE">Damaged / Stained / Unsellable</option>
              </NativeSelect>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="return-notes" className="text-xs font-medium text-foreground">
                Return Inspection Notes
              </label>
              <Textarea
                id="return-notes"
                placeholder="Inspection remarks, customer reason observation, or tailoring instructions…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                rows={2}
                className="text-xs resize-none"
              />
            </div>
          </div>

          <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={submitting || !scannedUnit || !receivingLocationId}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Processing Return…</span>
                </>
              ) : (
                <>
                  <RotateCcw className="size-3.5" />
                  <span>Receive & Quarantine Unit</span>
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
    {discardConfirmDialog}
  </>
  );
}
