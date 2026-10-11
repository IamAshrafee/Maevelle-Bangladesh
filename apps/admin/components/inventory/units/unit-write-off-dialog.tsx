'use client';

import React, { useState } from 'react';
import { Ban, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';
import type { InventoryUnitDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { writeOffUnit } from '@/lib/inventory/units';

export interface UnitWriteOffDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly unit: InventoryUnitDto;
  readonly onSuccess?: () => void;
}

export function UnitWriteOffDialog({
  open,
  onOpenChange,
  unit,
  onSuccess,
}: UnitWriteOffDialogProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      await writeOffUnit(unit.id, {
        reason: reason.trim(),
      });

      onOpenChange(false);
      setReason('');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Write-off authorization failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-destructive/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
            <Ban className="size-4" />
            <span>Authorize Write-Off — {unit.unitCode}</span>
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

          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs text-destructive space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Permanent Operational Adjustment</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Writing off unit <strong className="font-mono text-foreground">{unit.unitCode}</strong> marks it as permanently destroyed or lost, and automatically posts an inventory loss decrement to the financial and stock ledgers.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="write-off-reason" className="text-xs font-medium text-foreground">
              Mandatory Justification / Loss Reason *
            </label>
            <Input
              id="write-off-reason"
              type="text"
              placeholder="e.g. Unrecoverable fabric dye bleeding, severe tears beyond repair"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              required
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
              variant="destructive"
              size="sm"
              disabled={submitting || !reason.trim()}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Writing Off…</span>
                </>
              ) : (
                <>
                  <Ban className="size-3.5" />
                  <span>Confirm Write-Off</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
