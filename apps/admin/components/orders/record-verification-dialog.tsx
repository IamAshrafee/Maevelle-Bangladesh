'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, PhoneCall } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
import { fetchApiData } from '@/lib/api';

interface RecordVerificationDialogProps {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerPhone?: string | null | undefined;
  readonly onCompleted?: (() => void) | undefined;
  readonly trigger?: React.ComponentProps<typeof SheetTrigger>['render'];
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

  const isDirty =
    notes.trim().length > 0 || outcome !== 'CONFIRMED' || verificationType !== 'PHONE_CALL';

  const lifecycle = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard verification record?',
    description: 'You have entered verification details. Are you sure you want to dismiss?',
  });

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
    <Sheet open={open} onOpenChange={lifecycle.handleOpenChange}>
      <SheetTrigger render={trigger}>
        {!trigger && (
          <Button variant="outline" size="sm">
            <PhoneCall className="mr-1.5 size-3.5" aria-hidden="true" />
            Verify Customer
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Record Customer Verification</SheetTitle>
          <SheetDescription>
            Record telephone, WhatsApp, or operational contact for Order{' '}
            <strong className="text-foreground">{orderNumber}</strong>
            {customerPhone ? ` (${customerPhone})` : ''}.
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mx-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor="verificationType">Channel / Method</Label>
            <NativeSelect
              id="verificationType"
              value={verificationType}
              onChange={(e) => setVerificationType(e.target.value)}
              disabled={busy}
            >
              {verificationTypes.map((t) => (
                <NativeSelectOption key={t.value} value={t.value}>
                  {t.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="outcome">Contact Outcome</Label>
            <NativeSelect
              id="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              disabled={busy}
            >
              {outcomes.map((o) => (
                <NativeSelectOption key={o.value} value={o.value}>
                  {o.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
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

          <SheetFooter className="px-0 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => lifecycle.handleOpenChange(false)}
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
          </SheetFooter>
        </form>
      </SheetContent>
      {lifecycle.discardConfirmDialog}
    </Sheet>
  );
}
