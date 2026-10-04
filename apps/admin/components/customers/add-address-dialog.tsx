'use client';

import { useState } from 'react';
import { CircleAlert, Loader2, Plus } from 'lucide-react';

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

interface AddAddressDialogProps {
  readonly customerId: string;
  readonly onAdded?: () => void;
  readonly isFirstAddress?: boolean;
}

export function AddAddressDialog({
  customerId,
  onAdded,
  isFirstAddress = false,
}: AddAddressDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [label, setLabel] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('Dhaka');
  const [area, setArea] = useState('');
  const [district, setDistrict] = useState('Dhaka');
  const [postalCode, setPostalCode] = useState('');
  const [isDefault, setIsDefault] = useState(isFirstAddress);

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
      countryCode: 'BD',
      isDefault,
    };

    try {
      await fetchApiData(`/admin/customers/${customerId}/addresses`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setOpen(false);
      resetForm();
      onAdded?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Address could not be added.');
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setLabel('');
    setRecipientName('');
    setPhone('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('Dhaka');
    setArea('');
    setDistrict('Dhaka');
    setPostalCode('');
    setIsDefault(isFirstAddress);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1" />}>
        <Plus className="size-3.5" aria-hidden="true" /> Add Address
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Customer Address</DialogTitle>
          <DialogDescription>
            Add a delivery address to this customer's address book for future orders.
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
              <Label htmlFor="add-addr-label" className="text-xs">Address Label</Label>
              <Input
                id="add-addr-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Home, Office"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-addr-recipient" className="text-xs">Recipient Name *</Label>
              <Input
                id="add-addr-recipient"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                required
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-addr-phone" className="text-xs">Recipient Phone</Label>
            <Input
              id="add-addr-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01712345678"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-addr-line1" className="text-xs">Address Line 1 *</Label>
            <Input
              id="add-addr-line1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="House 12, Road 4, Block B"
              required
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-addr-line2" className="text-xs">Address Line 2 (Optional)</Label>
            <Input
              id="add-addr-line2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Apartment 4A, Landmark"
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-addr-city" className="text-xs">City / Division *</Label>
              <Input
                id="add-addr-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-addr-area" className="text-xs">Area / Thana</Label>
              <Input
                id="add-addr-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Dhanmondi, Gulshan"
                className="h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-addr-district" className="text-xs">District</Label>
              <Input
                id="add-addr-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-addr-postal" className="text-xs">Postal Code</Label>
              <Input
                id="add-addr-postal"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="1209"
                className="h-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="add-addr-default"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-4 rounded border-input"
            />
            <Label htmlFor="add-addr-default" className="text-xs font-normal">
              Set as Default Shipping Address
            </Label>
          </div>

          <p className="text-[11px] text-muted-foreground pt-1">
            Note: Updating saved customer addresses applies to future orders. Past order snapshots
            remain immutable.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !recipientName.trim() || !addressLine1.trim()}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Address
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
