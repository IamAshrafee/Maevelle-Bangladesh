'use client';

import { DollarSign, FileEdit, HelpCircle, Loader2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSupplyMoney } from '@/lib/supply/api';
import type { SupplierInvoice } from '../types';

export interface PurchaseAdjustInvoiceDialogProps {
  readonly invoice?: SupplierInvoice | undefined;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onAdjustInvoice: (data: {
    invoiceId: string;
    expectedVersion: number;
    adjustmentType: 'CREDIT' | 'CORRECTION' | 'REVERSAL';
    amount: string;
    reason: string;
  }) => void;
}

export function PurchaseAdjustInvoiceDialog({
  invoice,
  busy,
  onClose,
  onAdjustInvoice,
}: PurchaseAdjustInvoiceDialogProps) {
  const [adjustmentType, setAdjustmentType] = useState<'CREDIT' | 'CORRECTION' | 'REVERSAL'>('CREDIT');
  const [rawAmount, setRawAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (invoice) {
      setAdjustmentType('CREDIT');
      setRawAmount('');
      setReason('');
    }
  }, [invoice]);

  if (!invoice) return null;

  // For CREDIT and REVERSAL, backend expects negative amounts.
  // We allow operators to enter normal positive numbers and automatically negate for them.
  const numericInput = Math.abs(Number(rawAmount || 0));
  const finalAmountString =
    adjustmentType === 'CORRECTION'
      ? rawAmount.trim()
      : numericInput > 0
        ? `-${numericInput}`
        : '';

  const isReasonValid = reason.trim().length >= 4;
  const isAmountValid = numericInput > 0 && !isNaN(numericInput);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoice || !isAmountValid || !isReasonValid) return;

    onAdjustInvoice({
      invoiceId: invoice.id,
      expectedVersion: invoice.version,
      adjustmentType,
      amount: finalAmountString,
      reason: reason.trim(),
    });
  }

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <FileEdit className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Record Adjustment for {invoice.expense_number}</DialogTitle>
              <DialogDescription className="text-xs">
                Keep the original supplier bill intact while recording a traceable credit note or correction.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Summary */}
          <div className="rounded-xl border bg-muted/40 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground truncate max-w-[240px]">
                {invoice.description}
              </span>
              <Badge variant="outline" className="font-mono text-[10px]">
                Due: {formatSupplyMoney(invoice.outstanding, invoice.currency_code)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Original Total: {formatSupplyMoney(invoice.amount, invoice.currency_code)} · Previously Adjusted:{' '}
              {formatSupplyMoney(invoice.adjustments, invoice.currency_code)}
            </p>
          </div>

          {/* Adjustment Type */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="adjust-type">Adjustment Classification</FieldLabel>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex cursor-help text-muted-foreground" />}>
                  <HelpCircle className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Credit Notes reduce the balance due (e.g. damaged goods rebate). Corrections adjust billing errors.
                </TooltipContent>
              </Tooltip>
            </div>
            <NativeSelect
              id="adjust-type"
              name="adjustmentType"
              value={adjustmentType}
              required
              disabled={busy}
              className="w-full"
              onChange={(e) => setAdjustmentType(e.target.value as typeof adjustmentType)}
            >
              <NativeSelectOption value="CREDIT">
                Credit Note / Supplier Rebate (Reduces invoice balance)
              </NativeSelectOption>
              <NativeSelectOption value="CORRECTION">
                Billing Correction (Adjust up or down)
              </NativeSelectOption>
              <NativeSelectOption value="REVERSAL">
                Adjustment Reversal (Cancels prior adjustment)
              </NativeSelectOption>
            </NativeSelect>
          </Field>

          {/* Adjustment Amount */}
          <Field>
            <FieldLabel htmlFor="adjust-amount">
              Adjustment Amount ({invoice.currency_code})
            </FieldLabel>
            <Input
              id="adjust-amount"
              name="amount"
              type="number"
              step="any"
              placeholder={adjustmentType === 'CORRECTION' ? 'e.g. -500 or 500' : 'e.g. 500'}
              value={rawAmount}
              required
              disabled={busy}
              onChange={(e) => setRawAmount(e.target.value)}
            />
            <FieldDescription>
              {adjustmentType === 'CREDIT' ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {numericInput > 0
                    ? `Will reduce payable balance by ${formatSupplyMoney(String(numericInput), invoice.currency_code)}.`
                    : 'Enter the credit note value. It will be recorded as a balance reduction.'}
                </span>
              ) : adjustmentType === 'REVERSAL' ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Will record a negative adjustment reversal.
                </span>
              ) : (
                'Use a negative number to reduce payable, or positive number to increase.'
              )}
            </FieldDescription>
          </Field>

          {/* Reason */}
          <Field>
            <FieldLabel htmlFor="adjust-reason">Reason & Credit Note Reference</FieldLabel>
            <Textarea
              id="adjust-reason"
              name="reason"
              placeholder="e.g. Credit note CN-4021 issued for 12 short-shipped items..."
              value={reason}
              required
              minLength={4}
              maxLength={1000}
              rows={3}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>
              Provide clear details for the supplier credit note or accounting correction (min 4 chars).
            </FieldDescription>
          </Field>

          <DialogFooter className="pt-2">
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={busy || !isAmountValid || !isReasonValid}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <DollarSign className="size-4" />}
              <span>Post adjustment</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
