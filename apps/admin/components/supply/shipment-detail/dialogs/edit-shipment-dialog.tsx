'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SupplyTaskDialogContent } from '@/components/supply/supply-task-dialog-content';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SupplyField } from '@/components/supply/supply-field';
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
  const [providerReference, setProviderReference] = useState(shipment.providerReference ?? '');
  const [grossWeight, setGrossWeight] = useState(shipment.grossWeight ?? '');
  const [chargeableWeight, setChargeableWeight] = useState(shipment.chargeableWeight ?? '');
  const [weightUnit, setWeightUnit] = useState<'KG' | 'LB'>(shipment.weightUnit ?? 'KG');
  const [freightRate, setFreightRate] = useState(shipment.freightRate ?? '');
  const [freightRateUnit, setFreightRateUnit] = useState<'PER_KG' | 'PER_LB' | 'FLAT'>(
    shipment.freightRateUnit ?? 'PER_KG',
  );
  const [reportedFreightAmount, setReportedFreightAmount] = useState(
    shipment.reportedFreightAmount ?? '',
  );

  useEffect(() => {
    if (!open) return;
    setTransportMode(
      (shipment.transportMode as 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER') || 'SEA',
    );
    setTrackingReference(shipment.trackingReference ?? '');
    setOriginText(shipment.originText ?? '');
    setExpectedArrivalDate(shipment.expectedArrivalDate?.slice(0, 10) ?? '');
    setProviderReference(shipment.providerReference ?? '');
    setGrossWeight(shipment.grossWeight ?? '');
    setChargeableWeight(shipment.chargeableWeight ?? '');
    setWeightUnit(shipment.weightUnit ?? 'KG');
    setFreightRate(shipment.freightRate ?? '');
    setFreightRateUnit(shipment.freightRateUnit ?? 'PER_KG');
    setReportedFreightAmount(shipment.reportedFreightAmount ?? '');
  }, [open, shipment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      transportMode,
      trackingReference: trackingReference.trim() || undefined,
      originText: originText.trim() || undefined,
      expectedArrivalDate: expectedArrivalDate || undefined,
      providerReference: providerReference.trim() || undefined,
      grossWeight: grossWeight || undefined,
      chargeableWeight: chargeableWeight || undefined,
      weightUnit,
      freightRate: freightRate || undefined,
      freightRateUnit,
      reportedFreightAmount: reportedFreightAmount || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SupplyTaskDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Logistics Details</DialogTitle>
          <DialogDescription>
            Update tracking, route, transport mode, and estimated arrival date for{' '}
            {shipment.shipmentNumber}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <SupplyField label="Transport Mode">
            <NativeSelect
              name="transportMode"
              className="w-full"
              value={transportMode}
              onChange={(e) =>
                setTransportMode(e.target.value as 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER')
              }
              disabled={saving}
            >
              <NativeSelectOption value="SEA">Sea Freight (Container / Vessel)</NativeSelectOption>
              <NativeSelectOption value="AIR">Air Freight (Cargo / Express)</NativeSelectOption>
              <NativeSelectOption value="ROAD">Road Freight (Truck / Courier)</NativeSelectOption>
              <NativeSelectOption value="RAIL">Rail Freight</NativeSelectOption>
              <NativeSelectOption value="OTHER">Other / Multimodal Logistics</NativeSelectOption>
            </NativeSelect>
          </SupplyField>

          <SupplyField label="Tracking / Bill of Lading / AWB #">
            <Input
              name="trackingReference"
              autoComplete="off"
              value={trackingReference}
              onChange={(e) => setTrackingReference(e.target.value)}
              placeholder="e.g. MSKU9281740 or AWB-784-90218"
              disabled={saving}
            />
          </SupplyField>

          <SupplyField label="Origin Port / City">
            <Input
              name="originText"
              autoComplete="off"
              value={originText}
              onChange={(e) => setOriginText(e.target.value)}
              placeholder="e.g. Guangzhou Port, China"
              disabled={saving}
            />
          </SupplyField>

          <SupplyField label="Expected Arrival Date (ETA)">
            <Input
              name="expectedArrivalDate"
              type="date"
              value={expectedArrivalDate}
              onChange={(e) => setExpectedArrivalDate(e.target.value)}
              disabled={saving}
            />
          </SupplyField>

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-semibold">Provider evidence & freight measurement</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <SupplyField label="Provider batch / shipment reference">
                <Input
                  name="providerReference"
                  autoComplete="off"
                  value={providerReference}
                  onChange={(event) => setProviderReference(event.target.value)}
                  placeholder="e.g. CB-A-G-661"
                  disabled={saving}
                />
              </SupplyField>
              <SupplyField label="Weight unit">
                <NativeSelect
                  name="weightUnit"
                  className="w-full"
                  value={weightUnit}
                  onChange={(event) => setWeightUnit(event.target.value as 'KG' | 'LB')}
                  disabled={saving}
                >
                  <NativeSelectOption value="KG">Kilograms (kg)</NativeSelectOption>
                  <NativeSelectOption value="LB">Pounds (lb)</NativeSelectOption>
                </NativeSelect>
              </SupplyField>
              <SupplyField label="Gross / received weight">
                <Input
                  name="grossWeight"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={grossWeight}
                  onChange={(event) => setGrossWeight(event.target.value)}
                  placeholder="0.830000"
                  disabled={saving}
                />
              </SupplyField>
              <SupplyField label="Chargeable weight">
                <Input
                  name="chargeableWeight"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={chargeableWeight}
                  onChange={(event) => setChargeableWeight(event.target.value)}
                  placeholder="0.830000"
                  disabled={saving}
                />
              </SupplyField>
              <SupplyField label="Freight rate">
                <div className="flex gap-2">
                  <Input
                    name="freightRate"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={freightRate}
                    onChange={(event) => setFreightRate(event.target.value)}
                    placeholder="750"
                    disabled={saving}
                  />
                  <NativeSelect
                    name="freightRateUnit"
                    className="w-32 shrink-0"
                    value={freightRateUnit}
                    onChange={(event) =>
                      setFreightRateUnit(event.target.value as 'PER_KG' | 'PER_LB' | 'FLAT')
                    }
                    disabled={saving}
                  >
                    <NativeSelectOption value="PER_KG">per kg</NativeSelectOption>
                    <NativeSelectOption value="PER_LB">per lb</NativeSelectOption>
                    <NativeSelectOption value="FLAT">flat</NativeSelectOption>
                  </NativeSelect>
                </div>
              </SupplyField>
              <SupplyField label={`Provider freight amount (${shipment.currencyCode})`}>
                <Input
                  name="providerFreightAmount"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={reportedFreightAmount}
                  onChange={(event) => setReportedFreightAmount(event.target.value)}
                  placeholder="623"
                  disabled={saving}
                />
              </SupplyField>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This is logistics evidence. Add or link the matching International Freight component
              in Landed Cost before finalization.
            </p>
          </div>

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
              {saving ? 'Saving changes…' : 'Save Logistics Details'}
            </Button>
          </DialogFooter>
        </form>
      </SupplyTaskDialogContent>
    </Dialog>
  );
}
