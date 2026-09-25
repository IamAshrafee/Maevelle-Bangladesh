'use client';

import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { InboundReceiptDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

export interface ReceiptReverseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly receipt: InboundReceiptDto;
  readonly busy: boolean;
  readonly onConfirmReverse: (reason: string) => void;
}

export function ReceiptReverseDialog({
  open,
  onOpenChange,
  receipt,
  busy,
  onConfirmReverse,
}: ReceiptReverseDialogProps) {
  const [reason, setReason] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) return;
    onConfirmReverse(reason.trim());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            <DialogTitle>Reverse Receipt {receipt.receiptNumber}?</DialogTitle>
          </div>
          <DialogDescription>
            Reversing this receipt will automatically deduct the received stock from warehouse inventory,
            void provisional landed cost layers, and reopen the shipment receiving quantities. This action
            is recorded in ledger history and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="reverse-reason">Reason for Reversal</FieldLabel>
            <Textarea
              id="reverse-reason"
              name="reason"
              value={reason}
              required
              rows={3}
              placeholder="e.g. Physical count discrepancy, wrong shipment voucher posted, items rejected upon dock audit..."
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>
              Explain why this receipt is being reversed. This will be permanently recorded in the audit trail.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Keep receipt
            </DialogClose>
            <Button
              variant="destructive"
              type="submit"
              disabled={busy || !reason.trim()}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              <span>Confirm reversal</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
