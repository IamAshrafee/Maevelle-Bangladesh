'use client';

import { useState, useEffect } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';
import type { OrderLineDto, WarehouseLocationDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function CreateFulfillmentDialog({ orderId, currentVersion, lines }: { orderId: string, currentVersion: number, lines: readonly OrderLineDto[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await fetchApiData<WarehouseLocationDto[]>('/admin/warehouse/locations');
        if (mounted) {
          setLocations(data || []);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          console.error(err);
          setIsLoading(false);
        }
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || isLoading) return;
    setBusy(true);
    setMessage('');
    
    const formData = new FormData(e.currentTarget);
    const locationId = formData.get('locationId') as string;
    
    const fulfillLines = lines.map(line => ({
      orderLineId: line.id,
      quantity: Number(formData.get(`qty-${line.id}`)),
    })).filter(l => l.quantity > 0);

    if (fulfillLines.length === 0) {
      setMessage('You must fulfill at least one item.');
      setBusy(false);
      return;
    }

    try {
      await fetchApiData(`/admin/orders/${orderId}/fulfillments`, {
        method: 'POST',
        body: JSON.stringify({
          locationId,
          expectedVersion: currentVersion,
          lines: fulfillLines,
        }),
        headers: {
          'idempotency-key': crypto.randomUUID(),
        },
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Fulfillment could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        Create Fulfillment
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Fulfillment</DialogTitle>
          <DialogDescription>
            Select items to fulfill from a specific warehouse.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="locationId">Fulfillment Location ID</Label>
            <select
              id="locationId"
              name="locationId"
              required
              disabled={isLoading || busy}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{isLoading ? 'Loading locations...' : 'Select a location'}</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Items to Fulfill</h3>
            <div className="rounded-md border divide-y">
              {lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between p-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{line.productTitle}</span>
                    <span className="text-xs text-muted-foreground">{line.sku}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">of {line.quantity}</span>
                    <Input 
                      name={`qty-${line.id}`} 
                      type="number" 
                      min="0" 
                      max={line.quantity} 
                      defaultValue={line.quantity}
                      className="w-20"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create Fulfillment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
