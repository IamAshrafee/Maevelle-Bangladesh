'use client';

import { useState } from 'react';
import { Box, CircleAlert, Loader2 } from 'lucide-react';
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

export function CancelOrderDialog({ orderId, currentVersion }: { orderId: string, currentVersion: number }) {
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
      version: currentVersion,
      reasonCode: formData.get('reasonCode') as string,
      reasonText: formData.get('reasonText') as string || undefined,
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
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order could not be cancelled.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>
        Cancel Order
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Order</DialogTitle>
          <DialogDescription>
            This action will release any reserved inventory and cancel pending payment intents. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reasonCode">Reason Code</Label>
            <select 
              id="reasonCode" 
              name="reasonCode" 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              required
            >
              <option value="CUSTOMER_REQUEST">Customer Request</option>
              <option value="ADMIN_REQUEST">Admin Request</option>
              <option value="PAYMENT_FAILED">Payment Failed</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="reasonText">Additional Notes (Optional)</Label>
            <Input id="reasonText" name="reasonText" placeholder="E.g., Customer called to cancel" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Go Back</Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
