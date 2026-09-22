'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { PurchaseDto } from '@maevelle/contracts';

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

export interface PurchaseCancelDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly purchase: PurchaseDto;
  readonly busy: boolean;
  readonly onConfirmCancel: (reason: string) => void;
}

export function PurchaseCancelDialog({
  open,
  onOpenChange,
  purchase,
  busy,
  onConfirmCancel,
}: PurchaseCancelDialogProps) {
  const [reason, setReason] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) return;
    onConfirmCancel(reason.trim());
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
            <DialogTitle>Cancel {purchase.purchaseNumber}?</DialogTitle>
          </div>
          <DialogDescription>
            This action will mark the purchase order as cancelled. The order will be preserved in
            history for audit compliance, but no shipments can be created.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="cancel-reason">Cancellation Reason</FieldLabel>
            <Textarea
              id="cancel-reason"
              name="reason"
              value={reason}
              required
              rows={3}
              placeholder="e.g. Supplier stock out, price renegotiation, duplicate order..."
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>
              Explain why this order is being cancelled. This will be recorded in audit notes.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Keep order
            </DialogClose>
            <Button
              variant="destructive"
              type="submit"
              disabled={busy || !reason.trim()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>Confirm cancellation</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
