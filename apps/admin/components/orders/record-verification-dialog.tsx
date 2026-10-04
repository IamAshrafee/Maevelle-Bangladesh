'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, PhoneCall } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

interface RecordVerificationDialogProps {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerPhone?: string | null | undefined;
  readonly onCompleted?: (() => void) | undefined;
  readonly trigger?: React.ReactNode;
}

const verificationTypes = [
  { value: 'PHONE_CALL', label: 'Phone Call' },
  { value: 'WHATSAPP_MESSAGE', label: 'WhatsApp Message' },
  { value: 'SMS_CONFIRMATION', label: 'SMS Confirmation' },
  { value: 'FRAUD_RISK_REVIEW', label: 'Fraud Risk Review' },
  { value: 'MANUAL_APPROVAL', label: 'Manual Approval' },
] as const;

const outcomes = [
  { value: 'CONFIRMED', label: 'Confirmed by Customer' },
  { value: 'UNREACHABLE', label: 'Customer Unreachable' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number' },
  { value: 'CANCEL_REQUESTED', label: 'Customer Requested Cancellation' },
  { value: 'ADDRESS_CORRECTION_REQUESTED', label: 'Address Correction Requested' },
  { value: 'FLAGGED_SUSPICIOUS', label: 'Flagged as Suspicious' },
  { value: 'APPROVED_OVERRIDE', label: 'Approved via Risk Override' },
] as const;

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function RecordVerificationDialog({
  orderId,
  orderNumber,
  customerPhone,
  onCompleted,
  trigger,
}: RecordVerificationDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [verificationType, setVerificationType] = useState<string>('PHONE_CALL');
  const [outcome, setOutcome] = useState<string>('CONFIRMED');
  const [notes, setNotes] = useState<string>('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      await fetchApiData(`/admin/orders/${orderId}/verifications`, {
        method: 'POST',
        body: JSON.stringify({
          verificationType,
          outcome,
          notes: notes.trim() || undefined,
        }),
      });

      setOpen(false);
      setNotes('');
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record verification');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ? (trigger as any) : undefined}>
        {!trigger && (
          <Button variant="outline" size="sm">
            <PhoneCall className="mr-1.5 size-3.5" aria-hidden="true" />
            Verify Customer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Customer Verification</DialogTitle>
          <DialogDescription>
            Record telephone, WhatsApp, or operational contact for Order{' '}
            <strong className="text-foreground">{orderNumber}</strong>
            {customerPhone ? ` (${customerPhone})` : ''}.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="verificationType">Channel / Method</Label>
            <select
              id="verificationType"
              value={verificationType}
              onChange={(e) => setVerificationType(e.target.value)}
              className={selectClassName}
              disabled={busy}
            >
              {verificationTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="outcome">Contact Outcome</Label>
            <select
              id="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className={selectClassName}
              disabled={busy}
            >
              {outcomes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="verificationNotes">Staff Notes / Details (Optional)</Label>
            <Textarea
              id="verificationNotes"
              placeholder="e.g. Spoke with customer; confirmed delivery address and size."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={busy}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Recording…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  Save Verification
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
