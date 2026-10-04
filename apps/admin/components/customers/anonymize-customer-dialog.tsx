'use client';

import { useState } from 'react';
import { CircleAlert, Loader2, ShieldX } from 'lucide-react';
import type { CustomerDetailDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
    <Dialog open={open} onOpenChange={setOpen}>
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
            <select
              id="anonymize-reason"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              <option value="CUSTOMER_REQUEST">Customer Privacy / Erasure Request</option>
              <option value="REGULATORY_REQUEST">Regulatory / Compliance Mandate</option>
              <option value="MERCHANT_DATA_CLEANUP">Merchant Account Hygiene</option>
              <option value="FRAUD_ENFORCEMENT">Fraud / Legal Investigation</option>
            </select>
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
              onClick={() => setOpen(false)}
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
    </Dialog>
  );
}
