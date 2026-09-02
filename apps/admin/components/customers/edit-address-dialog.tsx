'use client';

import { useState } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

export function EditAddressDialog({ customerId, address }: { customerId: string, address: CustomerAddressDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    
    const formData = new FormData(e.currentTarget);
    const payload = {
      version: address.version,
      label: formData.get('label') as string || undefined,
      recipientName: formData.get('recipientName') as string,
      phone: formData.get('phone') as string || undefined,
      addressLine1: formData.get('addressLine1') as string,
      city: formData.get('city') as string,
    };

    try {
      await fetchApiData(`/admin/customers/${customerId}/addresses/${address.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Address could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (busy) return;
    if (!confirm('Are you sure you want to deactivate this address?')) return;
    setBusy(true);
    
    try {
      await fetchApiData(`/admin/customers/${customerId}/addresses/${address.id}`, {
        method: 'DELETE',
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Address could not be deactivated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Edit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Address</DialogTitle>
          <DialogDescription>
            Update address details or deactivate it.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label (Optional)</Label>
              <Input id="label" name="label" defaultValue={address.label || ''} placeholder="Home, Office" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipientName">Recipient Name</Label>
              <Input id="recipientName" name="recipientName" defaultValue={address.recipientName} required />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (Optional)</Label>
            <Input id="phone" name="phone" defaultValue={address.phone || ''} placeholder="017..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressLine1">Address Line 1</Label>
            <Input id="addressLine1" name="addressLine1" defaultValue={address.addressLine1} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={address.city || ''} required />
          </div>

          <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
            <Button type="button" variant="destructive" onClick={deactivate} disabled={busy || address.status === 'INACTIVE'}>
              Deactivate
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy}>
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
