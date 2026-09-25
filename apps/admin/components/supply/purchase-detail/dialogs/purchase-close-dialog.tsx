'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
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

export interface PurchaseCloseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly purchase: PurchaseDto;
  readonly busy: boolean;
  readonly onConfirmClose: (reason?: string) => void;
}

export function PurchaseCloseDialog({
  open,
  onOpenChange,
  purchase,
  busy,
  onConfirmClose,
}: PurchaseCloseDialogProps) {
  const [reason, setReason] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirmClose(reason.trim() || undefined);
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
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="size-5" />
            <DialogTitle>Close {purchase.purchaseNumber}?</DialogTitle>
          </div>
          <DialogDescription>
            This action will mark the purchase order as closed. All receiving operations for this
            order are deemed complete and no additional shipments can be allocated against it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="close-reason">Closing Remarks (Optional)</FieldLabel>
            <Textarea
              id="close-reason"
              name="reason"
              value={reason}
              rows={3}
              placeholder="e.g. All stock received and verified against physical packing slip..."
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>
              Optional operational remarks recorded for future audit and reporting.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Keep open
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>Confirm close</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
