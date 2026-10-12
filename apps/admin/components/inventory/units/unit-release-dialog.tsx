'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { InventoryUnitDto, UnitConditionDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { releaseUnitForSale } from '@/lib/inventory/units';

export interface UnitReleaseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly unit: InventoryUnitDto;
  readonly onSuccess?: () => void;
}

export function UnitReleaseDialog({
  open,
  onOpenChange,
  unit,
  onSuccess,
}: UnitReleaseDialogProps) {
  const [reason, setReason] = useState('');
  const [targetCondition, setTargetCondition] = useState<UnitConditionDto>(
    unit.currentCondition === 'GRADE_B' ? 'GRADE_B' : 'GRADE_A',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await releaseUnitForSale(unit.id, {
        expectedVersion: unit.version,
        reason: reason.trim() || undefined,
        targetCondition,
      });

      onOpenChange(false);
      setReason('');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Release authorization failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>Authorize Release for Sale — {unit.unitCode}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {unit.productTitle} · <span className="font-mono">{unit.sku}</span>
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="release-condition" className="text-xs font-medium text-foreground">
              Target Release Grade *
            </label>
            <NativeSelect
              id="release-condition"
              value={targetCondition}
              onChange={(e) => setTargetCondition(e.target.value as UnitConditionDto)}
              disabled={submitting}
              className="w-full text-xs"
              required
            >
              <option value="GRADE_A">Grade A — Prime Flawless Inventory</option>
              <option value="GRADE_B">Grade B — Approved Minor Imperfection / Restricted</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="release-reason" className="text-xs font-medium text-foreground">
              Authorization Note / Reason
            </label>
            <Input
              id="release-reason"
              type="text"
              placeholder="e.g. Passed formal QA supervisor inspection after repair"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              className="text-xs font-sans"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
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
              type="submit"
              variant="default"
              size="sm"
              disabled={submitting}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Releasing…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  <span>Release to Available Stock</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
