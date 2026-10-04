'use client';

import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { useState } from 'react';

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

export function CompleteOrderDialog({
  orderId,
  orderNumber,
  onCompleted,
  trigger,
}: {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly onCompleted: () => void;
  readonly trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [manualReason, setManualReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualReason.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/orders/${orderId}/complete`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ manualReason: manualReason.trim() }),
      });
      setManualReason('');
      setOpen(false);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ? (trigger as any) : undefined}>
        {!trigger && (
          <Button size="sm" variant="default">
            <CheckCircle2 className="mr-1.5 size-4" aria-hidden="true" /> Complete Order
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete Order {orderNumber}</DialogTitle>
          <DialogDescription>
            Marks this order as COMPLETED. Use this for completed in-store pickups, direct handovers,
            or verified offline deliveries where automatic courier delivery webhooks are not present.
          </DialogDescription>
        </DialogHeader>
        {message ? (
          <div
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        ) : null}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="complete-order-reason">Completion Reason / Notes *</Label>
            <Textarea
              id="complete-order-reason"
              placeholder="E.g., Customer collected in store; Direct courier delivery confirmed via phone."
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground">
              This operational reason is recorded in the order audit log and completion history.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!manualReason.trim() || busy}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Confirm Completion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
