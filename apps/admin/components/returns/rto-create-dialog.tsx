'use client';

import { AlertCircle, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';
import type { DeliveryDto } from '@maevelle/contracts';

interface RtoCreateDialogProps {
  onSuccess: (newRtoId?: string) => Promise<void> | void;
}

export function RtoCreateDialog({ onSuccess }: RtoCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [failedDeliveries, setFailedDeliveries] = useState<readonly DeliveryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadFailedDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApiData<readonly DeliveryDto[]>(
        '/admin/deliveries?status=FAILED&pageSize=50',
      );
      setFailedDeliveries(data || []);
      if (data && data.length > 0) {
        setSelectedDeliveryId(data[0]!.id);
      }
    } catch {
      setFailedDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError('');
      void loadFailedDeliveries();
    }
  }, [open, loadFailedDeliveries]);

  const filtered = failedDeliveries.filter((d) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      d.deliveryNumber.toLowerCase().includes(term) ||
      d.orderNumber.toLowerCase().includes(term) ||
      d.recipient.name.toLowerCase().includes(term) ||
      d.recipient.phone.toLowerCase().includes(term)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeliveryId || busy) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetchApiData<{ id: string }>('/admin/rto', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          deliveryId: selectedDeliveryId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setOpen(false);
      await onSuccess(res?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initiate RTO case.');
    } finally {
      setBusy(false);
    }
  };

  const selectedDelivery = failedDeliveries.find((d) => d.id === selectedDeliveryId);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" className="gap-1.5" />}>
        <RotateCcw className="size-4" /> Initiate RTO from Delivery
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <SheetTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-destructive" /> Initiate Return to Origin (RTO)
          </SheetTitle>
          <SheetDescription>
            Begin reverse courier transport and warehouse receiving for a failed delivery shipment.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col text-xs">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="searchFailed" className="text-xs font-medium">
                Select Failed Delivery
              </Label>
              <Input
                id="searchFailed"
                placeholder="Search delivery #, order #, phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <Loader2 className="size-4 animate-spin mr-2" /> Loading failed deliveries…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                <AlertTriangle className="size-5 mx-auto mb-1 text-amber-600" />
                <p className="font-medium text-foreground">No failed deliveries awaiting RTO</p>
                <p className="text-[11px] mt-0.5">
                  Only deliveries marked as FAILED are eligible for RTO initiation.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="deliverySelect" className="text-xs font-medium">
                  Eligible Delivery
                </Label>
                <NativeSelect
                  id="deliverySelect"
                  value={selectedDeliveryId}
                  onChange={(e) => setSelectedDeliveryId(e.target.value)}
                  required
                >
                  {filtered.map((d) => (
                    <NativeSelectOption key={d.id} value={d.id}>
                      {d.deliveryNumber} · Order {d.orderNumber} ({d.recipient.name} -{' '}
                      {d.recipient.phone})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}

            {selectedDelivery ? (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-1 text-xs">
                <p className="font-semibold text-foreground">
                  Order {selectedDelivery.orderNumber} · {selectedDelivery.recipient.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Carrier:{' '}
                  {selectedDelivery.manualCarrierName ||
                    selectedDelivery.activeBooking?.providerCode ||
                    'Unassigned'}
                  {selectedDelivery.trackingReference
                    ? ` (${selectedDelivery.trackingReference})`
                    : ''}
                </p>
                <p className="text-[11px] text-destructive font-medium">
                  Initiating RTO creates a dedicated reverse transport case so warehouse staff can
                  inspect items before restocking.
                </p>
              </div>
            ) : null}
          </div>

          <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !selectedDeliveryId || filtered.length === 0}
              className="gap-1.5"
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Initiating…
                </>
              ) : (
                'Confirm & Initiate RTO'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
