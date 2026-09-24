'use client';

import { CircleAlert, Loader2, MapPin } from 'lucide-react';
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

export function CorrectDeliveryAddressDialog({
  order,
  onCompleted,
}: {
  readonly order: OrderDetailDto;
  readonly onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    try {
      await fetchApiData(`/admin/orders/${order.id}/delivery-address`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version: order.version,
          reason: value('reason'),
          address: {
            recipientName: value('recipientName'),
            phone: value('phone'),
            addressLine1: value('addressLine1'),
            addressLine2: value('addressLine2') || undefined,
            area: value('area') || undefined,
            city: value('city') || undefined,
            district: value('district') || undefined,
            postalCode: value('postalCode') || undefined,
            countryCode: value('countryCode').toLocaleUpperCase(),
          },
        }),
      });
      setOpen(false);
      onCompleted();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Delivery address could not be corrected.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <MapPin aria-hidden="true" /> Correct
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Correct delivery address</DialogTitle>
          <DialogDescription>
            This changes the operational order snapshot only before fulfillment starts. The previous
            and corrected versions remain in the audit record.
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="correction-recipient">Recipient</Label>
              <Input
                id="correction-recipient"
                name="recipientName"
                defaultValue={order.address.recipientName}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correction-phone">Phone</Label>
              <Input
                id="correction-phone"
                name="phone"
                defaultValue={order.address.phone}
                inputMode="tel"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="correction-line-1">Address line 1</Label>
              <Input
                id="correction-line-1"
                name="addressLine1"
                defaultValue={order.address.addressLine1}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="correction-line-2">Address line 2</Label>
              <Input
                id="correction-line-2"
                name="addressLine2"
                defaultValue={order.address.addressLine2 ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correction-area">Area</Label>
              <Input id="correction-area" name="area" defaultValue={order.address.area ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correction-city">City</Label>
              <Input id="correction-city" name="city" defaultValue={order.address.city ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correction-district">District</Label>
              <Input
                id="correction-district"
                name="district"
                defaultValue={order.address.district ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correction-postal">Postal code</Label>
              <Input
                id="correction-postal"
                name="postalCode"
                defaultValue={order.address.postalCode ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correction-country">Country</Label>
              <Input
                id="correction-country"
                name="countryCode"
                defaultValue={order.address.countryCode}
                maxLength={2}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="correction-reason">Correction reason</Label>
            <Textarea
              id="correction-reason"
              name="reason"
              maxLength={1000}
              required
              placeholder="Example: customer confirmed corrected house number by phone"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Save correction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
