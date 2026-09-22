'use client';

import { Building2, Clock, CreditCard, Mail, User } from 'lucide-react';
import type { SupplierDto, WarehouseLocationDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { isPurchaseDestination } from '@/lib/supply/location-options';

export interface PurchaseFormFieldsProps {
  readonly suppliers: readonly SupplierDto[];
  readonly locations: readonly WarehouseLocationDto[];
  readonly supplierId: string;
  readonly onSupplierChange: (id: string) => void;
  readonly currencyCode: 'BDT' | 'CNY' | 'USD';
  readonly onCurrencyChange: (currency: 'BDT' | 'CNY' | 'USD') => void;
  readonly orderDate: string;
  readonly onOrderDateChange: (date: string) => void;
  readonly expectedDate: string;
  readonly onExpectedDateChange: (date: string) => void;
  readonly destinationLocationId: string;
  readonly onDestinationLocationChange: (id: string) => void;
  readonly supplierReference: string;
  readonly onSupplierReferenceChange: (ref: string) => void;
  readonly notes: string;
  readonly onNotesChange: (notes: string) => void;
  readonly commercialFieldsLocked?: boolean;
  readonly disabled?: boolean;
}

export function PurchaseFormFields({
  suppliers,
  locations,
  supplierId,
  onSupplierChange,
  currencyCode,
  onCurrencyChange,
  orderDate,
  onOrderDateChange,
  expectedDate,
  onExpectedDateChange,
  destinationLocationId,
  onDestinationLocationChange,
  supplierReference,
  onSupplierReferenceChange,
  notes,
  onNotesChange,
  commercialFieldsLocked = false,
  disabled = false,
}: PurchaseFormFieldsProps) {
  const selectedSupplier = suppliers.find((item) => item.id === supplierId);
  const isDateInvalid = Boolean(orderDate && expectedDate && expectedDate < orderDate);
  const activeSuppliers = suppliers.filter((item) => item.status === 'ACTIVE');
  const destinationLocations = locations.filter(isPurchaseDestination);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Supplier Field */}
        <Field>
          <FieldLabel htmlFor="purchase-supplier">Supplier</FieldLabel>
          <NativeSelect
            id="purchase-supplier"
            name="supplierId"
            value={supplierId}
            disabled={commercialFieldsLocked || disabled}
            required
            className="w-full"
            onChange={(e) => {
              const newId = e.target.value;
              onSupplierChange(newId);
              const found = suppliers.find((s) => s.id === newId);
              if (found?.preferredCurrencyCode && !commercialFieldsLocked) {
                onCurrencyChange(found.preferredCurrencyCode);
              }
              if (found?.leadTimeDays && orderDate) {
                const date = new Date(orderDate);
                if (!Number.isNaN(date.getTime())) {
                  date.setDate(date.getDate() + found.leadTimeDays);
                  onExpectedDateChange(date.toISOString().slice(0, 10));
                }
              }
            }}
          >
            <NativeSelectOption value="" disabled>
              {activeSuppliers.length ? 'Choose an active supplier' : 'No active suppliers'}
            </NativeSelectOption>
            {activeSuppliers.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name} · {item.code}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {commercialFieldsLocked && (
            <input type="hidden" name="supplierId" value={supplierId} />
          )}
          <FieldDescription>
            {commercialFieldsLocked
              ? 'Supplier is locked because purchase lines already exist.'
              : 'Vendors with ACTIVE status ready for procurement.'}
          </FieldDescription>
        </Field>

        {/* Currency Field */}
        <Field>
          <FieldLabel htmlFor="purchase-currency">Purchase currency</FieldLabel>
          <NativeSelect
            id="purchase-currency"
            name="currencyCode"
            value={currencyCode}
            disabled={commercialFieldsLocked || disabled}
            className="w-full"
            onChange={(e) =>
              onCurrencyChange(e.target.value as 'BDT' | 'CNY' | 'USD')
            }
          >
            <NativeSelectOption value="BDT">BDT · Bangladeshi Taka</NativeSelectOption>
            <NativeSelectOption value="CNY">CNY · Chinese Yuan</NativeSelectOption>
            <NativeSelectOption value="USD">USD · US Dollar</NativeSelectOption>
          </NativeSelect>
          {commercialFieldsLocked && (
            <input type="hidden" name="currencyCode" value={currencyCode} />
          )}
          <FieldDescription>
            Currency used for supplier pricing and accounts payable.
          </FieldDescription>
        </Field>
      </div>

      {/* Supplier Context Card */}
      {selectedSupplier && (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Building2 className="size-3.5 text-primary" />
              {selectedSupplier.name} ({selectedSupplier.code})
            </span>
            {selectedSupplier.preferredCurrencyCode && (
              <Badge variant="outline" className="gap-1 text-[11px]">
                <CreditCard className="size-3" />
                Prefers {selectedSupplier.preferredCurrencyCode}
              </Badge>
            )}
            {selectedSupplier.leadTimeDays ? (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Clock className="size-3" />
                {selectedSupplier.leadTimeDays}d lead time
              </Badge>
            ) : null}
            {selectedSupplier.paymentTerms && (
              <Badge variant="outline" className="gap-1 text-[11px]">
                Terms: {selectedSupplier.paymentTerms}
              </Badge>
            )}
            {selectedSupplier.contactName && (
              <span className="flex items-center gap-1">
                <User className="size-3" />
                {selectedSupplier.contactName}
              </span>
            )}
            {selectedSupplier.contactEmail && (
              <span className="flex items-center gap-1">
                <Mail className="size-3" />
                {selectedSupplier.contactEmail}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Order & Expected Dates */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={isDateInvalid}>
          <FieldLabel htmlFor="purchase-order-date">Order date</FieldLabel>
          <Input
            id="purchase-order-date"
            name="orderDate"
            type="date"
            value={orderDate}
            disabled={disabled}
            required
            onChange={(e) => {
              const newDate = e.target.value;
              onOrderDateChange(newDate);
              if (selectedSupplier?.leadTimeDays && newDate) {
                const date = new Date(newDate);
                if (!Number.isNaN(date.getTime())) {
                  date.setDate(date.getDate() + selectedSupplier.leadTimeDays);
                  onExpectedDateChange(date.toISOString().slice(0, 10));
                }
              }
            }}
          />
          <FieldDescription>Date purchase order is placed or issued.</FieldDescription>
        </Field>

        <Field data-invalid={isDateInvalid}>
          <FieldLabel htmlFor="purchase-expected-date">Expected delivery</FieldLabel>
          <Input
            id="purchase-expected-date"
            name="expectedDate"
            type="date"
            value={expectedDate}
            disabled={disabled}
            aria-invalid={isDateInvalid}
            onChange={(e) => onExpectedDateChange(e.target.value)}
          />
          {isDateInvalid ? (
            <FieldError>Expected delivery date cannot be before order date.</FieldError>
          ) : (
            <FieldDescription>
              {selectedSupplier?.leadTimeDays
                ? `Calculated with ${selectedSupplier.leadTimeDays}d supplier lead time.`
                : 'Estimated arrival at warehouse.'}
            </FieldDescription>
          )}
        </Field>
      </div>

      {/* Warehouse Destination & Supplier Reference */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="purchase-destination">Expected warehouse</FieldLabel>
          <NativeSelect
            id="purchase-destination"
            name="destinationLocationId"
            value={destinationLocationId}
            disabled={disabled}
            className="w-full"
            onChange={(e) => onDestinationLocationChange(e.target.value)}
          >
            <NativeSelectOption value="">Choose destination warehouse</NativeSelectOption>
            {destinationLocations.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name} · {item.code}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>Target warehouse for this purchase order.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="purchase-reference">Supplier reference</FieldLabel>
          <Input
            id="purchase-reference"
            name="supplierReference"
            placeholder="e.g. PO-2026-081 or vendor quote"
            value={supplierReference}
            disabled={disabled}
            onChange={(e) => onSupplierReferenceChange(e.target.value)}
          />
          <FieldDescription>Vendor reference, quote, or external order number.</FieldDescription>
        </Field>
      </div>

      {/* Internal Notes */}
      <Field>
        <FieldLabel htmlFor="purchase-notes">Internal notes</FieldLabel>
        <Textarea
          id="purchase-notes"
          name="notes"
          placeholder="Terms, packaging instructions, freight specifications, or notes for receiving..."
          value={notes}
          disabled={disabled}
          rows={3}
          onChange={(e) => onNotesChange(e.target.value)}
        />
        <FieldDescription>
          Notes for internal procurement and warehouse operations.
        </FieldDescription>
      </Field>
    </div>
  );
}
