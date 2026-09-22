'use client';

import Link from 'next/link';
import { AlertCircle, CreditCard, Loader2, Sparkles, Wallet } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { formatSupplyMoney } from '@/lib/supply/api';
import type { FinancialAccount, SupplierInvoice } from '../types';

export interface PurchasePayDialogProps {
  readonly invoice?: SupplierInvoice | undefined;
  readonly accounts: readonly FinancialAccount[];
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onPostPayment: (data: {
    accountId: string;
    amount: string;
    reference?: string | undefined;
  }) => void;
}

export function PurchasePayDialog({
  invoice,
  accounts,
  busy,
  onClose,
  onPostPayment,
}: PurchasePayDialogProps) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  // Sync state whenever invoice changes
  useEffect(() => {
    if (invoice) {
      setAmount(invoice.outstanding);
      setReference('');
      // Auto-select first matching account with positive balance if available
      const matching = accounts.filter(
        (acc) => acc.status === 'ACTIVE' && acc.currency_code === invoice.currency_code,
      );
      const withFunds = matching.find((acc) => Number(acc.ledger_balance) >= Number(invoice.outstanding));
      setAccountId(withFunds ? withFunds.id : matching[0]?.id ?? '');
    }
  }, [invoice, accounts]);

  if (!invoice) return null;

  const eligibleAccounts = accounts.filter(
    (acc) => acc.status === 'ACTIVE' && acc.currency_code === invoice.currency_code,
  );

  const selectedAccount = eligibleAccounts.find((acc) => acc.id === accountId);
  const selectedBalance = selectedAccount ? Number(selectedAccount.ledger_balance) : 0;
  const paymentAmount = Number(amount || 0);
  const hasInsufficientFunds = selectedAccount ? selectedBalance < paymentAmount : false;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId || !amount) return;
    onPostPayment({
      accountId,
      amount,
      reference: reference.trim() || undefined,
    });
  }

  function handleSetFullOutstanding() {
    if (invoice) {
      setAmount(invoice.outstanding);
    }
  }

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <CreditCard className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base">Record Payment for {invoice.expense_number}</DialogTitle>
              <DialogDescription className="text-xs">
                Immutable cash disbursement debited from Finance cash accounts.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Summary Card */}
          <div className="rounded-xl border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground truncate max-w-[240px]">
                {invoice.description}
              </span>
              {invoice.external_reference ? (
                <Badge variant="outline" className="font-mono text-[10px]">
                  Bill #{invoice.external_reference}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/50">
              <span>
                Total: <strong>{formatSupplyMoney(invoice.amount, invoice.currency_code)}</strong>
              </span>
              <span>
                Due:{' '}
                <strong className="text-amber-600 dark:text-amber-400">
                  {formatSupplyMoney(invoice.outstanding, invoice.currency_code)}
                </strong>
              </span>
            </div>
          </div>

          {/* Account Selector */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="pay-account">Disburse From Account</FieldLabel>
              {selectedAccount ? (
                <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                  <Wallet className="size-3" />
                  Bal: {formatSupplyMoney(selectedAccount.ledger_balance, selectedAccount.currency_code)}
                </span>
              ) : null}
            </div>
            <NativeSelect
              id="pay-account"
              name="accountId"
              value={accountId}
              required
              disabled={busy || !eligibleAccounts.length}
              className="w-full"
              onChange={(e) => setAccountId(e.target.value)}
            >
              <NativeSelectOption value="" disabled>
                {eligibleAccounts.length
                  ? `Choose an active ${invoice.currency_code} account`
                  : `No active ${invoice.currency_code} accounts found`}
              </NativeSelectOption>
              {eligibleAccounts.map((acc) => (
                <NativeSelectOption key={acc.id} value={acc.id}>
                  {acc.name} (Bal: {formatSupplyMoney(acc.ledger_balance, acc.currency_code)})
                </NativeSelectOption>
              ))}
            </NativeSelect>

            {!eligibleAccounts.length ? (
              <p className="text-xs text-amber-600 mt-1">
                No active financial accounts found for {invoice.currency_code}. Set one up in{' '}
                <Link href="/finance/accounts" className="underline font-medium">
                  Finance → Accounts
                </Link>
                .
              </p>
            ) : hasInsufficientFunds ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <AlertCircle className="size-3 shrink-0" />
                Selected account balance is lower than disbursement. Account will incur negative balance.
              </p>
            ) : null}
          </Field>

          {/* Payment Amount */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="pay-amount">
                Payment Amount ({invoice.currency_code})
              </FieldLabel>
              {paymentAmount !== Number(invoice.outstanding) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-5 gap-1 text-[11px] text-primary"
                  onClick={handleSetFullOutstanding}
                >
                  <Sparkles className="size-3" />
                  <span>Pay full ({formatSupplyMoney(invoice.outstanding, invoice.currency_code)})</span>
                </Button>
              ) : null}
            </div>
            <Input
              id="pay-amount"
              name="amount"
              type="number"
              min="0.0001"
              max={invoice.outstanding}
              step="any"
              value={amount}
              required
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
            />
            <FieldDescription>
              Maximum payment amount is {formatSupplyMoney(invoice.outstanding, invoice.currency_code)}.
            </FieldDescription>
          </Field>

          {/* Payment Reference */}
          <Field>
            <FieldLabel htmlFor="pay-reference">
              Payment Reference / Voucher # (Optional)
            </FieldLabel>
            <Input
              id="pay-reference"
              name="reference"
              value={reference}
              placeholder="e.g. Bank Wire SWIFT ref, Cheque #, TrxID"
              maxLength={200}
              disabled={busy}
              onChange={(e) => setReference(e.target.value)}
            />
            <FieldDescription>
              Traceable bank transfer reference, cheque number, or payment voucher ID.
            </FieldDescription>
          </Field>

          <DialogFooter className="pt-2">
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={busy || !accountId || !amount || paymentAmount <= 0 || !eligibleAccounts.length}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
              <span>Post payment</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
