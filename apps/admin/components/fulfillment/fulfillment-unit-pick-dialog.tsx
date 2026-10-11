'use client';

import React, { useState, useMemo } from 'react';
import {
  ScanBarcode,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  PackageCheck,
  X,
  Trash2,
} from 'lucide-react';
import type { FulfillmentDto, InventoryUnitDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UnitScannerInput } from '@/components/inventory/units/unit-scanner-input';
import { lookupUnitByCode, allocateUnitsToFulfillment } from '@/lib/inventory/units';
import { cn } from '@/lib/utils';

export interface FulfillmentUnitPickDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly fulfillment: FulfillmentDto;
  readonly onSuccess?: () => void;
}

interface PickedAllocation {
  readonly lineId: string;
  readonly lineSku: string;
  readonly lineProductTitle: string;
  readonly unit: InventoryUnitDto;
}

export function FulfillmentUnitPickDialog({
  open,
  onOpenChange,
  fulfillment,
  onSuccess,
}: FulfillmentUnitPickDialogProps) {
  const [allocations, setAllocations] = useState<readonly PickedAllocation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Verification requirements per line
  const lineRequirements = useMemo(() => {
    return fulfillment.lines.map((line) => {
      const requiredQty = Number(line.quantity) || 1;
      const allocatedCount = allocations.filter((a) => a.lineId === line.id).length;
      return {
        line,
        requiredQty,
        allocatedCount,
        isSatisfied: allocatedCount >= requiredQty,
      };
    });
  }, [fulfillment.lines, allocations]);

  const allLinesSatisfied = lineRequirements.every((r) => r.isSatisfied);

  // Scan handler
  const handleCodeScanned = async (code: string) => {
    setError(null);
    setSuccessMsg(null);

    // 1. Lookup unit from backend
    const lookup = await lookupUnitByCode(code);
    const unit = lookup.unit;

    // Check if already scanned in current session
    if (allocations.some((a) => a.unit.id === unit.id)) {
      throw new Error(`Unit ${unit.unitCode} is already scanned in this packing session.`);
    }

    // Check if unit is available or already allocated to this fulfillment
    if (unit.status !== 'AVAILABLE' && unit.currentFulfillmentId !== fulfillment.id) {
      throw new Error(
        `Unit ${unit.unitCode} is currently in status '${unit.status}' and cannot be picked for fulfillment.`,
      );
    }

    if (unit.currentCondition === 'DAMAGED_UNSELLABLE' || unit.currentCondition === 'REPAIR_REQUIRED') {
      throw new Error(
        `Unit ${unit.unitCode} has condition '${unit.currentCondition}' and cannot be fulfilled to customer.`,
      );
    }

    // 2. Find matching fulfillment line by SKU
    const matchingRequirement = lineRequirements.find(
      (r) => r.line.sku === unit.sku && !r.isSatisfied,
    );

    if (!matchingRequirement) {
      // Check if SKU exists on fulfillment but already fully picked
      const lineExists = fulfillment.lines.find((l) => l.sku === unit.sku);
      if (lineExists) {
        throw new Error(
          `Required quantity for SKU ${unit.sku} is already fully picked for this order.`,
        );
      } else {
        throw new Error(
          `Scanned unit ${unit.unitCode} (${unit.sku}) does not match any item on this fulfillment order.`,
        );
      }
    }

    // 3. Add to allocations
    const newAllocation: PickedAllocation = {
      lineId: matchingRequirement.line.id,
      lineSku: matchingRequirement.line.sku,
      lineProductTitle: matchingRequirement.line.productTitle,
      unit,
    };

    setAllocations((prev) => [...prev, newAllocation]);
    setSuccessMsg(`Verified & matched unit ${unit.unitCode} for ${unit.sku}`);
  };

  const handleRemoveAllocation = (unitId: string) => {
    setAllocations((prev) => prev.filter((a) => a.unit.id !== unitId));
  };

  // Submit confirmed allocations to backend
  const handleSubmitAllocations = async () => {
    if (allocations.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      await allocateUnitsToFulfillment({
        fulfillmentId: fulfillment.id,
        allocations: allocations.map((a) => ({
          fulfillmentLineId: a.lineId,
          unitId: a.unit.id,
        })),
      });

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save unit allocations.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <PackageCheck className="size-4 text-primary" />
            <span>Barcode Pick & Pack Verification — {fulfillment.fulfillmentNumber}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Scan physical garments before packing into shipping polybags to guarantee zero fulfillment errors.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Scanner Input */}
          <div className="bg-muted/30 p-3 rounded-xl border">
            <span className="text-xs font-semibold text-foreground block mb-1.5">
              Scan Barcode on Garment Tag:
            </span>
            <UnitScannerInput
              autoFocus
              continuous
              onCodeScanned={handleCodeScanned}
              size="default"
              placeholder="Scan Code 128 barcode or enter MVU Unit Code…"
            />
          </div>

          {/* Line Items Checklist */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-foreground block">
              Required Items on Fulfillment
            </span>
            <div className="space-y-2">
              {lineRequirements.map(({ line, requiredQty, allocatedCount, isSatisfied }) => (
                <div
                  key={line.id}
                  className={cn(
                    'p-3 rounded-lg border transition-colors flex items-center justify-between text-xs',
                    isSatisfied
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
                      : 'bg-card border-border',
                  )}
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">{line.productTitle}</p>
                    <span className="font-mono text-[11px] text-muted-foreground">{line.sku}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums font-bold text-sm">
                      {allocatedCount} / {requiredQty}
                    </span>
                    {isSatisfied ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                        <CheckCircle2 className="size-4" /> Picked
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Awaiting Scan
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scanned Units List */}
          {allocations.length > 0 ? (
            <div className="space-y-2 pt-2 border-t">
              <span className="text-xs font-semibold text-foreground block">
                Verified Physical Units ({allocations.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allocations.map((a) => (
                  <div
                    key={a.unit.id}
                    className="p-2.5 rounded-lg border bg-muted/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-foreground block">
                        {a.unit.unitCode}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[150px]">
                        {a.lineSku}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveAllocation(a.unit.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded"
                      title="Remove unit"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSubmitAllocations}
              disabled={submitting || allocations.length === 0}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Allocating…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  <span>
                    Confirm {allocations.length} Scanned {allocations.length === 1 ? 'Unit' : 'Units'}
                  </span>
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
