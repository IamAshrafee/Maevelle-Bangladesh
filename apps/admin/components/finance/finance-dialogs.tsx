'use client';

import { type FormEvent, type ReactNode } from 'react';

import type {
  FinanceExpenseDto,
  FinanceReconciliationDto,
  FinancialAccountDto,
} from '@maevelle/contracts';

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
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney, type ExpenseCategoryDto } from '@/lib/finance/types';

export type FinanceDialogState =
  | { readonly kind: 'account' }
  | { readonly kind: 'expense' }
  | { readonly kind: 'category' }
  | { readonly kind: 'expense-payment'; readonly expense: FinanceExpenseDto }
  | { readonly kind: 'transfer'; readonly defaultSourceAccountId?: string }
  | { readonly kind: 'cash-adjustment'; readonly defaultAccountId?: string }
  | { readonly kind: 'balance-check'; readonly defaultAccountId?: string }
  | { readonly kind: 'reconciliation-resolution'; readonly check: FinanceReconciliationDto }
  | { readonly kind: 'reconciliation-reopen'; readonly check: FinanceReconciliationDto };

type Command = (path: string, body: Record<string, unknown>) => Promise<void>;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function values(form: HTMLFormElement): Record<string, FormDataEntryValue> {
  return Object.fromEntries(new FormData(form));
}

export function FinanceCommandDialog({
  state,
  accounts,
  categories,
  busy,
  onClose,
  onCommand,
}: {
  readonly state: FinanceDialogState | undefined;
  readonly accounts: readonly FinancialAccountDto[];
  readonly categories: readonly ExpenseCategoryDto[];
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onCommand: Command;
}) {
  const activeAccounts = accounts.filter((account) => account.status === 'ACTIVE');
  const submit =
    (path: string, map: (data: Record<string, FormDataEntryValue>) => Record<string, unknown>) =>
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await onCommand(path, map(values(event.currentTarget)));
    };

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {state?.kind === 'account' ? (
          <form
            className="grid gap-4"
            onSubmit={submit('/admin/finance/accounts', (data) => ({
              accountNumber: data.accountNumber,
              name: data.name,
              accountType: data.accountType,
              currencyCode: String(data.currencyCode).toUpperCase(),
              referenceLabel: data.referenceLabel || undefined,
              openingBalance: data.openingBalance || undefined,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Create financial account</DialogTitle>
              <DialogDescription>
                Add where business money is held. The opening balance becomes an immutable ledger
                entry and cannot be edited later.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account name">
                <Input name="name" placeholder="Main bKash wallet" required autoFocus />
              </Field>
              <Field label="Account code">
                <Input name="accountNumber" placeholder="BKASH-01" required />
              </Field>
              <Field label="Account type">
                <NativeSelect className="w-full" name="accountType" defaultValue="MOBILE_WALLET">
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="MOBILE_WALLET">Mobile wallet</option>
                  <option value="OTHER">Courier wallet / other</option>
                </NativeSelect>
              </Field>
              <Field label="Currency">
                <Input
                  name="currencyCode"
                  defaultValue="BDT"
                  minLength={3}
                  maxLength={3}
                  required
                />
              </Field>
              <Field
                label="Reference"
                hint="Optional bank suffix, wallet number, or operational label."
              >
                <Input name="referenceLabel" placeholder="Ends 1234" />
              </Field>
              <Field label="Opening balance" hint="Leave empty for zero.">
                <Input name="openingBalance" inputMode="decimal" placeholder="0.00" />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Create account
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'expense' ? (
          <form
            className="grid gap-4"
            onSubmit={submit('/admin/finance/expenses', (data) => ({
              categoryId: data.categoryId,
              description: data.description,
              amount: data.amount,
              currencyCode: String(data.currencyCode).toUpperCase(),
              expenseDate: data.expenseDate,
              accountId: data.accountId || undefined,
              payeeName: data.payeeName || undefined,
              externalReference: data.externalReference || undefined,
              paymentReference: data.paymentReference || undefined,
              notes: data.notes || undefined,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Record expense</DialogTitle>
              <DialogDescription>
                Record the obligation first. Pay it from an account now or later without losing the
                original expense history.
              </DialogDescription>
            </DialogHeader>
            <Field label="Description">
              <Textarea
                name="description"
                placeholder="Facebook advertising for September"
                required
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <NativeSelect className="w-full" name="categoryId" required defaultValue="">
                  <option value="" disabled>
                    Choose category
                  </option>
                  {categories
                    .filter((category) => category.status === 'ACTIVE')
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Expense date">
                <Input
                  name="expenseDate"
                  type="date"
                  defaultValue={new Date().toLocaleDateString('en-CA')}
                  required
                />
              </Field>
              <Field label="Amount">
                <Input name="amount" inputMode="decimal" placeholder="0.00" required />
              </Field>
              <Field label="Currency">
                <Input
                  name="currencyCode"
                  defaultValue="BDT"
                  minLength={3}
                  maxLength={3}
                  required
                />
              </Field>
              <Field
                label="Account used"
                hint="Choose an account to record the full payment now, or leave unpaid."
              >
                <NativeSelect className="w-full" name="accountId" defaultValue="">
                  <option value="">Record as unpaid</option>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {formatMoney(account.ledger_balance, account.currency_code)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <details className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">Optional details</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Payee / vendor">
                  <Input name="payeeName" maxLength={200} placeholder="Meta, Pathao, landlord…" />
                </Field>
                <Field label="Expense reference">
                  <Input
                    name="externalReference"
                    maxLength={200}
                    placeholder="Invoice or receipt"
                  />
                </Field>
                <Field
                  label="Payment reference"
                  hint="Used only when an account is selected above."
                >
                  <Input name="paymentReference" maxLength={200} />
                </Field>
                <Field label="Notes">
                  <Textarea name="notes" maxLength={2000} />
                </Field>
              </div>
            </details>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || categories.length === 0}>
                Record expense
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'category' ? (
          <form
            className="grid gap-4"
            onSubmit={submit('/admin/finance/categories', (data) => ({
              code: String(data.code).trim().toUpperCase(),
              name: data.name,
              classification: 'OPERATING',
            }))}
          >
            <DialogHeader>
              <DialogTitle>Add expense category</DialogTitle>
              <DialogDescription>
                Keep categories broad enough to remain useful in reporting.
              </DialogDescription>
            </DialogHeader>
            <Field label="Name">
              <Input name="name" placeholder="Advertising" required autoFocus />
            </Field>
            <Field label="Code">
              <Input name="code" placeholder="ADVERTISING" required />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Add category
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'expense-payment' ? (
          <form
            className="grid gap-4"
            onSubmit={submit(`/admin/finance/expenses/${state.expense.id}/pay`, (data) => ({
              accountId: data.accountId,
              amount: data.amount,
              reference: data.reference || undefined,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Pay {state.expense.expense_number}</DialogTitle>
              <DialogDescription>
                Outstanding {formatMoney(state.expense.outstanding, state.expense.currency_code)}.
                This payment creates an immutable money-out ledger entry.
              </DialogDescription>
            </DialogHeader>
            <Field label="Account used">
              <NativeSelect className="w-full" name="accountId" required defaultValue="">
                <option value="" disabled>
                  Choose account
                </option>
                {activeAccounts
                  .filter((account) => account.currency_code === state.expense.currency_code)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {formatMoney(account.ledger_balance, account.currency_code)}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Amount">
              <Input
                name="amount"
                inputMode="decimal"
                defaultValue={state.expense.outstanding}
                required
              />
            </Field>
            <Field
              label="Payment reference"
              hint="Optional bank, wallet, invoice, or receipt reference."
            >
              <Input name="reference" maxLength={200} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || activeAccounts.length === 0}>
                Record payment
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'transfer' ? (
          <form
            className="grid gap-4"
            onSubmit={submit('/admin/finance/transfers', (data) => ({
              sourceAccountId: data.sourceAccountId,
              destinationAccountId: data.destinationAccountId,
              amount: data.amount,
              reference: data.reference || undefined,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Transfer between accounts</DialogTitle>
              <DialogDescription>
                Internal transfers move money without recording income or an expense.
              </DialogDescription>
            </DialogHeader>
            <Field label="From account">
              <NativeSelect
                className="w-full"
                name="sourceAccountId"
                required
                defaultValue={state?.kind === 'transfer' ? (state.defaultSourceAccountId ?? '') : ''}
              >
                <option value="" disabled>
                  Choose source
                </option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {formatMoney(account.ledger_balance, account.currency_code)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="To account">
              <NativeSelect className="w-full" name="destinationAccountId" required defaultValue="">
                <option value="" disabled>
                  Choose destination
                </option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency_code}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount">
                <Input name="amount" inputMode="decimal" required />
              </Field>
              <Field label="Reference">
                <Input name="reference" placeholder="Courier remittance" />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || activeAccounts.length < 2}>
                Transfer funds
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'cash-adjustment' ? (
          <form
            className="grid gap-4"
            onSubmit={submit('/admin/finance/movements', (data) => ({
              accountId: data.accountId,
              amount: data.amount,
              description: data.description,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Record account adjustment</DialogTitle>
              <DialogDescription>
                Use only for real money movements not represented by a payment, refund, expense, or
                transfer. Enter a negative amount for money out.
              </DialogDescription>
            </DialogHeader>
            <Field label="Account">
              <NativeSelect
                className="w-full"
                name="accountId"
                required
                defaultValue={state?.kind === 'cash-adjustment' ? (state.defaultAccountId ?? '') : ''}
              >
                <option value="" disabled>
                  Choose account
                </option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Signed amount">
              <Input name="amount" inputMode="decimal" placeholder="1000 or -1000" required />
            </Field>
            <Field label="Reason">
              <Textarea name="description" required />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || activeAccounts.length === 0}>
                Record adjustment
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'balance-check' ? (
          <form
            className="grid gap-4"
            onSubmit={submit('/admin/finance/reconciliations', (data) => ({
              accountId: data.accountId,
              observedBalance: data.observedBalance,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Compare account balance</DialogTitle>
              <DialogDescription>
                Enter the balance shown by the bank, wallet, cash count, or courier statement. This
                comparison never changes Maevelle's ledger.
              </DialogDescription>
            </DialogHeader>
            <Field label="Account">
              <NativeSelect
                className="w-full"
                name="accountId"
                required
                defaultValue={state?.kind === 'balance-check' ? (state.defaultAccountId ?? '') : ''}
              >
                <option value="" disabled>
                  Choose account
                </option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · ledger{' '}
                    {formatMoney(account.ledger_balance, account.currency_code)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Observed balance">
              <Input name="observedBalance" inputMode="decimal" required />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || activeAccounts.length === 0}>
                Compare balance
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'reconciliation-resolution' ? (
          <form
            className="grid gap-4"
            onSubmit={submit(
              `/admin/finance/reconciliations/${state.check.id}/resolve`,
              (data) => ({
                resolutionCode: data.resolutionCode,
                note: data.note,
              }),
            )}
          >
            <DialogHeader>
              <DialogTitle>Resolve balance difference</DialogTitle>
              <DialogDescription>
                Close the difference for {state.check.account_name}. This records an auditable
                explanation and never rewrites ledger entries.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <span>
                <small className="block text-muted-foreground">Ledger</small>
                <strong>{formatMoney(state.check.ledger_balance)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Observed</small>
                <strong>{formatMoney(state.check.observed_balance)}</strong>
              </span>
              <span>
                <small className="block text-muted-foreground">Difference</small>
                <strong>{formatMoney(state.check.difference_amount)}</strong>
              </span>
            </div>
            <Field label="Resolution">
              <NativeSelect
                className="w-full"
                name="resolutionCode"
                defaultValue="EXPLAINED_DIFFERENCE"
              >
                <option value="EXPLAINED_DIFFERENCE">Difference explained</option>
                <option value="EXTERNAL_BALANCE_CORRECTED">External balance corrected</option>
              </NativeSelect>
            </Field>
            <Field
              label="Resolution note"
              hint="Explain the evidence checked and why no ledger rewrite is required."
            >
              <Textarea name="note" minLength={4} maxLength={1000} required autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Resolve difference
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {state?.kind === 'reconciliation-reopen' ? (
          <form
            className="grid gap-4"
            onSubmit={submit(`/admin/finance/reconciliations/${state.check.id}/reopen`, (data) => ({
              note: data.note,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Reopen balance difference</DialogTitle>
              <DialogDescription>
                Reopen the discrepancy for {state.check.account_name}. The earlier resolution stays
                in audit history and this reason is recorded as a new event.
              </DialogDescription>
            </DialogHeader>
            <Field label="Reason for reopening">
              <Textarea name="note" minLength={4} maxLength={1000} required autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Reopen difference
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
