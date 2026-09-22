'use client';

import { AlertTriangle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DiscardRevisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worksheetNumber: string;
  revisionNumber: string;
  priorRevisionNumber: string;
  onConfirm: () => Promise<void>;
  busy?: boolean;
}

export function DiscardRevisionDialog({
  open,
  onOpenChange,
  worksheetNumber,
  revisionNumber,
  priorRevisionNumber,
  onConfirm,
  busy,
}: DiscardRevisionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Undo2 className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Discard Draft Revision #{revisionNumber}?
              </DialogTitle>
              <DialogDescription className="text-xs">
                Worksheet: <span className="font-mono font-medium text-foreground">{worksheetNumber}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3.5 space-y-2">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Unfinalized Draft Charges Will Be Deleted</p>
                <p className="text-muted-foreground leading-relaxed">
                  Discarding will delete any unfinalized cost components and adjustments added on Revision #{revisionNumber}.
                </p>
              </div>
            </div>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            The worksheet will cleanly revert to <strong>Finalized Revision #{priorRevisionNumber}</strong>.
            All previously finalized valuation layers, original components, and COGS calculations remain untouched and fully restored.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Keep Working
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={busy}
            className="gap-1.5 shadow-sm"
          >
            <Undo2 className="size-3.5" />
            <span>Discard & Revert to Rev #{priorRevisionNumber}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
