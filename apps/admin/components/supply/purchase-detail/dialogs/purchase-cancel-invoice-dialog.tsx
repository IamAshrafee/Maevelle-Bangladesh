'use client';

import { AlertCircle, Ban, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';

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
import { formatSupplyMoney } from '@/lib/supply/api';
import type { SupplierInvoice } from '../types';

export interface PurchaseCancelInvoiceDialogProps {
  readonly invoice?: SupplierInvoice | undefined;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirmCancel: (invoiceId: string, expectedVersion: number, reason: string) => void;
}

export function PurchaseCancelInvoiceDialog({
  invoice,
  busy,
  onClose,
  onConfirmCancel,
}: PurchaseCancelInvoiceDialogProps) {
  const [reason, setReason] = useState('');

  if (!invoice) return null;

  const isReasonValid = reason.trim().length >= 4;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoice || !isReasonValid) return;
    onConfirmCancel(invoice.id, invoice.version, reason.trim());
  }

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Ban className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Cancel Invoice {invoice.expense_number}</DialogTitle>
              <DialogDescription className="text-xs">
                Void this supplier bill in Finance. The action will be logged in the audit trail.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>Permanent Cancellation Notice</span>
            </div>
            <p className="text-muted-foreground">
              Cancelling will reverse this invoice's accounts payable liability of{' '}
              <strong className="text-foreground">
                {formatSupplyMoney(invoice.amount, invoice.currency_code)}
              </strong>
              . Invoices with recorded cash payments cannot be cancelled.
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="cancel-invoice-reason">Cancellation Reason</FieldLabel>
            <Textarea
              id="cancel-invoice-reason"
              name="reason"
              placeholder="Explain why this invoice is being cancelled (e.g. Duplicated entry, wrong supplier bill number, revised quotation)..."
              value={reason}
              required
              minLength={4}
              maxLength={1000}
              rows={3}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>
              A meaningful reason of at least 4 characters is required for the financial audit record.
            </FieldDescription>
          </Field>

          <DialogFooter className="pt-2">
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Keep invoice
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || !isReasonValid}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              <span>Confirm cancellation</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
