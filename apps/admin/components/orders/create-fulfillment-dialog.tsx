'use client';

import { useState, useEffect } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { fetchApiData } from '@/lib/api';
import { formatQuantity } from '@/lib/format/numbers';
import type { OrderLineDto, WarehouseLocationDto } from '@maevelle/contracts';

export function CreateFulfillmentDialog({
  orderId,
  currentVersion,
  lines,
}: {
  orderId: string;
  currentVersion: number;
  lines: readonly OrderLineDto[];
}) {
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
    return () => {
      mounted = false;
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || isLoading) return;
    setBusy(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);
    const locationId = formData.get('locationId') as string;

    const fulfillLines = lines
      .map((line) => {
        const remaining = Number(line.remainingFulfillableQuantity ?? line.quantity);
        const inputQty = Number(formData.get(`qty-${line.id}`));
        const effectiveQty = Math.min(remaining, Math.max(0, inputQty));
        return {
          orderLineId: line.id,
          quantity: String(effectiveQty),
        };
      })
      .filter((l) => Number(l.quantity) > 0);

    if (fulfillLines.length === 0) {
      setMessage('You must fulfill at least one item with remaining quantity.');
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>Create Fulfillment</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-6">
        <SheetHeader className="p-0 pb-4 border-b border-border/60">
          <SheetTitle>Create Fulfillment</SheetTitle>
          <SheetDescription>Select items to fulfill from a specific warehouse.</SheetDescription>
        </SheetHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="locationId">Fulfillment Location</Label>
            <NativeSelect id="locationId" name="locationId" required disabled={isLoading || busy}>
              <option value="">{isLoading ? 'Loading locations...' : 'Select a location'}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Items to Fulfill</h3>
            <div className="rounded-md border divide-y">
              {lines.map((line) => {
                const remaining = Number(line.remainingFulfillableQuantity ?? line.quantity);
                const fulfilled = Number(line.fulfilledQuantity ?? 0);
                const isFullyFulfilled = remaining <= 0;

                return (
                  <div key={line.id} className="flex items-center justify-between p-3 gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium">{line.productTitle}</span>
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">
                        {line.sku} · {formatQuantity(line.quantity)} ordered
                        {fulfilled > 0 ? ` (${fulfilled} already fulfilled)` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">
                        {isFullyFulfilled ? 'Fully fulfilled' : `rem: ${remaining}`}
                      </span>
                      <Input
                        name={`qty-${line.id}`}
                        type="number"
                        min="0"
                        max={remaining}
                        defaultValue={remaining}
                        disabled={isFullyFulfilled || busy}
                        className="w-20 font-mono tabular-nums text-right"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <SheetFooter className="p-0 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create Fulfillment
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
