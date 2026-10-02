'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { HandCoins, ReceiptText, User } from 'lucide-react';
import type {
  CapitalContributorDto,
  FinanceExpenseDto,
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
import { formatMoney } from '@/lib/finance/types';
import { localDateTime } from './types';

export interface CapitalOwnerExpenseDialogProps {
  readonly preselectedExpenseId?: string | undefined;
  readonly preselectedContributorId?: string | undefined;
  readonly contributors: readonly CapitalContributorDto[];
  readonly expenses: readonly FinanceExpenseDto[];
  readonly defaultCurrency: string;
  readonly open: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: {
    expenseId: string;
    contributorId: string;
    amount: string;
    occurredAt: string;
    reference?: string | undefined;
    note?: string | undefined;
  }) => Promise<void>;
}

export function CapitalOwnerExpenseDialog({
  preselectedExpenseId,
  preselectedContributorId,
  contributors,
  expenses,
  defaultCurrency,
  open,
  busy,
  onClose,
  onSubmit,
}: CapitalOwnerExpenseDialogProps) {
  const [expenseId, setExpenseId] = useState(preselectedExpenseId || '');
  const [contributorId, setContributorId] = useState(preselectedContributorId || '');
  const [amount, setAmount] = useState('');

  const activeContributors = contributors.filter((c) => c.status === 'ACTIVE');
  const outstandingExpenses = expenses.filter(
    (e) =>
      e.status === 'RECORDED' &&
      Number(e.outstanding) > 0 &&
      e.currency_code === defaultCurrency,
  );

  // Sync initial expense selection and pre-fill amount
  useEffect(() => {
    if (preselectedExpenseId) {
      setExpenseId(preselectedExpenseId);
      const matched = outstandingExpenses.find((e) => e.id === preselectedExpenseId);
      if (matched) {
        setAmount(matched.outstanding);
      }
    } else if (outstandingExpenses.length > 0 && !expenseId) {
      // Default to first expense if not selected
      const first = outstandingExpenses[0]!;
      setExpenseId(first.id);
      setAmount(first.outstanding);
    }
  }, [outstandingExpenses, preselectedExpenseId]);

  // When user selects a different expense, auto-fill its outstanding balance
  function handleExpenseChange(newExpenseId: string) {
    setExpenseId(newExpenseId);
    const matched = outstandingExpenses.find((e) => e.id === newExpenseId);
    if (matched) {
      setAmount(matched.outstanding);
    }
  }

  const selectedExpense = outstandingExpenses.find((e) => e.id === expenseId);
  const outstandingLimit = selectedExpense ? Number(selectedExpense.outstanding) : 0;
  const isOverpaying = Number(amount || 0) > outstandingLimit;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expenseId || !contributorId || !amount) return;
    const data = new FormData(event.currentTarget);
    const occurredAt = new Date(String(data.get('occurredAt'))).toISOString();
    const reference = String(data.get('reference') || '').trim() || undefined;
    const note = String(data.get('note') || '').trim() || undefined;

    await onSubmit({
      expenseId,
      contributorId,
      amount,
      occurredAt,
      reference,
      note,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <HandCoins className="size-5 text-emerald-600 shrink-0" />
              <DialogTitle>Record personally funded expense</DialogTitle>
            </div>
            <DialogDescription className="leading-relaxed">
              The contributor personally paid a real business cost or supplier bill. This settles the
              outstanding expense and increases their capital position without altering business
              account cash balances.
            </DialogDescription>
          </DialogHeader>

          <label className="grid gap-1.5 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <ReceiptText className="size-4 text-muted-foreground" />
              <span>Outstanding expense or supplier invoice</span>
            </span>
            <NativeSelect
              name="expenseId"
              value={expenseId}
              onChange={(e) => handleExpenseChange(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose expense
              </option>
              {outstandingExpenses.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.expense_number}
                  {exp.source_reference ? ` · ${exp.source_reference}` : ''}
                  {exp.payee_name ? ` (${exp.payee_name})` : ''} · Due:{' '}
                  {formatMoney(exp.outstanding, exp.currency_code)}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <User className="size-4 text-muted-foreground" />
              <span>Capital contributor</span>
            </span>
            <NativeSelect
              name="contributorId"
              value={contributorId}
              onChange={(e) => setContributorId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose contributor
              </option>
              {activeContributors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} · Net capital {formatMoney(c.netCapital, defaultCurrency)}
                </option>
              ))}
            </NativeSelect>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              <span>Amount ({defaultCurrency})</span>
              <Input
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              {selectedExpense ? (
                <span className="text-[11px] text-muted-foreground">
                  Outstanding: {formatMoney(selectedExpense.outstanding, defaultCurrency)}
                </span>
              ) : null}
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              <span>Date and time paid</span>
              <Input
                name="occurredAt"
                type="datetime-local"
                defaultValue={localDateTime()}
                required
              />
            </label>
          </div>

          {isOverpaying ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              Note: Entered amount ({formatMoney(amount, defaultCurrency)}) exceeds outstanding balance ({formatMoney(outstandingLimit, defaultCurrency)}). Payments are capped at total obligation.
            </div>
          ) : null}

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Receipt or payment reference (optional)</span>
            <Input
              name="reference"
              maxLength={200}
              placeholder="Personal invoice, receipt #, bKash personal TrxID, voucher"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Note (optional)</span>
            <Textarea
              name="note"
              maxLength={2000}
              placeholder="Commercial purpose, vendor notes, or justification..."
            />
          </label>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                !activeContributors.length ||
                !outstandingExpenses.length ||
                !amount ||
                Number(amount) <= 0
              }
            >
              Record personal payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
