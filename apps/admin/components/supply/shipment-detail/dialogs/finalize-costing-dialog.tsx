'use client';

import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSupplyMoney } from '@/lib/supply/api';
import type { FinalizeCostingDialogProps } from '../types';

export function FinalizeCostingDialog({
  open,
  onOpenChange,
  worksheet,
  onFinalize,
  saving,
}: FinalizeCostingDialogProps) {
  const additionalCostTotal =
    worksheet.results.reduce((sum, res) => sum + Number(res.additional_cost), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onFinalize();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle className="size-5 shrink-0 text-primary" />
            <DialogTitle>Finalize Landed Cost?</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            You are about to finalize Landed Cost Worksheet{' '}
            <strong className="text-foreground">{worksheet.worksheet_number}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recorded Components:</span>
              <span className="font-semibold text-foreground">{worksheet.components.length} components</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Additional Cost:</span>
              <span className="font-bold text-foreground font-mono">
                {formatSupplyMoney(String(additionalCostTotal), worksheet.base_currency_code)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <p>
              <strong>Important:</strong> Finalizing is an immutable action. It permanently updates
              the FIFO unit acquisition cost layers in the warehouse inventory ledger and fixes the
              balance sheet inventory valuation.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Keep in Draft
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>Finalize & Book to Stock</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
