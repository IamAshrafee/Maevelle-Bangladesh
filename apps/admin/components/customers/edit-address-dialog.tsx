'use client';

import { useState } from 'react';
import { CircleAlert, Loader2, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { CustomerAddressDto } from '@maevelle/contracts';

interface EditAddressDialogProps {
  readonly customerId: string;
  readonly address: CustomerAddressDto;
  readonly onUpdated?: () => void;
}

export function EditAddressDialog({ customerId, address, onUpdated }: EditAddressDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [label, setLabel] = useState(address.label ?? '');
  const [recipientName, setRecipientName] = useState(address.recipientName);
  const [phone, setPhone] = useState(address.phone ?? '');
  const [addressLine1, setAddressLine1] = useState(address.addressLine1);
  const [addressLine2, setAddressLine2] = useState(address.addressLine2 ?? '');
  const [city, setCity] = useState(address.city ?? '');
  const [area, setArea] = useState(address.area ?? '');
  const [district, setDistrict] = useState(address.district ?? '');
  const [postalCode, setPostalCode] = useState(address.postalCode ?? '');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');

    const payload = {
      label: label.trim() || undefined,
      recipientName: recipientName.trim(),
      phone: phone.trim() || undefined,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2.trim() || undefined,
      city: city.trim() || undefined,
      area: area.trim() || undefined,
      district: district.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      countryCode: address.countryCode || 'BD',
    };

    try {
      await fetchApiData(`/admin/customers/${customerId}/addresses/${address.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setOpen(false);
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Address could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault() {
    if (busy) return;
    setBusy(true);
    try {
      await fetchApiData(`/admin/customers/${customerId}/addresses/${address.id}/default`, {
        method: 'POST',
      });
      setOpen(false);
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not set default address.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (busy) return;
    if (!confirm('Are you sure you want to remove this address?')) return;
    setBusy(true);

    try {
      await fetchApiData(`/admin/customers/${customerId}/addresses/${address.id}`, {
        method: 'DELETE',
      });
      setOpen(false);
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Address could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground" />}>
        <Pencil className="size-3" aria-hidden="true" /> Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Delivery Address</DialogTitle>
          <DialogDescription>
            Update address details, set as default, or remove from address book.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-addr-label" className="text-xs">Address Label</Label>
              <Input
                id="edit-addr-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Home, Office"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-addr-recipient" className="text-xs">Recipient Name *</Label>
              <Input
                id="edit-addr-recipient"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                required
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-addr-phone" className="text-xs">Recipient Phone</Label>
            <Input
              id="edit-addr-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01712345678"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-addr-line1" className="text-xs">Address Line 1 *</Label>
            <Input
              id="edit-addr-line1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              required
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-addr-line2" className="text-xs">Address Line 2 (Optional)</Label>
            <Input
              id="edit-addr-line2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Apartment 4A, Landmark"
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-addr-city" className="text-xs">City / Division *</Label>
              <Input
                id="edit-addr-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-addr-area" className="text-xs">Area / Thana</Label>
              <Input
                id="edit-addr-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Dhanmondi, Gulshan"
                className="h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-addr-district" className="text-xs">District</Label>
              <Input
                id="edit-addr-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-addr-postal" className="text-xs">Postal Code</Label>
              <Input
                id="edit-addr-postal"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="1209"
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row justify-between items-center w-full gap-2 pt-2 border-t">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={deactivate}
                disabled={busy}
              >
                Remove
              </Button>
              {!address.isDefault && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={makeDefault}
                  disabled={busy}
                >
                  Set Default
                </Button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !recipientName.trim() || !addressLine1.trim()}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
