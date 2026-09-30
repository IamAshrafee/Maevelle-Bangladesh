'use client';

import { CircleAlert, Loader2, PackagePlus, Search, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
import type { ApiEnvelope } from '@maevelle/contracts';

interface ReadyFulfillment {
  id: string;
  version: number;
  fulfillmentNumber: string;
  orderNumber: string;
  locationName: string;
  status: 'DRAFT' | 'READY' | 'PICKING' | 'PACKED' | 'DISPATCHED' | 'CANCELLED';
  lines: readonly { sku: string; productTitle: string; quantity: string }[];
}

interface DeliveryCreateDialogProps {
  onSuccess: (deliveryId?: string) => Promise<void> | void;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? 'The delivery request was rejected.'),
    );
  }
  return response.json() as Promise<T>;
}

export function DeliveryCreateDialog({ onSuccess }: DeliveryCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [fulfillments, setFulfillments] = useState<readonly ReadyFulfillment[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedFulfillmentId, setSelectedFulfillmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadFulfillments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<ApiEnvelope<readonly ReadyFulfillment[]>>(
        '/admin/fulfillments?pageSize=100',
      );
      // Fulfillments ready for carrier handover/delivery assignment
      const eligible = res.data.filter((f) =>
        ['PACKED', 'READY', 'PICKING'].includes(f.status),
      );
      setFulfillments(eligible);
      if (eligible.length > 0) {
        setSelectedFulfillmentId(eligible[0]?.id ?? '');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load fulfillments.');
      setFulfillments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadFulfillments();
      setSelectedFulfillmentId('');
      setMessage('');
      setSearch('');
    }
  }, [open, loadFulfillments]);

  const filteredFulfillments = fulfillments.filter((f) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      f.fulfillmentNumber.toLowerCase().includes(term) ||
      f.orderNumber.toLowerCase().includes(term) ||
      f.locationName.toLowerCase().includes(term) ||
      f.lines.some((l) => l.productTitle.toLowerCase().includes(term) || l.sku.toLowerCase().includes(term))
    );
  });

  const selectedFulfillment = fulfillments.find((f) => f.id === selectedFulfillmentId);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFulfillmentId || busy) return;

    setBusy(true);
    setMessage('');

    try {
      const res = await request<ApiEnvelope<{ id: string; deliveryNumber: string }>>(
        `/admin/fulfillments/${selectedFulfillmentId}/deliveries`,
        {
          method: 'POST',
          headers: {
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({}),
        },
      );

      setOpen(false);
      await onSuccess(res.data?.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delivery creation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="button primary inline-flex items-center gap-1.5" />}>
        <PackagePlus className="size-4" aria-hidden="true" />
        Create delivery
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prepare shipment delivery</DialogTitle>
          <DialogDescription>
            Instantiate a carrier delivery shipment from a packed warehouse fulfillment.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 p-3 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fulfillment-search">Select fulfillment to deliver</Label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by fulfillment, order, or warehouse..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Search className="absolute right-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading ready fulfillments...
              </div>
            ) : filteredFulfillments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <Truck className="mx-auto mb-2 size-8 opacity-30" />
                No ready fulfillments awaiting delivery creation.
              </div>
            ) : (
              <div className="rounded-md border divide-y max-h-60 overflow-y-auto mt-2">
                {filteredFulfillments.map((f) => (
                  <label
                    key={f.id}
                    className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedFulfillmentId === f.id ? 'bg-primary/5 border-l-2 border-primary' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="fulfillmentId"
                      value={f.id}
                      checked={selectedFulfillmentId === f.id}
                      onChange={() => setSelectedFulfillmentId(f.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <strong className="text-sm font-semibold">{f.fulfillmentNumber}</strong>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">
                          {f.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Order: {f.orderNumber} • Warehouse: {f.locationName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {f.lines.map((l) => `${l.quantity}× ${l.productTitle}`).join(', ')}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {selectedFulfillment && (
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 text-muted-foreground">
              <p>
                <strong>Delivery preparation:</strong> Creating this delivery assigns an initial{' '}
                <span className="font-mono font-medium text-foreground">READY</span> status. You can then
                obtain live quotes, book Pathao or Steadfast, or assign an in-house carrier.
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !selectedFulfillmentId || loading}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create delivery
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
