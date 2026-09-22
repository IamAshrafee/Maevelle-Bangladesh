'use client';

import { useState } from 'react';
import { Coins, HelpCircle, Loader2, PlusCircle } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SupplyField, supplySelectClassName } from '@/components/supply/supply-field';
import type { AddCostComponentDialogProps } from '../types';

const COST_TYPES = [
  { value: 'INTERNATIONAL_FREIGHT', label: 'International Freight (Ocean / Air Cargo)' },
  { value: 'LOCAL_FREIGHT', label: 'Local Freight (Inland Trucking / Courier)' },
  { value: 'CUSTOMS_DUTY', label: 'Customs Duty / Tariffs' },
  { value: 'TAX_OR_IMPORT_FEE', label: 'Tax or Import Fee (AIT / VAT / Surcharge)' },
  { value: 'FORWARDER_FEE', label: 'Forwarder / C&F Broker Fee' },
  { value: 'HANDLING', label: 'Port & Terminal Handling Charges' },
  { value: 'INSURANCE', label: 'Marine / Cargo Transit Insurance' },
  { value: 'OTHER_ACQUISITION_COST', label: 'Other Acquisition Cost' },
];

const ALLOCATION_METHODS = [
  {
    value: 'PURCHASE_VALUE',
    label: 'Purchase Value (Pro-rata by PO amount)',
    hint: 'Best for customs duty, import VAT, and insurance where cost scales with commercial invoice value.',
  },
  {
    value: 'QUANTITY',
    label: 'Quantity (Even split per unit)',
    hint: 'Best for fixed per-unit customs entry, inspection, or handling fees.',
  },
  {
    value: 'EQUAL',
    label: 'Equal (Even split per line item)',
    hint: 'Splits the cost evenly across all distinct product line items.',
  },
  {
    value: 'WEIGHT',
    label: 'Weight (Pro-rata by weight)',
    hint: 'Requires weight metadata on shipment items.',
  },
  {
    value: 'VOLUME',
    label: 'Volume (Pro-rata by volume / CBM)',
    hint: 'Requires volume metadata on shipment items.',
  },
];

export function AddCostComponentDialog({
  open,
  onOpenChange,
  worksheet,
  shipment,
  onAddComponent,
  saving,
}: AddCostComponentDialogProps) {
  const [costType, setCostType] = useState('INTERNATIONAL_FREIGHT');
  const [scope, setScope] = useState<'GLOBAL' | 'DIRECT'>('GLOBAL');
  const [directAllocationId, setDirectAllocationId] = useState(shipment.allocations[0]?.id ?? '');
  const [allocationMethod, setAllocationMethod] = useState<
    'PURCHASE_VALUE' | 'QUANTITY' | 'EQUAL' | 'WEIGHT' | 'VOLUME' | 'DIRECT'
  >('PURCHASE_VALUE');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState(worksheet.base_currency_code);
  const [fxRate, setFxRate] = useState('');
  const [reference, setReference] = useState('');
  const [valueStatus, setValueStatus] = useState<'ESTIMATED' | 'ACTUAL' | 'CREDIT'>('ACTUAL');
  const [notes, setNotes] = useState('');

  const isCrossCurrency = currencyCode.toUpperCase() !== worksheet.base_currency_code.toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    if (isCrossCurrency && (!fxRate || Number(fxRate) <= 0)) return;

    await onAddComponent({
      costType,
      scope,
      directShipmentAllocationId: scope === 'DIRECT' ? directAllocationId : undefined,
      allocationMethod: scope === 'DIRECT' ? 'DIRECT' : allocationMethod,
      originalAmount: amount,
      originalCurrencyCode: currencyCode.trim().toUpperCase(),
      fxRate: isCrossCurrency ? fxRate : undefined,
      reference: reference.trim() || undefined,
      valueStatus,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight">
            Add Landed Cost Component
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Record a freight, duty, or handling expense. The server will apportion this cost across
            the received items of {shipment.shipmentNumber}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cost Type and Scope */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SupplyField label="Expense Category">
              <select
                className={supplySelectClassName}
                value={costType}
                onChange={(e) => setCostType(e.target.value)}
                disabled={saving}
              >
                {COST_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </SupplyField>

            <SupplyField label="Distribution Scope">
              <select
                className={supplySelectClassName}
                value={scope}
                onChange={(e) => setScope(e.target.value as 'GLOBAL' | 'DIRECT')}
                disabled={saving}
              >
                <option value="GLOBAL">Across all received items</option>
                <option value="DIRECT">Direct to one specific item</option>
              </select>
            </SupplyField>
          </div>

          {/* Direct Allocation Selector if scope is DIRECT */}
          {scope === 'DIRECT' ? (
            <SupplyField label="Target Cargo Item">
              <select
                className={supplySelectClassName}
                value={directAllocationId}
                onChange={(e) => setDirectAllocationId(e.target.value)}
                disabled={saving}
                required
              >
                {shipment.allocations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.productTitle} ({a.sku}) · {a.receivedQuantity} received
                  </option>
                ))}
              </select>
            </SupplyField>
          ) : (
            /* Allocation Method selector if scope is GLOBAL */
            <SupplyField label="Allocation Method">
              <select
                className={supplySelectClassName}
                value={allocationMethod}
                onChange={(e) =>
                  setAllocationMethod(
                    e.target.value as 'PURCHASE_VALUE' | 'QUANTITY' | 'EQUAL' | 'WEIGHT' | 'VOLUME',
                  )
                }
                disabled={saving}
              >
                {ALLOCATION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ALLOCATION_METHODS.find((m) => m.value === allocationMethod)?.hint}
              </p>
            </SupplyField>
          )}

          {/* Amount and Currency */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SupplyField label="Expense Amount">
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={saving}
                className="text-xs"
              />
            </SupplyField>

            <SupplyField label="Currency Code">
              <Input
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                placeholder="BDT, USD, CNY..."
                maxLength={3}
                required
                disabled={saving}
                className="font-mono text-xs uppercase"
              />
            </SupplyField>
          </div>

          {/* Cross Currency FX Rate warning & field */}
          {isCrossCurrency ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Cross-Currency Conversion: {currencyCode} → {worksheet.base_currency_code}
              </p>
              <div className="mt-2">
                <SupplyField label={`Exchange Rate (1 ${currencyCode} = X ${worksheet.base_currency_code})`}>
                  <Input
                    type="number"
                    step="0.000000000001"
                    min="0.000000000001"
                    placeholder="e.g. 121.50"
                    value={fxRate}
                    onChange={(e) => setFxRate(e.target.value)}
                    required
                    disabled={saving}
                    className="text-xs font-mono"
                  />
                </SupplyField>
              </div>
            </div>
          ) : null}

          {/* Document Reference & Value Status */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SupplyField label="Document / Invoice / AWB Reference #">
              <Input
                placeholder="e.g. BL-984102 or INV-DHL-2026"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={saving}
                className="text-xs"
              />
            </SupplyField>

            <SupplyField label="Value Status">
              <select
                className={supplySelectClassName}
                value={valueStatus}
                onChange={(e) =>
                  setValueStatus(e.target.value as 'ESTIMATED' | 'ACTUAL' | 'CREDIT')
                }
                disabled={saving}
              >
                <option value="ACTUAL">Actual (Invoiced Amount)</option>
                <option value="ESTIMATED">Estimated (Provisional Quote)</option>
                <option value="CREDIT">Supplier Credit / Rebate</option>
              </select>
            </SupplyField>
          </div>

          {/* Notes */}
          <SupplyField label="Notes (Optional)">
            <Textarea
              placeholder="Vendor notes, port tariff details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={saving}
              className="text-xs"
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
            <Button type="submit" disabled={saving || !amount} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
              <span>{saving ? 'Adding component...' : 'Add Cost Component'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
