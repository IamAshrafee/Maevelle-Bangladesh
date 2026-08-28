'use client';

import type { FormEvent } from 'react';

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
import type { Shipment, Worksheet } from '@/lib/supply/costing-types';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorksheetDialog({
  open,
  onOpenChange,
  shipmentId,
  onSubmit,
}: DialogProps & {
  shipmentId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create landed cost worksheet</DialogTitle>
          <DialogDescription>
            This worksheet stays linked to the selected inbound shipment and keeps every revision.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <input name="shipmentId" readOnly type="hidden" value={shipmentId} />
          <label className="grid gap-1 text-sm">
            Base currency
            <select
              className="rounded-md border bg-background p-2"
              defaultValue="CNY"
              name="baseCurrencyCode"
              required
            >
              <option>BDT</option>
              <option>CNY</option>
              <option>USD</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Notes <textarea className="rounded-md border p-2" name="notes" />
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button disabled={!shipmentId} type="submit">
              Create worksheet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CostComponentDialog({
  open,
  onOpenChange,
  worksheet,
  shipment,
  onSubmit,
}: DialogProps & {
  worksheet: Worksheet;
  shipment: Shipment | undefined;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add cost component</DialogTitle>
          <DialogDescription>
            Record the source amount first. The server calculates every allocation.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Type
              <select
                className="rounded-md border bg-background p-2"
                defaultValue="INTERNATIONAL_FREIGHT"
                name="costType"
              >
                <option>INTERNATIONAL_FREIGHT</option>
                <option>LOCAL_FREIGHT</option>
                <option>CUSTOMS_DUTY</option>
                <option>TAX_OR_IMPORT_FEE</option>
                <option>FORWARDER_FEE</option>
                <option>HANDLING</option>
                <option>INSURANCE</option>
                <option>OTHER_ACQUISITION_COST</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Amount
              <input
                className="rounded-md border p-2"
                defaultValue="0.0000"
                name="amount"
                required
                step="0.0001"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Currency
              <input
                className="rounded-md border p-2"
                defaultValue={worksheet.base_currency_code}
                maxLength={3}
                name="currencyCode"
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Value status
              <select
                className="rounded-md border bg-background p-2"
                defaultValue="ACTUAL"
                name="valueStatus"
              >
                <option>ESTIMATED</option>
                <option>ACTUAL</option>
                <option>CREDIT</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Scope
              <select
                className="rounded-md border bg-background p-2"
                defaultValue="GLOBAL"
                name="scope"
              >
                <option>GLOBAL</option>
                <option>DIRECT</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Allocation
              <select
                className="rounded-md border bg-background p-2"
                defaultValue="QUANTITY"
                name="allocationMethod"
              >
                <option>QUANTITY</option>
                <option>EQUAL</option>
                <option>PURCHASE_VALUE</option>
                <option>WEIGHT</option>
                <option>VOLUME</option>
                <option>CHARGEABLE_WEIGHT</option>
                <option>PERCENTAGE</option>
                <option>MANUAL</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              FX rate
              <input
                className="rounded-md border p-2"
                name="fxRate"
                step="0.000000000001"
                type="number"
              />
            </label>
            <label className="grid gap-1 text-sm">
              FX source <input className="rounded-md border p-2" name="fxSource" />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Direct item (for DIRECT only)
            <select
              className="rounded-md border bg-background p-2"
              name="directShipmentAllocationId"
            >
              <option value="">Choose item</option>
              {shipment?.allocations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.productTitle} · {item.sku}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Reference <input className="rounded-md border p-2" name="reference" />
          </label>
          <label className="grid gap-1 text-sm">
            Notes <textarea className="rounded-md border p-2" name="notes" />
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit">Add component</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
