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
  currencyCode,
  onSubmit,
}: DialogProps & {
  shipmentId: string;
  currencyCode: string;
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
            <input className="rounded-md border bg-muted p-2" name="baseCurrencyCode" readOnly value={currencyCode} />
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
  expenses,
  onSubmit,
}: DialogProps & {
  worksheet: Worksheet;
  shipment: Shipment | undefined;
  expenses: readonly { id: string; expense_number: string; description: string; amount: string; currency_code: string; status: string; source_domain: string | null }[];
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
                <option value="INTERNATIONAL_FREIGHT">International freight</option>
                <option value="LOCAL_FREIGHT">Local transport</option>
                <option value="CUSTOMS_DUTY">Customs duty</option>
                <option value="TAX_OR_IMPORT_FEE">Tax or import fee</option>
                <option value="FORWARDER_FEE">Forwarder fee</option>
                <option value="HANDLING">Handling</option>
                <option value="INSURANCE">Insurance</option>
                <option value="OTHER_ACQUISITION_COST">Other acquisition cost</option>
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
                <option value="ESTIMATED">Estimated</option>
                <option value="ACTUAL">Actual</option>
                <option value="CREDIT">Supplier credit</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Scope
              <select
                className="rounded-md border bg-background p-2"
                defaultValue="GLOBAL"
                name="scope"
              >
                <option value="GLOBAL">Across all received items</option>
                <option value="DIRECT">One specific item</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Allocation
              <select
                className="rounded-md border bg-background p-2"
                defaultValue="QUANTITY"
                name="allocationMethod"
              >
                <option value="QUANTITY">By received quantity</option>
                <option value="PURCHASE_VALUE">By purchase value</option>
                <option value="EQUAL">Equally by item line</option>
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
            Finance expense <span className="text-muted-foreground">(optional shared record)</span>
            <select className="rounded-md border bg-background p-2" name="financeExpenseId" defaultValue="" onChange={(event) => {
              const expense = expenses.find((item) => item.id === event.target.value);
              const form = event.currentTarget.form;
              if (!expense || !form) return;
              const amount = form.elements.namedItem('amount') as HTMLInputElement | null;
              if (amount) amount.value = expense.amount;
              const currency = form.elements.namedItem('currencyCode') as HTMLInputElement | null;
              if (currency) currency.value = expense.currency_code;
            }}>
              <option value="">Not recorded in Finance</option>
              {expenses.filter((expense) => expense.status !== 'CANCELLED' && expense.source_domain !== 'procurement.purchase').map((expense) => (
                <option key={expense.id} value={expense.id}>{expense.expense_number} · {expense.currency_code} {expense.amount} · {expense.description}</option>
              ))}
            </select>
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
