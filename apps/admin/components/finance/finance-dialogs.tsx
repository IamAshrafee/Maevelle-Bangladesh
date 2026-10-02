'use client';

import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

import type {
  CapitalContributorDto,
  FinanceExpenseDto,
  FinanceReconciliationDto,
  FinancialAccountDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
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
import { fetchApiData } from '@/lib/api';
import { formatMoney, type ExpenseCategoryDto } from '@/lib/finance/types';
import {
  CreateFinancialAccountDialog,
  type CreateFinancialAccountDialogProps,
} from './create-account-dialog';
import { TransferFundsDialog, type TransferFundsDialogProps } from './transfer-dialog';
import { BalanceCheckDialog, type BalanceCheckDialogProps } from './balance-check-dialog';

export {
  CreateFinancialAccountDialog,
  type CreateFinancialAccountDialogProps,
  TransferFundsDialog,
  type TransferFundsDialogProps,
  BalanceCheckDialog,
  type BalanceCheckDialogProps,
};

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
  const canViewCapital = useAdminCapability('finance.capital.view');
  const canManageCapital = useAdminCapability('finance.capital.manage');
  const [contributors, setContributors] = useState<readonly CapitalContributorDto[]>([]);
  const [expenseFundingSource, setExpenseFundingSource] = useState<
    'UNPAID' | 'ACCOUNT' | 'OWNER_CAPITAL'
  >('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<'ACCOUNT' | 'OWNER_CAPITAL'>('ACCOUNT');

  useEffect(() => {
    if (!canViewCapital) return;
    void fetchApiData<readonly CapitalContributorDto[]>('/admin/finance/capital/contributors')
      .then(setContributors)
      .catch(() => {});
  }, [canViewCapital]);

  const activeAccounts = accounts.filter((account) => account.status === 'ACTIVE');
  const activeContributors = contributors.filter((contributor) => contributor.status === 'ACTIVE');
  const submit =
    (path: string, map: (data: Record<string, FormDataEntryValue>) => Record<string, unknown>) =>
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await onCommand(path, map(values(event.currentTarget)));
    };

  if (state?.kind === 'account') {
    return (
      <CreateFinancialAccountDialog
        open={true}
        existingAccounts={accounts}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        onCommand={onCommand}
      />
    );
  }

  if (state?.kind === 'transfer') {
    return (
      <TransferFundsDialog
        open={true}
        accounts={accounts}
        defaultSourceAccountId={state.defaultSourceAccountId}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        onCommand={onCommand}
      />
    );
  }

  if (state?.kind === 'balance-check') {
    return (
      <BalanceCheckDialog
        open={true}
        accounts={accounts}
        defaultAccountId={state.defaultAccountId}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        onCommand={onCommand}
      />
    );
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {state?.kind === 'expense' ? (
          <form
            className="grid gap-4"
            onSubmit={submit('/admin/finance/expenses', (data) => ({
              categoryId: data.categoryId,
              description: data.description,
              amount: data.amount,
              currencyCode: String(data.currencyCode).toUpperCase(),
              expenseDate: data.expenseDate,
              accountId:
                expenseFundingSource === 'ACCOUNT'
                  ? (data.accountId as string) || undefined
                  : undefined,
              capitalContributorId:
                expenseFundingSource === 'OWNER_CAPITAL'
                  ? (data.capitalContributorId as string) || undefined
                  : undefined,
              payeeName: data.payeeName || undefined,
              externalReference: data.externalReference || undefined,
              paymentReference: data.paymentReference || undefined,
              notes: data.notes || undefined,
            }))}
          >
            <DialogHeader>
              <DialogTitle>Record expense</DialogTitle>
              <DialogDescription>
                Record the obligation first. Pay it from a business account now, mark it personally
                funded by an owner, or leave it unpaid.
              </DialogDescription>
            </DialogHeader>
            <Field label="Description">
              <Textarea
                name="description"
                placeholder="Facebook advertising, equipment, supplies..."
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
                label="Payment status"
                hint="Choose how this expense was paid, or leave unpaid."
              >
                <NativeSelect
                  className="w-full"
                  value={expenseFundingSource}
                  onChange={(e) =>
                    setExpenseFundingSource(
                      e.target.value as 'UNPAID' | 'ACCOUNT' | 'OWNER_CAPITAL',
                    )
                  }
                >
                  <option value="UNPAID">Record as unpaid</option>
                  <option value="ACCOUNT">Pay from business account</option>
                  {canManageCapital ? (
                    <option value="OWNER_CAPITAL">Paid personally (Owner / Contributor)</option>
                  ) : null}
                </NativeSelect>
              </Field>
              {expenseFundingSource === 'ACCOUNT' ? (
                <Field
                  label="Account used"
                  hint="Choose the business account that paid this expense."
                >
                  <NativeSelect className="w-full" name="accountId" required defaultValue="">
                    <option value="" disabled>
                      Choose account
                    </option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ·{' '}
                        {formatMoney(account.ledger_balance, account.currency_code)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              {expenseFundingSource === 'OWNER_CAPITAL' ? (
                <Field
                  label="Capital contributor"
                  hint="The owner or investor who paid with personal money."
                >
                  <NativeSelect
                    className="w-full"
                    name="capitalContributorId"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose contributor
                    </option>
                    {activeContributors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
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
            onSubmit={async (event) => {
              event.preventDefault();
              const formValues = values(event.currentTarget);
              if (paymentMethod === 'OWNER_CAPITAL') {
                await onCommand(
                  `/admin/finance/expenses/${state.expense.id}/owner-funded-payments`,
                  {
                    contributorId: formValues.contributorId,
                    amount: formValues.amount,
                    reference: formValues.reference || undefined,
                    occurredAt: new Date().toISOString(),
                  },
                );
              } else {
                await onCommand(`/admin/finance/expenses/${state.expense.id}/pay`, {
                  accountId: formValues.accountId,
                  amount: formValues.amount,
                  reference: formValues.reference || undefined,
                });
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Pay {state.expense.expense_number}</DialogTitle>
              <DialogDescription>
                Outstanding {formatMoney(state.expense.outstanding, state.expense.currency_code)}.
                Choose whether a business account or an owner personally paid this expense.
              </DialogDescription>
            </DialogHeader>
            <Field label="Payment method">
              <NativeSelect
                className="w-full"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'ACCOUNT' | 'OWNER_CAPITAL')}
              >
                <option value="ACCOUNT">Pay from business account</option>
                {canManageCapital ? (
                  <option value="OWNER_CAPITAL">Paid personally (Owner / Contributor)</option>
                ) : null}
              </NativeSelect>
            </Field>
            {paymentMethod === 'ACCOUNT' ? (
              <Field label="Account used">
                <NativeSelect className="w-full" name="accountId" required defaultValue="">
                  <option value="" disabled>
                    Choose account
                  </option>
                  {activeAccounts
                    .filter((account) => account.currency_code === state.expense.currency_code)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ·{' '}
                        {formatMoney(account.ledger_balance, account.currency_code)}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            ) : (
              <Field
                label="Capital contributor"
                hint="The owner or investor who paid with personal money."
              >
                <NativeSelect className="w-full" name="contributorId" required defaultValue="">
                  <option value="" disabled>
                    Choose contributor
                  </option>
                  {activeContributors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
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
              hint="Optional bank, wallet, invoice, receipt, or personal voucher reference."
            >
              <Input name="reference" maxLength={200} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (paymentMethod === 'ACCOUNT' && activeAccounts.length === 0) ||
                  (paymentMethod === 'OWNER_CAPITAL' && activeContributors.length === 0)
                }
              >
                Record payment
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
                defaultValue={
                  state?.kind === 'cash-adjustment' ? (state.defaultAccountId ?? '') : ''
                }
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
