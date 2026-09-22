'use client';

import { useState } from 'react';
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
import { SupplyField, supplySelectClassName } from '@/components/supply/supply-field';
import type { EditShipmentDialogProps } from '../types';

export function EditShipmentDialog({
  open,
  onOpenChange,
  shipment,
  onSave,
  saving,
}: EditShipmentDialogProps) {
  const [transportMode, setTransportMode] = useState<'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER'>(
    (shipment.transportMode as 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER') || 'SEA',
  );
  const [trackingReference, setTrackingReference] = useState(shipment.trackingReference ?? '');
  const [originText, setOriginText] = useState(shipment.originText ?? '');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(
    shipment.expectedArrivalDate ? shipment.expectedArrivalDate.slice(0, 10) : '',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      transportMode,
      trackingReference: trackingReference.trim() || undefined,
      originText: originText.trim() || undefined,
      expectedArrivalDate: expectedArrivalDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Logistics Details</DialogTitle>
          <DialogDescription>
            Update tracking, route, transport mode, and estimated arrival date for {shipment.shipmentNumber}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SupplyField label="Transport Mode">
            <select
              className={supplySelectClassName}
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value as 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER')}
              disabled={saving}
            >
              <option value="SEA">Sea Freight (Container / Vessel)</option>
              <option value="AIR">Air Freight (Cargo / Express)</option>
              <option value="ROAD">Road Freight (Truck / Courier)</option>
              <option value="RAIL">Rail Freight</option>
              <option value="OTHER">Other / Multimodal Logistics</option>
            </select>
          </SupplyField>

          <SupplyField label="Tracking / Bill of Lading / AWB #">
            <Input
              value={trackingReference}
              onChange={(e) => setTrackingReference(e.target.value)}
              placeholder="e.g. MSKU9281740 or AWB-784-90218"
              disabled={saving}
            />
          </SupplyField>

          <SupplyField label="Origin Port / City">
            <Input
              value={originText}
              onChange={(e) => setOriginText(e.target.value)}
              placeholder="e.g. Guangzhou Port, China"
              disabled={saving}
            />
          </SupplyField>

          <SupplyField label="Expected Arrival Date (ETA)">
            <Input
              type="date"
              value={expectedArrivalDate}
              onChange={(e) => setExpectedArrivalDate(e.target.value)}
              disabled={saving}
            />
          </SupplyField>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving changes...' : 'Save Logistics Details'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
