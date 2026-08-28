'use client';

import { Check, Loader2, PackageCheck, Plus, Ship, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type {
  InboundShipmentDto,
  PurchaseDto,
  SupplierDto,
  SupplierStatusDto,
  SupplierTypeDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { SupplyField } from '@/components/supply/supply-field';
import { Button } from '@/components/ui/button';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { remainingSupplyQuantity } from '@/lib/supply/api';
import {
  isPurchaseDestination,
  isShipmentReceivingLocation,
} from '@/lib/supply/location-options';
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
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SupplyField label="Supplier name">
          <Input name="name" defaultValue={supplier?.name} autoComplete="organization" required />
        </SupplyField>
        {supplier ? (
          <SupplyField
            label="Status"
            hint="Inactive stops normal new use. Blocked signals a stronger restriction."
          >
            <select
              className="h-8 rounded-lg border bg-background px-2.5 text-sm"
              name="status"
              defaultValue={supplier.status}
            >
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
            className="h-8 rounded-lg border bg-background px-2.5 text-sm"
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
            className="h-8 rounded-lg border bg-background px-2.5 text-sm"
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
  onSubmit,
  saving,
}: {
  suppliers: readonly SupplierDto[];
  locations: readonly WarehouseLocationDto[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  const params =
    typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search);
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SupplyField label="Supplier">
          <select
            className="h-8 rounded-lg border bg-background px-2.5 text-sm"
            name="supplierId"
            required
            defaultValue={params?.get('supplier') ?? ''}
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
        </SupplyField>
        <SupplyField label="Purchase currency">
          <select
            className="h-8 rounded-lg border bg-background px-2.5 text-sm"
            name="currencyCode"
            defaultValue="CNY"
          >
            <option>BDT</option>
            <option>CNY</option>
            <option>USD</option>
          </select>
        </SupplyField>
        <SupplyField
          label="Supplier reference"
          hint="The supplier’s order number, if they gave one."
        >
          <Input name="supplierReference" />
        </SupplyField>
        <SupplyField label="Order date">
          <Input
            name="orderDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </SupplyField>
        <SupplyField label="Expected date">
          <Input name="expectedDate" type="date" />
        </SupplyField>
        <SupplyField label="Expected warehouse">
          <select
            className="h-8 rounded-lg border bg-background px-2.5 text-sm"
            name="destinationLocationId"
            defaultValue=""
          >
            <option value="">Choose later</option>
            {locations
              .filter(isPurchaseDestination)
              .map((item) => (
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
          placeholder="Terms, packing request, or anything the buyer should remember"
        />
      </SupplyField>
      <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        This creates a draft. Add product lines from its row, then place it after checking the
        total.
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button
          type="submit"
          disabled={saving || !suppliers.some((item) => item.status === 'ACTIVE')}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Plus />} Create draft
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
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SupplyField label="Receiving warehouse">
          <select
            className="h-8 rounded-lg border bg-background px-2.5 text-sm"
            name="receivingLocationId"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Choose a receiving warehouse
            </option>
            {locations
              .filter(isShipmentReceivingLocation)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.code}
                </option>
              ))}
          </select>
        </SupplyField>
        <SupplyField label="Transport">
          <select
            className="h-8 rounded-lg border bg-background px-2.5 text-sm"
            name="transportMode"
            defaultValue="SEA"
          >
            <option value="AIR">Air</option>
            <option value="SEA">Sea</option>
            <option value="ROAD">Road</option>
            <option value="RAIL">Rail</option>
            <option value="OTHER">Other</option>
          </select>
        </SupplyField>
        <SupplyField label="Origin">
          <Input name="originText" placeholder="Guangzhou consolidation hub" />
        </SupplyField>
        <SupplyField label="Tracking reference">
          <Input name="trackingReference" />
        </SupplyField>
        <SupplyField label="Expected arrival">
          <Input name="expectedArrivalDate" type="date" />
        </SupplyField>
      </div>
      <div className="rounded-xl border p-4">
        <h3 className="font-medium">Shipment contents</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Combine open lines from several purchases or suppliers.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
          <select
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={lineId}
            onChange={(event) => setLineId(event.target.value)}
            title="Choose an open purchase line"
          >
            <option value="">Choose a purchase line</option>
            {shippableLines
              .filter((line) => !lines.some((selected) => selected.purchaseLineId === line.id))
              .map((line) => (
                <option key={line.id} value={line.id}>
                  {line.purchase.purchaseNumber} · {line.productTitle} · {line.sku} · open{' '}
                  {remainingSupplyQuantity(line.quantity, line.allocatedQuantity)}
                </option>
              ))}
          </select>
          <Input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            type="number"
            min="0.000001"
            step="0.000001"
            title="Quantity to add"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!lineId || Number(quantity) <= 0}
            onClick={() => {
              setLines([...lines, { purchaseLineId: lineId, quantity }]);
              setLineId('');
              setQuantity('1');
            }}
            title="Add this line"
          >
            <Plus /> Add
          </Button>
        </div>
        <div className="mt-3 grid gap-2">
          {lines.map((line) => {
            const choice = shippableLines.find((item) => item.id === line.purchaseLineId);
            return (
              <div
                className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm"
                key={line.purchaseLineId}
              >
                <span>
                  {choice?.purchase.purchaseNumber} · {choice?.productTitle} · {choice?.sku} · qty{' '}
                  {line.quantity}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() =>
                    setLines(lines.filter((item) => item.purchaseLineId !== line.purchaseLineId))
                  }
                  title="Remove from shipment"
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          {!lines.length ? (
            <p className="text-sm text-muted-foreground">No purchase lines added yet.</p>
          ) : null}
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={saving || !lines.length}>
          {saving ? <Loader2 className="animate-spin" /> : <Ship />} Plan shipment
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
  const [allocationId, setAllocationId] = useState('');
  const [condition, setCondition] = useState('SELLABLE');
  const [quantity, setQuantity] = useState('1');
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('shipment');
    if (selected && shipments.some((item) => item.id === selected)) setShipmentId(selected);
  }, [shipments, setShipmentId]);
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <SupplyField label="Arrived shipment">
        <select
          className="h-8 rounded-lg border bg-background px-2.5 text-sm"
          value={shipmentId}
          onChange={(event) => {
            setShipmentId(event.target.value);
            setLines([]);
            setAllocationId('');
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
      <div className="rounded-xl border p-4">
        <h3 className="font-medium">Physical count</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Add separate rows when one product arrived in different conditions.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_7rem_auto]">
          <select
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={allocationId}
            onChange={(event) => setAllocationId(event.target.value)}
            title="Choose a shipment line"
          >
            <option value="">Choose a shipment line</option>
            {allocations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.productTitle} · {item.sku} · remaining{' '}
                {remainingSupplyQuantity(item.allocatedQuantity, item.receivedQuantity)}
              </option>
            ))}
          </select>
          <select
            className="h-8 rounded-lg border bg-background px-2 text-sm"
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            title="Actual condition"
          >
            <option value="SELLABLE">Sellable</option>
            <option value="DAMAGED">Damaged</option>
            <option value="QUARANTINE">Quarantine</option>
            <option value="INSPECTION">Inspection</option>
          </select>
          <Input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            type="number"
            min="0.000001"
            step="0.000001"
            title="Counted quantity"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!allocationId || Number(quantity) <= 0}
            onClick={() => {
              setLines([...lines, { shipmentAllocationId: allocationId, condition, quantity }]);
              setQuantity('1');
            }}
            title="Add counted quantity"
          >
            <Plus /> Add
          </Button>
        </div>
        <div className="mt-3 grid gap-2">
          {lines.map((line, index) => {
            const choice = allocations.find((item) => item.id === line.shipmentAllocationId);
            return (
              <div
                className="flex items-center justify-between rounded-lg bg-muted p-2 text-sm"
                key={`${line.shipmentAllocationId}-${line.condition}-${index}`}
              >
                <span>
                  {choice?.productTitle} · {choice?.sku} · {line.quantity}{' '}
                  {line.condition.toLowerCase()}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setLines(lines.filter((_, itemIndex) => itemIndex !== index))}
                  title="Remove this count"
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          {!lines.length ? (
            <p className="text-sm text-muted-foreground">No counted lines added yet.</p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SupplyField label="Packing slip reference">
          <Input name="packingSlipReference" />
        </SupplyField>
        <SupplyField label="Receiving note">
          <Input name="notes" placeholder="Shortage, damage, or package note" />
        </SupplyField>
      </div>
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
        Check the count before posting. Posted receipts are permanent evidence.
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={saving || !lines.length}>
          {saving ? <Loader2 className="animate-spin" /> : <PackageCheck />} Post receipt
        </Button>
      </DialogFooter>
    </form>
  );
}
