'use client';

import { AlertCircle, Loader2, Truck } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';

interface ManualBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  version: number;
  deliveryNumber: string;
  onSuccess: () => Promise<void> | void;
}

const COMMON_CARRIERS = [
  'In-House Fleet',
  'Steadfast Courier',
  'RedX Delivery',
  'Sundarban Courier',
  'SA Paribahan',
  'eCourier',
  'Paperfly',
];

export function ManualBookingDialog({
  open,
  onOpenChange,
  deliveryId,
  version,
  deliveryNumber,
  onSuccess,
}: ManualBookingDialogProps) {
  const [carrierName, setCarrierName] = useState('');
  const [trackingReference, setTrackingReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!carrierName.trim() || !trackingReference.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      await fetchApiData(`/admin/deliveries/${deliveryId}/manual-booking`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version,
          carrierName: carrierName.trim(),
          trackingReference: trackingReference.trim(),
        }),
      });
      onOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual courier booking could not be recorded.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-primary" /> Record Manual Courier Booking
          </DialogTitle>
          <DialogDescription>
            Assign an offline carrier or in-house delivery rider to <strong className="text-foreground">{deliveryNumber}</strong>.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="carrierNameInput" className="text-xs font-medium">Carrier / Service Name</Label>
            <Input
              id="carrierNameInput"
              placeholder="e.g. In-House Rider, Steadfast, RedX"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              required
              className="text-xs h-8"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {COMMON_CARRIERS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCarrierName(c)}
                  className="text-[10px] px-2 py-0.5 rounded border hover:bg-muted text-muted-foreground"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trackingInput" className="text-xs font-medium">Tracking Number / Consignment ID</Label>
            <Input
              id="trackingInput"
              placeholder="e.g. ST-8492049, RX-109284"
              value={trackingReference}
              onChange={(e) => setTrackingReference(e.target.value)}
              required
              className="text-xs h-8 font-mono"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !carrierName || !trackingReference}>
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Recording…
                </>
              ) : (
                'Record Booking'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
