'use client';

import {
  AlertCircle,
  Check,
  Loader2,
  PackageCheck,
  PackageOpen,
  Plus,
  Ship,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

import type {
  InboundShipmentDto,
  PurchaseDto,
  SupplierDto,
  SupplierStatusDto,
  SupplierTypeDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { SupplyField, supplySelectClassName } from '@/components/supply/supply-field';
import { Button } from '@/components/ui/button';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatSupplyNumber, remainingSupplyQuantity } from '@/lib/supply/api';
import { isPurchaseDestination, isShipmentReceivingLocation } from '@/lib/supply/location-options';
import type { ReceiptDraftLine, ShipmentDraftLine } from '@/lib/supply/types';

export function SupplierForm({
  supplier,
  onSubmit,
  saving,
}: {
  supplier?: SupplierDto;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  const types: SupplierTypeDto[] = [
    'MANUFACTURER',
    'WHOLESALER',
    'DISTRIBUTOR',
    'AGENT',
    'LOCAL_VENDOR',
    'OTHER',
  ];
  const statuses: SupplierStatusDto[] = ['ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED'];
  return (
    <form className="grid min-w-0 gap-4" onSubmit={onSubmit}>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <SupplyField label="Supplier name">
          <Input name="name" defaultValue={supplier?.name} autoComplete="organization" required />
        </SupplyField>
        {supplier ? (
          <SupplyField
            label="Status"
            hint="Inactive stops normal new use. Blocked signals a stronger restriction."
          >
            <select className={supplySelectClassName} name="status" defaultValue={supplier.status}>
              {statuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </SupplyField>
        ) : (
          <SupplyField label="Supplier code" hint="A stable reference, such as CN-DRESS-01.">
            <Input name="code" placeholder="CN-DRESS-01" required />
          </SupplyField>
        )}
        <SupplyField label="Supplier type">
          <select
            className={supplySelectClassName}
            name="supplierType"
            defaultValue={supplier?.supplierType ?? 'MANUFACTURER'}
          >
            {types.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </SupplyField>
        <SupplyField label="Country code" hint="Two letters, for example CN or BD.">
          <Input
            name="countryCode"
            minLength={2}
            maxLength={2}
            defaultValue={supplier?.countryCode}
            placeholder="CN"
          />
        </SupplyField>
        <SupplyField label="Preferred currency">
          <select
            className={supplySelectClassName}
            name="preferredCurrencyCode"
            defaultValue={supplier?.preferredCurrencyCode ?? ''}
          >
            <option value="">Not set</option>
            <option>BDT</option>
            <option>CNY</option>
            <option>USD</option>
          </select>
        </SupplyField>
        <SupplyField
          label="Normal lead time (days)"
          hint="A guide; each purchase may have its own expected date."
        >
          <Input name="leadTimeDays" type="number" min="0" defaultValue={supplier?.leadTimeDays} />
        </SupplyField>
        <SupplyField label="Payment terms">
          <Input
            name="paymentTerms"
            defaultValue={supplier?.paymentTerms}
            placeholder="30% deposit, 70% before ship"
          />
        </SupplyField>
        <SupplyField label="Website or listing">
          <Input
            name="websiteUrl"
            type="url"
            defaultValue={supplier?.websiteUrl}
            placeholder="https://…"
          />
        </SupplyField>
        <SupplyField label="Main contact">
          <Input name="contactName" defaultValue={supplier?.contactName} autoComplete="name" />
        </SupplyField>
        <SupplyField label="Contact email">
          <Input
            name="contactEmail"
            type="email"
            defaultValue={supplier?.contactEmail}
            autoComplete="email"
          />
        </SupplyField>
        <SupplyField label="Contact phone">
          <Input
            name="contactPhone"
            type="tel"
            defaultValue={supplier?.contactPhone}
            autoComplete="tel"
          />
        </SupplyField>
      </div>
      <SupplyField label="Internal notes">
        <Textarea
          name="notes"
          defaultValue={supplier?.notes}
          placeholder="Quality notes, communication preference, or commercial context"
        />
      </SupplyField>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}{' '}
          {supplier ? 'Save supplier' : 'Add supplier'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PurchaseForm({
  suppliers,
  locations,
  purchase,
  onSubmit,
  saving,
}: {
  suppliers: readonly SupplierDto[];
  locations: readonly WarehouseLocationDto[];
  purchase?: PurchaseDto;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  const params =
    typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search);
  const commercialFieldsLocked = Boolean(purchase?.lines.length);
  const supplierId = purchase?.supplierId ?? params?.get('supplier') ?? '';
  const currencyCode = purchase?.currencyCode ?? 'CNY';
  return (
    <form className="grid min-w-0 gap-4" onSubmit={onSubmit}>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <SupplyField label="Supplier">
          <select
            className={supplySelectClassName}
            name="supplierId"
            required
            defaultValue={supplierId}
            disabled={commercialFieldsLocked}
          >
            <option value="" disabled>
              Choose an active supplier
            </option>
            {suppliers
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.code}
                </option>
              ))}
          </select>
          {commercialFieldsLocked ? (
            <input type="hidden" name="supplierId" value={supplierId} />
          ) : null}
        </SupplyField>
        <SupplyField label="Purchase currency">
          <select
            className={supplySelectClassName}
            name="currencyCode"
            defaultValue={currencyCode}
            disabled={commercialFieldsLocked}
          >
            <option>BDT</option>
            <option>CNY</option>
            <option>USD</option>
          </select>
          {commercialFieldsLocked ? (
            <input type="hidden" name="currencyCode" value={currencyCode} />
          ) : null}
        </SupplyField>
        <SupplyField
          label="Supplier reference"
          hint="The supplier’s order number, if they gave one."
        >
          <Input name="supplierReference" defaultValue={purchase?.supplierReference} />
        </SupplyField>
        <SupplyField label="Order date">
          <Input
            name="orderDate"
            type="date"
            defaultValue={purchase?.orderDate ?? new Date().toISOString().slice(0, 10)}
          />
        </SupplyField>
        <SupplyField label="Expected date">
          <Input name="expectedDate" type="date" defaultValue={purchase?.expectedDate} />
        </SupplyField>
        <SupplyField label="Expected warehouse">
          <select
            className={supplySelectClassName}
            name="destinationLocationId"
            defaultValue={purchase?.destinationLocationId ?? ''}
          >
            <option value="">Choose later</option>
            {locations.filter(isPurchaseDestination).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.code}
              </option>
            ))}
          </select>
        </SupplyField>
      </div>
      <SupplyField label="Notes">
        <Textarea
          name="notes"
          defaultValue={purchase?.notes}
          placeholder="Terms, packing request, or anything the buyer should remember"
        />
      </SupplyField>
      <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        {purchase
          ? commercialFieldsLocked
            ? 'Supplier and currency are locked once items exist. Dates, destination, reference, and notes remain editable while this purchase is a draft.'
            : 'Draft purchases can change supplier and currency until the first item is added.'
          : 'This creates a draft. Add product lines from its detail page, then place it after checking the total.'}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button
          type="submit"
          disabled={saving || !suppliers.some((item) => item.status === 'ACTIVE')}
        >
          {saving ? <Loader2 className="animate-spin" /> : purchase ? <Check /> : <Plus />}{' '}
          {purchase ? 'Save purchase' : 'Create draft'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ShipmentForm({
  locations,
  shippableLines,
  lines,
  setLines,
  onSubmit,
  saving,
}: {
  locations: readonly WarehouseLocationDto[];
  shippableLines: readonly (PurchaseDto['lines'][number] & { purchase: PurchaseDto })[];
  lines: ShipmentDraftLine[];
  setLines: (lines: ShipmentDraftLine[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  const [lineId, setLineId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchaseFilter, setPurchaseFilter] = useState<string>('');
  const [receivingLocationId, setReceivingLocationId] = useState<string>('');

  const receivingLocations = locations.filter(isShipmentReceivingLocation);

  // Group unique purchases that have shippable lines
  const purchasesWithShippable = Array.from(
    new Map(shippableLines.map((line) => [line.purchase.id, line.purchase])).values(),
  );

  // Read URL search params (e.g. ?purchase=...) on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlPurchaseId = params.get('purchase');
      if (urlPurchaseId && purchasesWithShippable.some((p) => p.id === urlPurchaseId)) {
        setPurchaseFilter(urlPurchaseId);
      }
    }
  }, [purchasesWithShippable]);

  // Set intelligent receiving warehouse default
  useEffect(() => {
    if (receivingLocationId) return;
    const targetPurchase = purchasesWithShippable.find((p) => p.id === purchaseFilter);
    if (
      targetPurchase?.destinationLocationId &&
      receivingLocations.some((loc) => loc.id === targetPurchase.destinationLocationId)
    ) {
      setReceivingLocationId(targetPurchase.destinationLocationId);
    } else if (receivingLocations.length === 1 && receivingLocations[0]) {
      setReceivingLocationId(receivingLocations[0].id);
    }
  }, [purchaseFilter, purchasesWithShippable, receivingLocations, receivingLocationId]);

  // If no shippable lines at all exist across the system
  if (shippableLines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <PackageOpen className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-base font-semibold">No open purchase lines to ship</h3>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          Inbound shipments group placed purchase orders. Purchases must be in PLACED status and
          have unallocated quantities before they can be added to a shipment.
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href="/purchases"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            View Purchases
          </Link>
        </div>
      </div>
    );
  }

  // Lines not yet added to current shipment draft
  const availableLines = shippableLines.filter(
    (line) => !lines.some((selected) => selected.purchaseLineId === line.id),
  );

  // Available lines filtered by purchase filter if chosen
  const displayedAvailableLines = purchaseFilter
    ? availableLines.filter((l) => l.purchase.id === purchaseFilter)
    : availableLines;

  // Selected line object for the add row
  const activeLine = shippableLines.find((line) => line.id === lineId);
  const activeLineMax = activeLine
    ? Number(remainingSupplyQuantity(activeLine.quantity, activeLine.allocatedQuantity))
    : 0;

  const handleLineChange = (newLineId: string) => {
    setLineId(newLineId);
    const line = shippableLines.find((l) => l.id === newLineId);
    if (line) {
      const max = remainingSupplyQuantity(line.quantity, line.allocatedQuantity);
      setQuantity(max);
    } else {
      setQuantity('1');
    }
  };

  const parsedQty = Number(quantity);
  const isQuantityTooHigh = activeLine ? parsedQty > activeLineMax : false;
  const isQuantityInvalid = !activeLine || parsedQty <= 0 || isNaN(parsedQty) || isQuantityTooHigh;

  const handleAddLine = () => {
    if (isQuantityInvalid || !lineId) return;
    setLines([...lines, { purchaseLineId: lineId, quantity: String(parsedQty) }]);
    setLineId('');
    setQuantity('1');
  };

  // Quick-add all lines from selected purchase filter
  const activeFilterPurchase = purchasesWithShippable.find((p) => p.id === purchaseFilter);
  const unaddedLinesForFilter = activeFilterPurchase
    ? availableLines.filter((l) => l.purchase.id === activeFilterPurchase.id)
    : [];

  const handleAddAllFromFilter = () => {
    if (!unaddedLinesForFilter.length) return;
    const newDrafts = unaddedLinesForFilter.map((l) => ({
      purchaseLineId: l.id,
      quantity: remainingSupplyQuantity(l.quantity, l.allocatedQuantity),
    }));
    setLines([...lines, ...newDrafts]);
  };

  // Inline quantity update for lines already in the draft
  const handleUpdateLineQty = (purchaseLineId: string, newQty: string) => {
    setLines(
      lines.map((l) => (l.purchaseLineId === purchaseLineId ? { ...l, quantity: newQty } : l)),
    );
  };

  // Total units and error checking
  const totalUnitsPlanned = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);

  const hasLineErrors = lines.some((line) => {
    const orig = shippableLines.find((l) => l.id === line.purchaseLineId);
    if (!orig) return true;
    const max = Number(remainingSupplyQuantity(orig.quantity, orig.allocatedQuantity));
    const qty = Number(line.quantity);
    return isNaN(qty) || qty <= 0 || qty > max;
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  // Group displayed available lines by purchase for optgroups
  const purchasesToGroup = Array.from(
    new Map(displayedAvailableLines.map((l) => [l.purchase.id, l.purchase])).values(),
  );

  return (
    <form className="grid min-w-0 gap-4" onSubmit={onSubmit}>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <SupplyField
          label="Receiving warehouse"
          hint="The warehouse destination where goods will be counted and stocked into inventory."
        >
          <select
            className={supplySelectClassName}
            name="receivingLocationId"
            required
            value={receivingLocationId}
            onChange={(e) => setReceivingLocationId(e.target.value)}
          >
            <option value="" disabled>
              Choose a receiving warehouse
            </option>
            {receivingLocations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.code}
              </option>
            ))}
          </select>
          {receivingLocations.length === 0 ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              No active location with "Purchase Receiving" capability.
            </p>
          ) : null}
        </SupplyField>

        <SupplyField label="Transport mode" hint="The freight method used to convey this shipment.">
          <select className={supplySelectClassName} name="transportMode" defaultValue="SEA">
            <option value="SEA">Sea Freight (SEA)</option>
            <option value="AIR">Air Freight (AIR)</option>
            <option value="ROAD">Road Freight (ROAD)</option>
            <option value="RAIL">Rail Freight (RAIL)</option>
            <option value="OTHER">Other Freight Mode</option>
          </select>
        </SupplyField>

        <SupplyField
          label="Origin / Dispatch port"
          hint="Port of departure, forwarder facility, or dispatch city."
        >
          <Input name="originText" placeholder="e.g. Guangzhou Consolidation Hub, Ningbo Port" />
        </SupplyField>

        <SupplyField
          label="Tracking / Bill of Lading"
          hint="Master tracking number, container reference, or courier AWB."
        >
          <Input name="trackingReference" placeholder="e.g. B/L #, Container #, or AWB" />
        </SupplyField>

        <SupplyField
          label="Expected arrival"
          hint="Scheduled arrival date at the receiving warehouse."
        >
          <Input name="expectedArrivalDate" type="date" min={todayStr} />
        </SupplyField>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium">Shipment contents</h3>
            <p className="text-xs text-muted-foreground">
              Select placed purchase lines to allocate to this freight shipment.
            </p>
          </div>
          {purchasesWithShippable.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Filter PO:</span>
              <select
                className="h-7 w-auto min-w-36 rounded-md border border-input bg-background px-2 text-xs"
                value={purchaseFilter}
                onChange={(e) => {
                  setPurchaseFilter(e.target.value);
                  setLineId('');
                }}
              >
                <option value="">All Purchases ({availableLines.length} open)</option>
                {purchasesWithShippable.map((p) => {
                  const openCount = availableLines.filter((l) => l.purchase.id === p.id).length;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.purchaseNumber} ({openCount} open)
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}
        </div>

        {activeFilterPurchase && unaddedLinesForFilter.length > 0 ? (
          <div className="flex items-center justify-between rounded-lg bg-muted/70 px-3 py-2 text-xs">
            <span>
              <strong>{activeFilterPurchase.purchaseNumber}</strong> has{' '}
              {unaddedLinesForFilter.length} unallocated{' '}
              {unaddedLinesForFilter.length === 1 ? 'line' : 'lines'}.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-xs font-normal"
              onClick={handleAddAllFromFilter}
            >
              <Sparkles className="size-3 text-amber-500" />
              Add all from PO
            </Button>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <select
            className={supplySelectClassName}
            value={lineId}
            onChange={(e) => handleLineChange(e.target.value)}
            title="Choose an open purchase line"
          >
            <option value="">Choose a purchase line to add...</option>
            {displayedAvailableLines.length === 0 ? (
              <option value="" disabled>
                All lines for this selection are already added
              </option>
            ) : null}
            {purchasesToGroup.map((purchase) => {
              const poLines = displayedAvailableLines.filter((l) => l.purchase.id === purchase.id);
              if (!poLines.length) return null;
              return (
                <optgroup
                  key={purchase.id}
                  label={`${purchase.purchaseNumber} · ${purchase.supplierName}`}
                >
                  {poLines.map((line) => {
                    const openQty = remainingSupplyQuantity(line.quantity, line.allocatedQuantity);
                    return (
                      <option key={line.id} value={line.id}>
                        {line.productTitle} · {line.sku} (Open: {openQty})
                      </option>
                    );
                  })}
                </optgroup>
              );
            })}
          </select>

          <div className="relative flex items-center">
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              min="0.000001"
              max={activeLineMax > 0 ? activeLineMax : undefined}
              step="any"
              placeholder="Quantity"
              disabled={!activeLine}
              className={
                isQuantityTooHigh
                  ? 'border-destructive focus-visible:ring-destructive pr-10'
                  : 'pr-10'
              }
              title={activeLine ? `Open quantity: ${activeLineMax}` : 'Select a line first'}
            />
            {activeLine && activeLineMax > 0 ? (
              <button
                type="button"
                onClick={() => setQuantity(String(activeLineMax))}
                className="absolute right-2 text-[10px] font-semibold text-primary hover:underline"
                title={`Allocate full open quantity (${activeLineMax})`}
              >
                MAX
              </button>
            ) : null}
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={isQuantityInvalid}
            onClick={handleAddLine}
            title="Add this line to shipment"
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {isQuantityTooHigh && activeLine ? (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3 shrink-0" />
            Quantity cannot exceed the open quantity of {activeLineMax}.
          </p>
        ) : null}

        {lines.length > 0 ? (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium">
              <span>
                Allocating {lines.length} {lines.length === 1 ? 'line' : 'lines'} ·{' '}
                {formatSupplyNumber(String(totalUnitsPlanned))} total units
              </span>
              <button
                type="button"
                onClick={() => setLines([])}
                className="text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                Clear all
              </button>
            </div>

            <div className="divide-y rounded-lg border bg-background">
              {lines.map((draftLine) => {
                const orig = shippableLines.find((l) => l.id === draftLine.purchaseLineId);
                const maxOpen = orig
                  ? Number(remainingSupplyQuantity(orig.quantity, orig.allocatedQuantity))
                  : 0;
                const currentQty = Number(draftLine.quantity);
                const isLineInvalid = isNaN(currentQty) || currentQty <= 0 || currentQty > maxOpen;
                return (
                  <div
                    key={draftLine.purchaseLineId}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {orig?.productTitle ?? 'Product line'}
                      </div>
                      <div className="truncate text-muted-foreground">
                        SKU: <span className="font-mono text-foreground/80">{orig?.sku}</span> · PO:{' '}
                        <span className="font-mono text-foreground/80">
                          {orig?.purchase.purchaseNumber}
                        </span>{' '}
                        ({orig?.purchase.supplierName})
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Qty:</span>
                        <Input
                          type="number"
                          min="0.000001"
                          max={maxOpen}
                          step="any"
                          value={draftLine.quantity}
                          onChange={(e) =>
                            handleUpdateLineQty(draftLine.purchaseLineId, e.target.value)
                          }
                          className={`h-7 w-20 px-2 text-xs ${isLineInvalid ? 'border-destructive ring-1 ring-destructive' : ''}`}
                        />
                        <span className="text-muted-foreground">/ {maxOpen}</span>
                      </div>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() =>
                          setLines(
                            lines.filter(
                              (item) => item.purchaseLineId !== draftLine.purchaseLineId,
                            ),
                          )
                        }
                        title="Remove from shipment"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="py-2 text-center text-xs text-muted-foreground italic">
            No purchase lines added to this shipment yet. Choose a line above and click Add.
          </p>
        )}
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button
          type="submit"
          disabled={saving || !lines.length || hasLineErrors || !receivingLocationId}
        >
          {saving ? <Loader2 className="animate-spin size-4" /> : <Ship className="size-4" />} Plan
          shipment
          {lines.length > 0 ? ` (${formatSupplyNumber(String(totalUnitsPlanned))} units)` : ''}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReceiptForm({
  shipments,
  allocations,
  shipmentId,
  setShipmentId,
  lines,
  setLines,
  onSubmit,
  saving,
}: {
  shipments: readonly InboundShipmentDto[];
  allocations: readonly (InboundShipmentDto['allocations'][number] & {
    shipment: InboundShipmentDto;
  })[];
  shipmentId: string;
  setShipmentId: (id: string) => void;
  lines: ReceiptDraftLine[];
  setLines: (lines: ReceiptDraftLine[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  const conditions = ['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION'] as const;
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('shipment');
    if (selected && shipments.some((item) => item.id === selected)) setShipmentId(selected);
  }, [shipments, setShipmentId]);

  const quantityFor = (allocationId: string, condition: string) =>
    lines.find((line) => line.shipmentAllocationId === allocationId && line.condition === condition)
      ?.quantity ?? '';
  const updateQuantity = (allocationId: string, condition: string, quantity: string) => {
    const without = lines.filter(
      (line) => !(line.shipmentAllocationId === allocationId && line.condition === condition),
    );
    setLines(
      Number(quantity) > 0
        ? [...without, { shipmentAllocationId: allocationId, condition, quantity }]
        : without,
    );
  };
  const countFor = (allocationId: string) =>
    lines
      .filter((line) => line.shipmentAllocationId === allocationId)
      .reduce((total, line) => total + (Number(line.quantity) || 0), 0);
  const overCounted = allocations.some(
    (allocation) =>
      countFor(allocation.id) >
      Number(remainingSupplyQuantity(allocation.allocatedQuantity, allocation.receivedQuantity)),
  );
  const totalExpected = allocations.reduce(
    (total, allocation) =>
      total +
      Number(remainingSupplyQuantity(allocation.allocatedQuantity, allocation.receivedQuantity)),
    0,
  );
  const totalCounted = lines.reduce((total, line) => total + (Number(line.quantity) || 0), 0);

  if (!shipments.length) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <PackageCheck className="size-8 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">Nothing is ready to receive</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            A shipment must be marked arrived before its physical count can be posted.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/inbound-shipments" />}>
          View shipments
        </Button>
      </div>
    );
  }

  return (
    <form className="grid min-w-0 gap-4" onSubmit={onSubmit}>
      <SupplyField label="Arrived shipment">
        <select
          className={supplySelectClassName}
          value={shipmentId}
          onChange={(event) => {
            setShipmentId(event.target.value);
            setLines([]);
          }}
          required
        >
          <option value="" disabled>
            Choose a shipment to count
          </option>
          {shipments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.shipmentNumber} · {item.receivingLocationName}
            </option>
          ))}
        </select>
      </SupplyField>
      <div className="overflow-hidden rounded-xl border">
        <div className="flex flex-col gap-2 border-b bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-medium">Physical count</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Enter each item by condition. Leave a field blank when none arrived in that condition.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!allocations.length}
            onClick={() =>
              setLines(
                allocations.map((allocation) => ({
                  shipmentAllocationId: allocation.id,
                  condition: 'SELLABLE',
                  quantity: remainingSupplyQuantity(
                    allocation.allocatedQuantity,
                    allocation.receivedQuantity,
                  ),
                })),
              )
            }
          >
            <Check /> Receive all as sellable
          </Button>
        </div>
        <div className="divide-y">
          {allocations.map((allocation) => {
            const remaining = Number(
              remainingSupplyQuantity(allocation.allocatedQuantity, allocation.receivedQuantity),
            );
            const counted = countFor(allocation.id);
            const invalid = counted > remaining;
            return (
              <div className="grid gap-3 p-4" key={allocation.id}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{allocation.productTitle}</p>
                    <p className="font-mono text-xs text-muted-foreground">{allocation.sku}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Expected now{' '}
                    <strong className="text-foreground">
                      {formatSupplyNumber(String(remaining))}
                    </strong>
                    {Number(allocation.receivedQuantity) > 0
                      ? ` · ${formatSupplyNumber(allocation.receivedQuantity)} received earlier`
                      : ''}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {conditions.map((item) => (
                    <label className="grid gap-1 text-xs font-medium" key={item}>
                      {item.charAt(0) + item.slice(1).toLowerCase()}
                      <Input
                        aria-label={`${allocation.productTitle} ${item.toLowerCase()} quantity`}
                        className={invalid ? 'border-destructive' : undefined}
                        min="0"
                        step="0.000001"
                        type="number"
                        value={quantityFor(allocation.id, item)}
                        onChange={(event) =>
                          updateQuantity(allocation.id, item, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
                <div
                  className={`flex justify-between text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  <span>
                    {invalid
                      ? 'Count exceeds the remaining shipment quantity.'
                      : counted < remaining
                        ? `${formatSupplyNumber(String(remaining - counted))} not counted in this session`
                        : 'Expected quantity fully counted'}
                  </span>
                  <strong>
                    {formatSupplyNumber(String(counted))} / {formatSupplyNumber(String(remaining))}
                  </strong>
                </div>
              </div>
            );
          })}
          {!allocations.length && shipmentId ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Every item in this shipment has already been received.
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <SupplyField label="Packing slip reference">
          <Input name="packingSlipReference" />
        </SupplyField>
        <SupplyField label="Receiving note">
          <Input name="notes" placeholder="Shortage, damage, or package note" />
        </SupplyField>
      </div>
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
        {totalCounted < totalExpected
          ? `This will be a partial receipt. ${formatSupplyNumber(String(totalExpected - totalCounted))} units will remain open for another receiving session.`
          : 'Check the count before posting. Posted receipts are permanent Inventory evidence.'}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={saving || !lines.length || overCounted}>
          {saving ? <Loader2 className="animate-spin" /> : <PackageCheck />} Post receipt
        </Button>
      </DialogFooter>
    </form>
  );
}
