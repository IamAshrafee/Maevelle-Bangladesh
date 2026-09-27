'use client';

import { CircleAlert, Edit3, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { OrderDetailDto } from '@maevelle/contracts';

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
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

export function CorrectCustomerContactDialog({
  order,
  onCompleted,
}: {
  readonly order: OrderDetailDto;
  readonly onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [customerName, setCustomerName] = useState(order.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone ?? '');
  const [customerEmail, setCustomerEmail] = useState(order.customerEmail ?? '');
  const [reason, setReason] = useState('');

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setCustomerName(order.customerName ?? '');
      setCustomerPhone(order.customerPhone ?? '');
      setCustomerEmail(order.customerEmail ?? '');
      setReason('');
      setMessage('');
    }
    setOpen(nextOpen);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    setMessage('');

    try {
      await fetchApiData(`/admin/orders/${order.id}/customer-contact`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          displayName: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail.trim() || undefined,
          reason: reason.trim(),
        }),
      });
      setOpen(false);
      onCompleted();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Customer contact could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="h-7 px-2 text-xs" />}>
        <Edit3 className="mr-1 size-3.5" aria-hidden="true" /> Correct contact
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct Order Contact Snapshot</DialogTitle>
          <DialogDescription>
            Fix typos in the customer name, phone, or email for order {order.orderNumber}.
            Changes are logged into the order correction audit history and do not corrupt historical master customer profiles.
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
            <Label htmlFor="contact-name">Customer Name</Label>
            <Input
              id="contact-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Ashrafee Ahmed"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-phone">Phone Number</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="e.g. +8801712345678"
            />
            <p className="text-xs text-muted-foreground">
              Used for courier assignment and SMS dispatch. Must be a valid phone number.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-email">Email Address (Optional)</Label>
            <Input
              id="contact-email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="e.g. customer@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-reason">Correction Reason *</Label>
            <Textarea
              id="contact-reason"
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., Customer called to correct phone digit typo."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save Correction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
