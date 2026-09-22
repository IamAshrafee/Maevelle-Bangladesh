'use client';

import { Check, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { PurchaseDto, SupplierDto, WarehouseLocationDto } from '@maevelle/contracts';

import { PurchaseFormFields } from '@/components/supply/purchase-form-fields';
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

export interface PurchaseEditDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly purchase: PurchaseDto;
  readonly suppliers: readonly SupplierDto[];
  readonly locations: readonly WarehouseLocationDto[];
  readonly busy: boolean;
  readonly onSave: (data: {
    supplierId: string;
    currencyCode: 'BDT' | 'CNY' | 'USD';
    orderDate: string;
    expectedDate: string | null;
    destinationLocationId: string | null;
    supplierReference: string | null;
    notes: string | null;
  }) => void;
}

export function PurchaseEditDialog({
  open,
  onOpenChange,
  purchase,
  suppliers,
  locations,
  busy,
  onSave,
}: PurchaseEditDialogProps) {
  const [supplierId, setSupplierId] = useState(purchase.supplierId);
  const [currencyCode, setCurrencyCode] = useState(purchase.currencyCode);
  const [orderDate, setOrderDate] = useState(purchase.orderDate);
  const [expectedDate, setExpectedDate] = useState(purchase.expectedDate ?? '');
  const [destinationLocationId, setDestinationLocationId] = useState(
    purchase.destinationLocationId ?? '',
  );
  const [supplierReference, setSupplierReference] = useState(
    purchase.supplierReference ?? '',
  );
  const [notes, setNotes] = useState(purchase.notes ?? '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      supplierId,
      currencyCode,
      orderDate,
      expectedDate: expectedDate || null,
      destinationLocationId: destinationLocationId || null,
      supplierReference: supplierReference.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {purchase.purchaseNumber}</DialogTitle>
          <DialogDescription>
            Update supplier reference, dates, destination warehouse, or internal notes while this
            purchase is still in Draft status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <PurchaseFormFields
            suppliers={suppliers}
            locations={locations}
            supplierId={supplierId}
            onSupplierChange={setSupplierId}
            currencyCode={currencyCode}
            onCurrencyChange={setCurrencyCode}
            orderDate={orderDate}
            onOrderDateChange={setOrderDate}
            expectedDate={expectedDate}
            onExpectedDateChange={setExpectedDate}
            destinationLocationId={destinationLocationId}
            onDestinationLocationChange={setDestinationLocationId}
            supplierReference={supplierReference}
            onSupplierReferenceChange={setSupplierReference}
            notes={notes}
            onNotesChange={setNotes}
            commercialFieldsLocked={purchase.lines.length > 0}
            disabled={busy}
          />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              <span>Save changes</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
