'use client';

import { CircleAlert, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import type { OrderLineDto } from '@maevelle/contracts';

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

export function CancelOrderLineDialog({
  orderId,
  orderVersion,
  line,
  onCompleted,
}: {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly line: OrderLineDto;
  readonly onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState('CUSTOMER_REQUEST');
  const [reasonText, setReasonText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/orders/${orderId}/lines/${line.id}/cancel`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version: orderVersion,
          reasonCode,
          reasonText: reasonText.trim() || undefined,
        }),
      });
      setOpen(false);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order item could not be cancelled.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant="ghost" aria-label={`Cancel ${line.productTitle}`} />}
      >
        <X aria-hidden="true" /> Cancel item
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel order item</DialogTitle>
          <DialogDescription>
            {line.quantity} × {line.productTitle} ({line.sku}) will remain visible as cancelled
            history. Its stock reservation and unpaid payment obligation will be reduced atomically.
          </DialogDescription>
        </DialogHeader>
        {message ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{message}</p>
          </div>
        ) : null}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor={`line-cancel-reason-${line.id}`}>Reason</Label>
            <select
              id={`line-cancel-reason-${line.id}`}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              <option value="CUSTOMER_REQUEST">Customer request</option>
              <option value="OUT_OF_STOCK">Stock correction</option>
              <option value="DUPLICATE_ITEM">Duplicate item</option>
              <option value="ADMIN_CORRECTION">Admin correction</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`line-cancel-note-${line.id}`}>Internal explanation</Label>
            <Textarea
              id={`line-cancel-note-${line.id}`}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              maxLength={1000}
              placeholder="Optional supporting detail"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep item
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Cancel item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
