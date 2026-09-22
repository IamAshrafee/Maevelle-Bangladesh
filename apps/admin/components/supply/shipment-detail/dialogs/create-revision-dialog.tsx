'use client';

import { AlertTriangle, ArrowRight, History, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CreateRevisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'ADJUSTMENT' | 'CREDIT';
  worksheetNumber: string;
  currentRevisionNumber: string;
  onConfirm: () => Promise<void>;
  busy?: boolean;
}

export function CreateRevisionDialog({
  open,
  onOpenChange,
  kind,
  worksheetNumber,
  currentRevisionNumber,
  onConfirm,
  busy,
}: CreateRevisionDialogProps) {
  const nextRevNumber = Number(currentRevisionNumber || '1') + 1;
  const isAdjustment = kind === 'ADJUSTMENT';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Create {isAdjustment ? 'Adjustment' : 'Credit'} Revision #{nextRevNumber}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Worksheet: <span className="font-mono font-medium text-foreground">{worksheetNumber}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  Revision #{currentRevisionNumber} Data Remains Completely Preserved
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Your existing finalized unit acquisition costs and inventory layer records are immutable.
                  Opening a revision will not erase or alter previously finalized numbers.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-foreground">
              What does an {isAdjustment ? 'Adjustment' : 'Credit'} Revision do?
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {isAdjustment
                ? 'Allows you to allocate delayed or supplemental logistics charges (e.g. late customs duty notices, demurrage, or secondary transport invoices) on top of the original valuation. When finalized, the net adjustment is distributed across remaining on-hand stock and recognized COGS.'
                : 'Allows you to record vendor freight refunds, customs rebates, or carrier credits against this shipment. When finalized, the credit is applied across remaining inventory and recognized COGS.'}
            </p>
          </div>

          <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-3 dark:border-amber-950/40 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <p className="leading-relaxed">
                You will be able to switch between Revision #{currentRevisionNumber} and Revision #{nextRevNumber} at any time.
                If you create this draft by mistake, you can discard it to return to Revision #{currentRevisionNumber}.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="gap-1.5 shadow-sm"
          >
            <span>Open Revision #{nextRevNumber}</span>
            <ArrowRight className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
