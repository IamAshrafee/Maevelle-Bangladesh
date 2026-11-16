'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { HandCoins, ReceiptText, User } from 'lucide-react';
import type { CapitalContributorDto, FinanceExpenseDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { MoneyField } from '@/components/ui/money-field';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
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

  const isDirty = Boolean(
    amount.trim() ||
      expenseId !== (preselectedExpenseId || '') ||
      contributorId !== (preselectedContributorId || ''),
  );

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    isDirty,
    isSubmitting: busy,
    onClose,
    confirmTitle: 'Discard personal payment entry?',
    confirmDescription:
      'You have entered payment details for this expense. Closing now will discard this entry.',
  });

  const activeContributors = contributors.filter((c) => c.status === 'ACTIVE');
  const outstandingExpenses = expenses.filter(
    (e) =>
      e.status === 'RECORDED' && Number(e.outstanding) > 0 && e.currency_code === defaultCurrency,
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
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4 text-left">
            <div className="flex items-center gap-2">
              <HandCoins className="size-5 text-emerald-600 shrink-0" />
              <SheetTitle>Record personally funded expense</SheetTitle>
            </div>
            <SheetDescription className="leading-relaxed">
              The contributor personally paid a real business cost or supplier bill. This settles
              the outstanding expense and increases their capital position without altering business
              account cash balances.
            </SheetDescription>
          </SheetHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">

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
            <div>
              <MoneyField
                label={`Amount (${defaultCurrency})`}
                currencySymbol={defaultCurrency === 'BDT' ? '৳' : defaultCurrency}
                placeholder="0.00"
                value={amount}
                onChange={setAmount}
                disabled={busy}
                required
              />
              {selectedExpense ? (
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Outstanding: {formatMoney(selectedExpense.outstanding, defaultCurrency)}
                </span>
              ) : null}
            </div>

            <label className="grid gap-1.5 text-sm font-medium">
              <span>Date and time paid</span>
              <Input
                name="occurredAt"
                type="datetime-local"
                defaultValue={localDateTime()}
                disabled={busy}
                required
              />
            </label>
          </div>

          {isOverpaying ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              Note: Entered amount ({formatMoney(amount, defaultCurrency)}) exceeds outstanding
              balance ({formatMoney(outstandingLimit, defaultCurrency)}). Payments are capped at
              total obligation.
            </div>
          ) : null}

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Receipt or payment reference (optional)</span>
            <Input
              name="reference"
              maxLength={200}
              placeholder="Personal invoice, receipt #, bKash personal TrxID, voucher"
              disabled={busy}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Note (optional)</span>
            <Textarea
              name="note"
              maxLength={2000}
              placeholder="Commercial purpose, vendor notes, or justification..."
              disabled={busy}
            />
          </label>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-card/50 px-6 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
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
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>
  {discardConfirmDialog}
</>
  );
}
