'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { FinancialAccountDto } from '@maevelle/contracts';
import { CheckCircle2 } from 'lucide-react';

import { ActionDialog } from '@/components/ui/action-dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { NativeSelect } from '@/components/ui/native-select';
import { formatMoney } from '@/lib/finance/types';

export interface BalanceCheckDialogProps {
  readonly open: boolean;
  readonly accounts: readonly FinancialAccountDto[];
  readonly defaultAccountId?: string | undefined;
  readonly busy?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
  readonly onCommand: (path: string, body: Record<string, unknown>) => Promise<void>;
}

export function BalanceCheckDialog({
  open,
  accounts,
  defaultAccountId,
  busy = false,
  onOpenChange,
  onSuccess,
  onCommand,
}: BalanceCheckDialogProps) {
  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'ACTIVE'),
    [accounts],
  );

  const [accountId, setAccountId] = useState('');
  const [observedBalance, setObservedBalance] = useState('');
  const [inDialogError, setInDialogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset when dialog opens
  useEffect(() => {
    if (open) {
      setInDialogError(null);
      setIsSubmitting(false);
      setObservedBalance('');

      const targetId =
        defaultAccountId && activeAccounts.some((a) => a.id === defaultAccountId)
          ? defaultAccountId
          : (activeAccounts[0]?.id ?? '');

      setAccountId(targetId);
    }
  }, [open, defaultAccountId, activeAccounts]);

  const selectedAccount = useMemo(
    () => activeAccounts.find((a) => a.id === accountId) ?? null,
    [activeAccounts, accountId],
  );

  const currencyCode = selectedAccount?.currency_code ?? 'BDT';
  const ledgerBalanceNum = useMemo(
    () => (selectedAccount ? Number(selectedAccount.ledger_balance) : 0),
    [selectedAccount],
  );

  const cleanObserved = useMemo(() => observedBalance.replace(/,/g, '').trim(), [observedBalance]);
  const parsedObserved = useMemo(() => {
    if (!cleanObserved) return NaN;
    const num = Number(cleanObserved);
    return Number.isFinite(num) ? num : NaN;
  }, [cleanObserved]);

  const isObservedInvalid = useMemo(() => {
    if (!cleanObserved) return false;
    return Number.isNaN(parsedObserved) || !/^-?\d+(\.\d{1,4})?$/.test(cleanObserved);
  }, [cleanObserved, parsedObserved]);

  const variance = useMemo(() => {
    if (Number.isNaN(parsedObserved)) return null;
    return parsedObserved - ledgerBalanceNum;
  }, [parsedObserved, ledgerBalanceNum]);

  const handleMatchLedger = useCallback(() => {
    if (selectedAccount) {
      setObservedBalance(selectedAccount.ledger_balance);
    }
  }, [selectedAccount]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInDialogError(null);

    if (!accountId) {
      setInDialogError('Please choose an account to compare.');
      return;
    }

    if (!cleanObserved) {
      setInDialogError('Observed balance is required.');
      return;
    }

    if (isObservedInvalid || Number.isNaN(parsedObserved)) {
      setInDialogError('Observed balance must be a valid number (e.g. 15000 or 15000.50).');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCommand('/admin/finance/reconciliations', {
        accountId,
        observedBalance: cleanObserved,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      setInDialogError(
        error instanceof Error ? error.message : 'Balance check could not be submitted.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormBusy = busy || isSubmitting;
  const canSubmit =
    !isFormBusy &&
    Boolean(accountId) &&
    Boolean(cleanObserved) &&
    !isObservedInvalid &&
    !Number.isNaN(parsedObserved);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Compare account balance"
      description="Compare actual statement balance against Maevelle's ledger. Does not alter ledger entries."
      onSubmit={handleSubmit}
      error={inDialogError}
      busy={isFormBusy}
      submitLabel="Compare balance"
      busyLabel="Comparing…"
      submitDisabled={!canSubmit}
      footerNote="Reconciliations create comparison records and never alter the immutable ledger."
    >
      <div className="grid gap-3.5">
        {/* Account Selector */}
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel className="text-xs font-medium">Account</FieldLabel>
            {selectedAccount ? (
              <span className="text-[11px] text-muted-foreground">
                Ledger:{' '}
                <strong className="text-foreground">
                  {formatMoney(selectedAccount.ledger_balance, currencyCode)}
                </strong>
              </span>
            ) : null}
          </div>
          <NativeSelect
            name="accountId"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={isFormBusy}
            required
            className="w-full"
          >
            <option value="" disabled>
              Choose account
            </option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.account_number}) ·{' '}
                {formatMoney(account.ledger_balance, account.currency_code)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {/* Observed Balance Input */}
        <Field>
          <FieldLabel className="text-xs font-medium">Statement / counted balance</FieldLabel>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <span className="text-xs font-medium text-muted-foreground">{currencyCode}</span>
            </InputGroupAddon>
            <InputGroupInput
              name="observedBalance"
              value={observedBalance}
              onChange={(e) => setObservedBalance(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              disabled={isFormBusy}
              required
            />
            {selectedAccount ? (
              <InputGroupButton
                size="xs"
                onClick={handleMatchLedger}
                disabled={isFormBusy}
                title="Fill exact ledger balance"
              >
                Match ledger
              </InputGroupButton>
            ) : null}
          </InputGroup>

          {isObservedInvalid ? (
            <FieldError className="text-[11px]">
              Please enter a valid numeric amount (e.g. 50000 or 50000.50).
            </FieldError>
          ) : variance !== null && selectedAccount ? (
            Math.abs(variance) < 0.0001 ? (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                <span>Exactly matches ledger balance (Difference: 0.00)</span>
              </div>
            ) : (
              <FieldDescription className="text-[11px] text-muted-foreground">
                Variance:{' '}
                <strong
                  className={
                    variance < 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }
                >
                  {variance > 0 ? '+' : ''}
                  {formatMoney(variance, currencyCode)}
                </strong>{' '}
                ({variance < 0 ? 'shortage' : 'surplus'}). An open reconciliation will be recorded.
              </FieldDescription>
            )
          ) : (
            <FieldDescription className="text-[11px] text-muted-foreground">
              Enter the balance from your bank statement, mobile wallet, or physical cash count.
            </FieldDescription>
          )}
        </Field>
      </div>
    </ActionDialog>
  );
}
