'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  HelpCircle,
  Loader2,
  Receipt,
  ReceiptText,
  Sparkles,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { PurchaseDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatSupplyMoney } from '@/lib/supply/api';
import type { ExpenseCategory, FinancialAccount, SupplierInvoice } from '../types';

export interface PurchaseInvoiceDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly purchase: PurchaseDto;
  readonly categories: readonly ExpenseCategory[];
  readonly accounts: readonly FinancialAccount[];
  readonly existingInvoices: readonly SupplierInvoice[];
  readonly canPayInvoice: boolean;
  readonly busy: boolean;
  readonly onCreateInvoice: (data: {
    categoryId: string;
    description: string;
    amount: string;
    expenseDate: string;
    payeeName?: string | undefined;
    externalReference?: string | undefined;
    notes?: string | undefined;
    accountId?: string | undefined;
    paymentReference?: string | undefined;
  }) => void;
}

export function PurchaseInvoiceDialog({
  open,
  onOpenChange,
  purchase,
  categories,
  accounts,
  existingInvoices,
  canPayInvoice,
  busy,
  onCreateInvoice,
}: PurchaseInvoiceDialogProps) {
  const activeCategories = categories.filter((c) => c.status === 'ACTIVE');
  const eligibleAccounts = accounts.filter(
    (acc) => acc.status === 'ACTIVE' && acc.currency_code === purchase.currencyCode,
  );

  // Financial balance calculations
  const orderTotal = Number(purchase.totalAmount || 0);
  const previouslyInvoiced = existingInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const remainingBalance = Math.max(0, orderTotal - previouslyInvoiced);

  // Auto-detect default category
  const suggestedCategoryId =
    activeCategories.find((c) =>
      /procure|purchase|suppl|inventor|cogs|cost of goods/i.test(c.name),
    )?.id ??
    activeCategories[0]?.id ??
    '';

  const [categoryId, setCategoryId] = useState(suggestedCategoryId);
  const [description, setDescription] = useState(
    `Supplier invoice for ${purchase.purchaseNumber}`,
  );
  const [externalReference, setExternalReference] = useState('');
  const [payeeName, setPayeeName] = useState(purchase.supplierName);
  const [amount, setAmount] = useState(
    remainingBalance > 0
      ? String(remainingBalance)
      : purchase.totalAmount || '0',
  );
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Immediate payment settlement option
  const [immediatePayment, setImmediatePayment] = useState(false);
  const [accountId, setAccountId] = useState(eligibleAccounts[0]?.id ?? '');
  const [paymentReference, setPaymentReference] = useState('');

  // Synchronize defaults when dialog opens
  useEffect(() => {
    if (open) {
      const rem = Math.max(0, orderTotal - previouslyInvoiced);
      setAmount(rem > 0 ? String(rem) : purchase.totalAmount || '0');
      setPayeeName(purchase.supplierName);
      setDescription(`Supplier invoice for ${purchase.purchaseNumber}`);
      setExternalReference('');
      setNotes('');
      setImmediatePayment(false);
      if (suggestedCategoryId && !categoryId) {
        setCategoryId(suggestedCategoryId);
      }
      if (eligibleAccounts[0]?.id && !accountId) {
        setAccountId(eligibleAccounts[0].id);
      }
    }
  }, [open, purchase, orderTotal, previouslyInvoiced, suggestedCategoryId, categoryId, eligibleAccounts, accountId]);

  const numAmount = Number(amount || 0);
  const isOverRemaining = remainingBalance > 0 && numAmount > remainingBalance;
  const isFullyInvoiced = remainingBalance <= 0 && previouslyInvoiced > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || !amount || numAmount <= 0) return;

    onCreateInvoice({
      categoryId,
      description: description.trim(),
      amount: String(numAmount),
      expenseDate,
      payeeName: payeeName.trim() || undefined,
      externalReference: externalReference.trim() || undefined,
      notes: notes.trim() || undefined,
      accountId: immediatePayment && accountId.trim() ? accountId.trim() : undefined,
      paymentReference:
        immediatePayment && paymentReference.trim() ? paymentReference.trim() : undefined,
    });
  }

  function fillRemaining() {
    setAmount(String(remainingBalance));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Receipt className="size-4" />
            </div>
            <div>
              <DialogTitle>Record Supplier Invoice</DialogTitle>
              <DialogDescription>
                Post an authoritative payable in Finance linked to {purchase.purchaseNumber}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Financial Context & Remaining Balance Banner */}
        <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Building2 className="size-3.5 text-primary" />
              {purchase.supplierName} ({purchase.purchaseNumber})
            </span>
            <Badge variant="outline" className="font-mono text-[11px]">
              Currency: {purchase.currencyCode}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <div>
              <span className="text-muted-foreground block text-[11px]">Total Order Value</span>
              <strong className="font-mono text-sm text-foreground">
                {formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Invoiced to Date</span>
              <strong className="font-mono text-sm text-muted-foreground">
                {formatSupplyMoney(String(previouslyInvoiced), purchase.currencyCode)}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Un-invoiced Balance</span>
              <div className="flex items-center gap-1.5">
                <strong
                  className={`font-mono text-sm ${
                    remainingBalance > 0
                      ? 'text-foreground font-bold'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatSupplyMoney(String(remainingBalance), purchase.currencyCode)}
                </strong>
                {remainingBalance > 0 && numAmount !== remainingBalance ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-5 text-primary hover:bg-primary/10"
                          onClick={fillRemaining}
                        />
                      }
                    >
                      <Sparkles className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent side="top">Fill remaining un-invoiced balance</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          </div>

          {isFullyInvoiced ? (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 pt-1">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>
                This purchase order is already fully invoiced. Additional invoices will exceed the original agreed PO value.
              </span>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Category & Supplier Bill Number */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="invoice-category">Expense Category</FieldLabel>
              <NativeSelect
                id="invoice-category"
                name="categoryId"
                value={categoryId}
                required
                disabled={busy || !activeCategories.length}
                className="w-full"
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <NativeSelectOption value="" disabled>
                  {activeCategories.length
                    ? 'Choose an expense category'
                    : 'No active expense categories found'}
                </NativeSelectOption>
                {activeCategories.map((cat) => (
                  <NativeSelectOption key={cat.id} value={cat.id}>
                    {cat.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>Finance chart category for cost allocation.</FieldDescription>
            </Field>

            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="invoice-external-ref">Supplier Bill / Invoice #</FieldLabel>
                <Tooltip>
                  <TooltipTrigger render={<span className="cursor-help inline-flex" />}>
                    <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    The external invoice or bill number printed on the vendor's invoice document
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="invoice-external-ref"
                name="externalReference"
                placeholder="e.g. INV-2026-9042 or BILL-081"
                value={externalReference}
                disabled={busy}
                onChange={(e) => setExternalReference(e.target.value)}
              />
              <FieldDescription>Supplier's official reference for audits.</FieldDescription>
            </Field>
          </div>

          {/* Row 2: Payee Name & Description */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="invoice-payee">Payee / Billing Entity</FieldLabel>
              <Input
                id="invoice-payee"
                name="payeeName"
                value={payeeName}
                required
                disabled={busy}
                onChange={(e) => setPayeeName(e.target.value)}
              />
              <FieldDescription>Vendor or entity issuing the invoice.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="invoice-description">Description</FieldLabel>
              <Input
                id="invoice-description"
                name="description"
                value={description}
                required
                disabled={busy}
                onChange={(e) => setDescription(e.target.value)}
              />
              <FieldDescription>Line item description in the Finance ledger.</FieldDescription>
            </Field>
          </div>

          {/* Row 3: Amount & Invoice Date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="invoice-amount">
                  Invoice Amount ({purchase.currencyCode})
                </FieldLabel>
                {remainingBalance > 0 && numAmount !== remainingBalance ? (
                  <button
                    type="button"
                    onClick={fillRemaining}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    Match balance ({formatSupplyMoney(String(remainingBalance), purchase.currencyCode)})
                  </button>
                ) : null}
              </div>
              <Input
                id="invoice-amount"
                name="amount"
                type="number"
                min="0.0001"
                step="any"
                value={amount}
                required
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
              />
              {isOverRemaining ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  Exceeds remaining PO balance by{' '}
                  {formatSupplyMoney(String(numAmount - remainingBalance), purchase.currencyCode)}.
                </p>
              ) : (
                <FieldDescription>Gross payable amount to be recorded.</FieldDescription>
              )}
            </Field>

            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="invoice-date">Invoice / Bill Date</FieldLabel>
                <button
                  type="button"
                  onClick={() => setExpenseDate(new Date().toISOString().slice(0, 10))}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Set Today
                </button>
              </div>
              <Input
                id="invoice-date"
                name="expenseDate"
                type="date"
                value={expenseDate}
                required
                disabled={busy}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
              <FieldDescription>Date stamped on the supplier invoice.</FieldDescription>
            </Field>
          </div>

          {/* Optional 1-Step Immediate Settlement */}
          {canPayInvoice && eligibleAccounts.length > 0 ? (
            <div className="rounded-xl border bg-card p-3.5 space-y-3">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                <Checkbox
                  checked={immediatePayment}
                  onCheckedChange={(checked) => setImmediatePayment(Boolean(checked))}
                  disabled={busy}
                />
                <span className="flex items-center gap-1.5">
                  <CreditCard className="size-3.5 text-primary" />
                  <span>Record immediate payment upon saving</span>
                </span>
              </label>

              {immediatePayment ? (
                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 border-t border-border/50">
                  <Field>
                    <FieldLabel htmlFor="invoice-pay-account">Disburse From Account</FieldLabel>
                    <NativeSelect
                      id="invoice-pay-account"
                      value={accountId}
                      required={immediatePayment}
                      disabled={busy}
                      className="w-full text-xs"
                      onChange={(e) => setAccountId(e.target.value)}
                    >
                      {eligibleAccounts.map((acc) => (
                        <NativeSelectOption key={acc.id} value={acc.id}>
                          {acc.name} · Bal: {formatSupplyMoney(acc.ledger_balance, acc.currency_code)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldDescription>Ledger account to debit.</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="invoice-payment-ref">Payment Reference #</FieldLabel>
                    <Input
                      id="invoice-payment-ref"
                      placeholder="e.g. Wire SWIFT ref, Check #, or Cash receipt"
                      value={paymentReference}
                      disabled={busy}
                      className="text-xs"
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                    <FieldDescription>Optional bank / cash confirmation reference.</FieldDescription>
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Commercial Notes / Payment Terms */}
          <Field>
            <FieldLabel htmlFor="invoice-notes">Commercial Terms & Internal Notes</FieldLabel>
            <Textarea
              id="invoice-notes"
              name="notes"
              value={notes}
              rows={2}
              placeholder="e.g. Net 30 payment terms, 2% early payment discount, includes shipping and handling fees..."
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
            />
            <FieldDescription>
              Optional commercial notes or payment conditions for Finance audit.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={busy || !categoryId || !amount || numAmount <= 0 || !activeCategories.length}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : immediatePayment ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <ReceiptText className="size-4" />
              )}
              <span>
                {immediatePayment ? 'Record & Post Payment' : 'Record Invoice'}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
