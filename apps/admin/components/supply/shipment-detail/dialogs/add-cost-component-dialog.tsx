'use client';

import { useEffect, useState } from 'react';
import { Link2, Loader2, PlusCircle, ReceiptText, Truck } from 'lucide-react';
import type { ApiEnvelope, FinanceExpenseDto, PaginatedResultDto } from '@maevelle/contracts';
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
import { Textarea } from '@/components/ui/textarea';
import { SupplyField } from '@/components/supply/supply-field';
import { supplyRequest } from '@/lib/supply/api';
import type { AddCostComponentDialogProps } from '../types';

const COST_TYPES = [
  { value: 'CHINA_LOCAL_COURIER', label: 'China Local Courier (Seller → China Warehouse)' },
  { value: 'INTERNATIONAL_FREIGHT', label: 'International Freight (Ocean / Air Cargo)' },
  { value: 'LOCAL_FREIGHT', label: 'Local Freight (Inland Trucking / Courier)' },
  { value: 'BANGLADESH_DELIVERY', label: 'Bangladesh Delivery (Warehouse → Maevelle)' },
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
  const [financeExpenseId, setFinanceExpenseId] = useState('');
  const [expenses, setExpenses] = useState<readonly FinanceExpenseDto[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingExpenses(true);
    void supplyRequest<ApiEnvelope<PaginatedResultDto<FinanceExpenseDto>>>(
      `/admin/finance/expenses?sourceDomain=inbound_shipment.shipment&sourceId=${encodeURIComponent(shipment.id)}&status=RECORDED&pageSize=100`,
    )
      .then((response) => {
        if (active) setExpenses(response.data.items);
      })
      .catch(() => {
        if (active) setExpenses([]);
      })
      .finally(() => {
        if (active) setLoadingExpenses(false);
      });
    return () => {
      active = false;
    };
  }, [open, shipment.id]);

  const isCrossCurrency = currencyCode.toUpperCase() !== worksheet.base_currency_code.toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) === 0) return;
    if (valueStatus === 'CREDIT' ? Number(amount) >= 0 : Number(amount) <= 0) return;
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
      financeExpenseId: financeExpenseId || undefined,
      valueStatus,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SupplyTaskDialogContent className="max-h-[92vh] max-w-xl overflow-y-auto sm:max-w-xl">
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
          {shipment.reportedFreightAmount ? (
            <div className="flex flex-col gap-3 rounded-lg border border-info/30 bg-info/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-2.5">
                <Truck className="mt-0.5 size-4 shrink-0 text-info" />
                <div>
                  <p className="text-xs font-semibold">Shipment-reported freight available</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {shipment.reportedFreightAmount} {shipment.currencyCode}
                    </span>
                    {shipment.chargeableWeight
                      ? ` · ${shipment.chargeableWeight} ${shipment.weightUnit ?? ''}`
                      : ''}
                    {shipment.freightRate
                      ? ` at ${shipment.freightRate} ${shipment.currencyCode}`
                      : ''}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setCostType('INTERNATIONAL_FREIGHT');
                  setAmount(shipment.reportedFreightAmount ?? '');
                  setCurrencyCode(shipment.currencyCode);
                  setReference(shipment.providerReference ?? shipment.trackingReference ?? '');
                  setValueStatus('ACTUAL');
                }}
                disabled={saving}
              >
                Use amount
              </Button>
            </div>
          ) : null}

          <SupplyField label="Finance Expense Evidence (Optional)">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <NativeSelect
                name="financeExpenseId"
                className="pl-8"
                value={financeExpenseId}
                onChange={(event) => {
                  const id = event.target.value;
                  setFinanceExpenseId(id);
                  const expense = expenses.find((candidate) => candidate.id === id);
                  if (!expense) return;
                  setAmount(expense.amount);
                  setCurrencyCode(expense.currency_code);
                  setReference(expense.external_reference ?? expense.expense_number);
                  setValueStatus('ACTUAL');
                }}
                disabled={saving || loadingExpenses}
              >
                <NativeSelectOption value="">
                  {loadingExpenses ? 'Loading shipment expenses…' : 'No linked Finance expense'}
                </NativeSelectOption>
                {expenses.map((expense) => (
                  <NativeSelectOption key={expense.id} value={expense.id}>
                    {expense.expense_number} · {expense.description} · {expense.amount}{' '}
                    {expense.currency_code}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ReceiptText className="size-3" /> Linking preserves the payable and payment evidence
              behind this inventory cost.
            </p>
          </SupplyField>
          {/* Cost Type and Scope */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SupplyField label="Expense Category">
              <NativeSelect
                name="costType"
                value={costType}
                onChange={(e) => setCostType(e.target.value)}
                disabled={saving}
              >
                {COST_TYPES.map((type) => (
                  <NativeSelectOption key={type.value} value={type.value}>
                    {type.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </SupplyField>

            <SupplyField label="Distribution Scope">
              <NativeSelect
                name="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as 'GLOBAL' | 'DIRECT')}
                disabled={saving}
              >
                <NativeSelectOption value="GLOBAL">Across all received items</NativeSelectOption>
                <NativeSelectOption value="DIRECT">Direct to one specific item</NativeSelectOption>
              </NativeSelect>
            </SupplyField>
          </div>

          {/* Direct Allocation Selector if scope is DIRECT */}
          {scope === 'DIRECT' ? (
            <SupplyField label="Target Cargo Item">
              <NativeSelect
                name="directAllocationId"
                value={directAllocationId}
                onChange={(e) => setDirectAllocationId(e.target.value)}
                disabled={saving}
                required
              >
                {shipment.allocations.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.productTitle} ({a.sku}) · {a.receivedQuantity} received
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </SupplyField>
          ) : (
            /* Allocation Method selector if scope is GLOBAL */
            <SupplyField label="Allocation Method">
              <NativeSelect
                name="allocationMethod"
                value={allocationMethod}
                onChange={(e) =>
                  setAllocationMethod(
                    e.target.value as 'PURCHASE_VALUE' | 'QUANTITY' | 'EQUAL' | 'WEIGHT' | 'VOLUME',
                  )
                }
                disabled={saving}
              >
                {ALLOCATION_METHODS.map((m) => (
                  <NativeSelectOption key={m.value} value={m.value}>
                    {m.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ALLOCATION_METHODS.find((m) => m.value === allocationMethod)?.hint}
              </p>
            </SupplyField>
          )}

          {/* Amount and Currency */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SupplyField label="Expense Amount">
              <Input
                name="amount"
                type="number"
                step="0.0001"
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
                name="currencyCode"
                autoComplete="off"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                placeholder="BDT, USD, CNY…"
                maxLength={3}
                required
                disabled={saving}
                className="font-mono text-xs uppercase"
              />
            </SupplyField>
          </div>

          {/* Cross Currency FX Rate warning & field */}
          {isCrossCurrency ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
              <p className="font-semibold text-warning">
                Cross-Currency Conversion: {currencyCode} → {worksheet.base_currency_code}
              </p>
              <div className="mt-2">
                <SupplyField
                  label={`Exchange Rate (1 ${currencyCode} = X ${worksheet.base_currency_code})`}
                >
                  <Input
                    name="exchangeRate"
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
                name="reference"
                autoComplete="off"
                placeholder="e.g. BL-984102 or INV-DHL-2026"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={saving}
                className="text-xs"
              />
            </SupplyField>

            <SupplyField label="Value Status">
              <NativeSelect
                name="valueStatus"
                value={valueStatus}
                onChange={(e) =>
                  setValueStatus(e.target.value as 'ESTIMATED' | 'ACTUAL' | 'CREDIT')
                }
                disabled={saving}
              >
                <NativeSelectOption value="ACTUAL">Actual (Invoiced Amount)</NativeSelectOption>
                <NativeSelectOption value="ESTIMATED">
                  Estimated (Provisional Quote)
                </NativeSelectOption>
                <NativeSelectOption value="CREDIT">Supplier Credit / Rebate</NativeSelectOption>
              </NativeSelect>
            </SupplyField>
          </div>

          {/* Notes */}
          <SupplyField label="Notes (Optional)">
            <Textarea
              name="notes"
              placeholder="Vendor notes, port tariff details…"
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
            <Button
              type="submit"
              disabled={saving || !amount || Number(amount) === 0}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PlusCircle className="size-4" />
              )}
              <span>{saving ? 'Adding component...' : 'Add Cost Component'}</span>
            </Button>
          </DialogFooter>
        </form>
      </SupplyTaskDialogContent>
    </Dialog>
  );
}
