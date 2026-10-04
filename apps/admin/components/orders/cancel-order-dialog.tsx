'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';

interface CancelOrderDialogProps {
  readonly orderId: string;
  readonly orderNumber?: string;
  readonly currentVersion: number;
  readonly onCompleted?: () => void;
  readonly trigger?: React.ReactNode;
}

const reasonCodes = [
  { value: 'CUSTOMER_REQUEST', label: 'Customer Requested Cancellation' },
  { value: 'CUSTOMER_UNREACHABLE', label: 'Customer Unreachable' },
  { value: 'DUPLICATE_ORDER', label: 'Duplicate Order' },
  { value: 'INVENTORY_UNAVAILABLE', label: 'Inventory / SKU Unavailable' },
  { value: 'FRAUD_SUSPICION', label: 'High Risk / Suspicious Order' },
  { value: 'PRICE_DISPUTE', label: 'Pricing / Shipping Fee Disagreement' },
  { value: 'OTHER', label: 'Other Operational Reason' },
] as const;

const initiatedByOptions = [
  { value: 'MERCHANT', label: 'Merchant Decision (Admin)' },
  { value: 'CUSTOMER', label: 'Customer Requested' },
  { value: 'SYSTEM', label: 'Automated / System' },
] as const;

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function CancelOrderDialog({
  orderId,
  orderNumber,
  currentVersion,
  onCompleted,
  trigger,
}: CancelOrderDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [reasonCode, setReasonCode] = useState<string>('CUSTOMER_REQUEST');
  const [initiatedBy, setInitiatedBy] = useState<'CUSTOMER' | 'MERCHANT' | 'SYSTEM'>('CUSTOMER');
  const [reasonText, setReasonText] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');

    const payload = {
      version: currentVersion,
      reasonCode,
      reasonText: reasonText.trim() || undefined,
      initiatedBy,
    };

    try {
      await fetchApiData(`/admin/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'idempotency-key': crypto.randomUUID(),
        },
      });
      setOpen(false);
      setReasonText('');
      if (onCompleted) {
        onCompleted();
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order could not be cancelled.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ? (trigger as any) : undefined}>
        {!trigger && (
          <Button variant="destructive" size="sm">
            <XCircle className="mr-1.5 size-4" />
            Cancel Order
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
            <AlertTriangle className="size-6" />
          </div>
          <DialogTitle className="text-center">Cancel Order {orderNumber ? `(${orderNumber})` : ''}</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Cancelling an order releases all reserved inventory items immediately and halts pending fulfillment.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">Operational consequences:</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>Inventory reservations are released back to available stock.</li>
            <li>If payments have already been collected, a linked Refund Obligation is created for Finance settlement.</li>
            <li>This action cannot be undone once confirmed.</li>
          </ul>
        </div>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="initiatedBy">Initiated By</Label>
            <select
              id="initiatedBy"
              value={initiatedBy}
              onChange={(e) => setInitiatedBy(e.target.value as any)}
              className={selectClassName}
              disabled={busy}
            >
              {initiatedByOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reasonCode">Cancellation Reason</Label>
            <select
              id="reasonCode"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className={selectClassName}
              disabled={busy}
              required
            >
              {reasonCodes.map((rc) => (
                <option key={rc.value} value={rc.value}>
                  {rc.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reasonText">Details / Notes (Optional)</Label>
            <Input
              id="reasonText"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="e.g. Customer requested cancellation via phone call."
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
              Go Back
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                'Confirm Cancellation'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
