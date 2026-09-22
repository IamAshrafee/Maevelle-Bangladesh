'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { SupplyField } from '@/components/supply/supply-field';
import type { CancelShipmentDialogProps } from '../types';

export function CancelShipmentDialog({
  open,
  onOpenChange,
  shipment,
  onConfirmCancel,
  saving,
}: CancelShipmentDialogProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    await onConfirmCancel(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <DialogTitle>Cancel Shipment {shipment.shipmentNumber}?</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Only a planned shipment can be cancelled. All{' '}
            <strong>{shipment.allocations.length} allocated purchase lines</strong> will be returned
            to their originating purchase orders as unallocated units.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SupplyField label="Cancellation Reason">
            <Textarea
              name="reason"
              placeholder="e.g. Forwarder cancelled booking, consolidated into another shipment..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              disabled={saving}
              className="text-xs"
            />
          </SupplyField>

          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose render={<Button variant="outline" type="button" disabled={saving} />}>
              Keep Shipment
            </DialogClose>
            <Button
              variant="destructive"
              type="submit"
              disabled={saving || !reason.trim()}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>Cancel Shipment</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
