'use client';

import { useState } from 'react';
import { CircleAlert, Loader2, ShieldX } from 'lucide-react';
import type { CustomerDetailDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
import { fetchApiData } from '@/lib/api';

interface AnonymizeCustomerDialogProps {
  readonly customer: CustomerDetailDto;
  readonly onCompleted: () => void;
}

export function AnonymizeCustomerDialog({ customer, onCompleted }: AnonymizeCustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [reasonCode, setReasonCode] = useState('CUSTOMER_REQUEST');
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const isDirty = confirmation.trim().length > 0 || reasonText.trim().length > 0;

  const lifecycle = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard redaction request?',
    description: 'You have entered confirmation text. Are you sure you want to dismiss?',
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmation !== customer.customerNumber || busy) return;
    setBusy(true);
    setMessage('');

    try {
      await fetchApiData(`/admin/customers/${customer.id}/anonymize`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: customer.version,
          reasonCode,
          reasonText: reasonText.trim() || undefined,
        }),
      });
      setOpen(false);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer could not be anonymized.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={lifecycle.handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-9 gap-1 text-muted-foreground hover:text-destructive" />}>
        <ShieldX className="size-3.5" aria-hidden="true" /> Anonymize
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldX className="size-5" /> Anonymize Customer Personal Data
          </DialogTitle>
          <DialogDescription>
            Permanent privacy redaction. Current profile contact points, saved addresses, internal
            notes, and tags will be scrubbed. Immutable order snapshots remain for accounting and
            statutory tax compliance.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="anonymize-reason">Legal / Business Reason</Label>
            <NativeSelect
              id="anonymize-reason"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              <NativeSelectOption value="CUSTOMER_REQUEST">Customer Privacy / Erasure Request</NativeSelectOption>
              <NativeSelectOption value="REGULATORY_REQUEST">Regulatory / Compliance Mandate</NativeSelectOption>
              <NativeSelectOption value="MERCHANT_DATA_CLEANUP">Merchant Account Hygiene</NativeSelectOption>
              <NativeSelectOption value="FRAUD_ENFORCEMENT">Fraud / Legal Investigation</NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anonymize-notes">Reason Explanation (Optional)</Label>
            <Input
              id="anonymize-notes"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Case reference or customer ticket ID"
            />
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="anonymize-confirmation" className="text-xs">
              Type Customer Code <span className="font-mono font-bold text-foreground">{customer.customerNumber}</span> to confirm:
            </Label>
            <Input
              id="anonymize-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={customer.customerNumber}
              required
              className="font-mono"
            />
          </div>

          <DialogFooter className="border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => lifecycle.handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={confirmation !== customer.customerNumber || busy}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Permanently Redact PII
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {lifecycle.discardConfirmDialog}
    </Dialog>
  );
}
