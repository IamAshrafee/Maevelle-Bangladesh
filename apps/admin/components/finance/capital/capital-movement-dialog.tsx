'use client';

import { useState, type FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertCircle,
  Landmark,
  User,
} from 'lucide-react';
import type {
  CapitalContributorDto,
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
import { formatMoney } from '@/lib/finance/types';
import { localDateTime } from './types';

export interface CapitalMovementDialogProps {
  readonly initialType: 'CONTRIBUTION' | 'WITHDRAWAL';
  readonly preselectedContributorId?: string | undefined;
  readonly contributors: readonly CapitalContributorDto[];
  readonly accounts: readonly FinancialAccountDto[];
  readonly defaultCurrency: string;
  readonly open: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: {
    type: 'CONTRIBUTION' | 'WITHDRAWAL';
    contributorId: string;
    accountId: string;
    amount: string;
    occurredAt: string;
    reference?: string | undefined;
    note?: string | undefined;
  }) => Promise<void>;
}

export function CapitalMovementDialog({
  initialType,
  preselectedContributorId,
  contributors,
  accounts,
  defaultCurrency,
  open,
  busy,
  onClose,
  onSubmit,
}: CapitalMovementDialogProps) {
  const [movementType, setMovementType] = useState<'CONTRIBUTION' | 'WITHDRAWAL'>(initialType);
  const [contributorId, setContributorId] = useState(preselectedContributorId || '');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');

  const activeContributors = contributors.filter((c) => c.status === 'ACTIVE');
  const activeAccounts = accounts.filter(
    (a) => a.status === 'ACTIVE' && a.currency_code === defaultCurrency,
  );

  const selectedAccount = activeAccounts.find((a) => a.id === accountId);
  const selectedBalance = selectedAccount ? Number(selectedAccount.ledger_balance) : 0;
  const inputAmount = Number(amount || 0);
  const isWithdrawalOverdraft =
    movementType === 'WITHDRAWAL' && selectedAccount && inputAmount > selectedBalance;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contributorId || !accountId || !amount) return;
    const data = new FormData(event.currentTarget);
    const occurredAt = new Date(String(data.get('occurredAt'))).toISOString();
    const reference = String(data.get('reference') || '').trim() || undefined;
    const note = String(data.get('note') || '').trim() || undefined;

    await onSubmit({
      type: movementType,
      contributorId,
      accountId,
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
              {movementType === 'CONTRIBUTION' ? (
                <ArrowDownToLine className="size-5 text-emerald-600 shrink-0" />
              ) : (
                <ArrowUpFromLine className="size-5 text-rose-600 shrink-0" />
              )}
              <DialogTitle>
                {movementType === 'CONTRIBUTION'
                  ? 'Record capital contribution'
                  : 'Record capital withdrawal'}
              </DialogTitle>
            </div>
            <DialogDescription className="leading-relaxed">
              {movementType === 'CONTRIBUTION'
                ? 'Records permanent funds deposited into a business financial account. Increases business cash and owner equity; does not count as customer revenue.'
                : 'Returns permanent capital from a business financial account to an owner. Reduces business cash and owner equity; does not count as an operational expense.'}
            </DialogDescription>
          </DialogHeader>

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

          <label className="grid gap-1.5 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <Landmark className="size-4 text-muted-foreground" />
              <span>
                {movementType === 'CONTRIBUTION'
                  ? 'Destination financial account'
                  : 'Source financial account'}
              </span>
            </span>
            <NativeSelect
              name="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose financial account
              </option>
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} · Available balance {formatMoney(acc.ledger_balance, acc.currency_code)}
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
            </label>

            <label className="grid gap-1.5 text-sm font-medium">
              <span>Date and time</span>
              <Input
                name="occurredAt"
                type="datetime-local"
                defaultValue={localDateTime()}
                required
              />
            </label>
          </div>

          {/* Overdraft warning if withdrawal exceeds account balance */}
          {isWithdrawalOverdraft ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Insufficient account balance</strong>
                <span>
                  The account has {formatMoney(selectedBalance, defaultCurrency)}, which is less than the requested withdrawal of {formatMoney(inputAmount, defaultCurrency)}. Maevelle prevents negative account balances.
                </span>
              </div>
            </div>
          ) : null}

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Reference (optional)</span>
            <Input
              name="reference"
              maxLength={200}
              placeholder="Bank transfer #, deposit slip, cheque #, or voucher"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            <span>Note (optional)</span>
            <Textarea
              name="note"
              maxLength={2000}
              placeholder="Background context, purpose of funds, or commercial remarks..."
            />
          </label>

          <DialogFooter className="mt-2 flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              {movementType === 'CONTRIBUTION' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setMovementType('WITHDRAWAL')}
                >
                  <ArrowUpFromLine className="size-3.5" />
                  <span>Switch to withdrawal</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setMovementType('CONTRIBUTION')}
                >
                  <ArrowDownToLine className="size-3.5" />
                  <span>Switch to contribution</span>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !activeContributors.length ||
                  !activeAccounts.length ||
                  isWithdrawalOverdraft ||
                  !amount ||
                  Number(amount) <= 0
                }
              >
                {movementType === 'CONTRIBUTION' ? 'Record contribution' : 'Record withdrawal'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
