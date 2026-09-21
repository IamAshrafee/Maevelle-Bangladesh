'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { FinancialAccountDto } from '@maevelle/contracts';
import { ArrowLeftRight } from 'lucide-react';

import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { NativeSelect } from '@/components/ui/native-select';
import { formatMoney } from '@/lib/finance/types';

export interface TransferFundsDialogProps {
  readonly open: boolean;
  readonly accounts: readonly FinancialAccountDto[];
  readonly defaultSourceAccountId?: string | undefined;
  readonly busy?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
  readonly onCommand: (path: string, body: Record<string, unknown>) => Promise<void>;
}

export function TransferFundsDialog({
  open,
  accounts,
  defaultSourceAccountId,
  busy = false,
  onOpenChange,
  onSuccess,
  onCommand,
}: TransferFundsDialogProps) {
  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'ACTIVE'),
    [accounts],
  );

  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [inDialogError, setInDialogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset source/destination when opened
  useEffect(() => {
    if (open) {
      setInDialogError(null);
      setIsSubmitting(false);
      setAmount('');
      setReference('');

      const initialSource =
        defaultSourceAccountId && activeAccounts.some((a) => a.id === defaultSourceAccountId)
          ? defaultSourceAccountId
          : (activeAccounts[0]?.id ?? '');

      setSourceAccountId(initialSource);

      const sourceAccount = activeAccounts.find((a) => a.id === initialSource);
      if (sourceAccount) {
        const firstMatchingDest = activeAccounts.find(
          (a) => a.id !== initialSource && a.currency_code === sourceAccount.currency_code,
        );
        setDestinationAccountId(firstMatchingDest?.id ?? '');
      } else {
        setDestinationAccountId('');
      }
    }
  }, [open, defaultSourceAccountId, activeAccounts]);

  const sourceAccount = useMemo(
    () => activeAccounts.find((a) => a.id === sourceAccountId) ?? null,
    [activeAccounts, sourceAccountId],
  );

  const currencyCode = sourceAccount?.currency_code ?? 'BDT';
  const sourceBalanceNum = useMemo(
    () => (sourceAccount ? Number(sourceAccount.ledger_balance) : 0),
    [sourceAccount],
  );

  // Eligible destination accounts: must be active, same currency, and not source
  const eligibleDestinations = useMemo(() => {
    if (!sourceAccount) return [];
    return activeAccounts.filter(
      (a) => a.id !== sourceAccount.id && a.currency_code === sourceAccount.currency_code,
    );
  }, [activeAccounts, sourceAccount]);

  const destinationAccount = useMemo(
    () => eligibleDestinations.find((a) => a.id === destinationAccountId) ?? null,
    [eligibleDestinations, destinationAccountId],
  );

  const handleSourceChange = useCallback(
    (newSourceId: string) => {
      setSourceAccountId(newSourceId);
      const newSource = activeAccounts.find((a) => a.id === newSourceId);
      if (newSource) {
        // If current destination does not match currency or is same account, pick first eligible
        const stillValid = eligibleDestinations.some(
          (a) => a.id === destinationAccountId && a.currency_code === newSource.currency_code,
        );
        if (!stillValid) {
          const nextDest = activeAccounts.find(
            (a) => a.id !== newSourceId && a.currency_code === newSource.currency_code,
          );
          setDestinationAccountId(nextDest?.id ?? '');
        }
      }
    },
    [activeAccounts, destinationAccountId, eligibleDestinations],
  );

  const handleSwapAccounts = useCallback(() => {
    if (!sourceAccountId || !destinationAccountId) return;
    const oldSource = sourceAccountId;
    const oldDest = destinationAccountId;
    setSourceAccountId(oldDest);
    setDestinationAccountId(oldSource);
  }, [sourceAccountId, destinationAccountId]);

  const cleanAmount = useMemo(() => amount.replace(/,/g, '').trim(), [amount]);
  const parsedAmount = useMemo(() => {
    if (!cleanAmount) return 0;
    const num = Number(cleanAmount);
    return Number.isFinite(num) ? num : NaN;
  }, [cleanAmount]);

  const isAmountInvalid = useMemo(() => {
    if (!cleanAmount) return false;
    return Number.isNaN(parsedAmount) || parsedAmount <= 0 || !/^\d+(\.\d{1,4})?$/.test(cleanAmount);
  }, [cleanAmount, parsedAmount]);

  const isInsufficientBalance = useMemo(() => {
    if (!sourceAccount || Number.isNaN(parsedAmount) || parsedAmount <= 0) return false;
    return parsedAmount > sourceBalanceNum;
  }, [parsedAmount, sourceAccount, sourceBalanceNum]);

  const fillMaxAmount = useCallback(() => {
    if (sourceBalanceNum > 0) {
      setAmount(sourceBalanceNum.toString());
    }
  }, [sourceBalanceNum]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInDialogError(null);

    if (!sourceAccountId || !destinationAccountId) {
      setInDialogError('Both source and destination accounts are required.');
      return;
    }

    if (sourceAccountId === destinationAccountId) {
      setInDialogError('Source and destination accounts must differ.');
      return;
    }

    if (isAmountInvalid || parsedAmount <= 0) {
      setInDialogError('Please enter a valid transfer amount greater than zero.');
      return;
    }

    if (isInsufficientBalance) {
      setInDialogError(
        `Insufficient balance. Source account only has ${currencyCode} ${formatMoney(sourceAccount?.ledger_balance ?? 0, currencyCode)} available.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onCommand('/admin/finance/transfers', {
        sourceAccountId,
        destinationAccountId,
        amount: cleanAmount,
        reference: reference.trim() || undefined,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      setInDialogError(
        error instanceof Error ? error.message : 'Internal transfer could not be processed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormBusy = busy || isSubmitting;
  const canSubmit =
    !isFormBusy &&
    Boolean(sourceAccountId) &&
    Boolean(destinationAccountId) &&
    Boolean(cleanAmount) &&
    !isAmountInvalid &&
    !isInsufficientBalance;

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Transfer between accounts"
      description="Internal transfers move money without recording revenue or expenses."
      onSubmit={handleSubmit}
      error={inDialogError}
      busy={isFormBusy}
      submitLabel="Transfer funds"
      busyLabel="Transferring…"
      submitDisabled={!canSubmit}
    >
      <div className="grid gap-3.5">
        {/* From Account */}
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel className="text-xs font-medium">From account</FieldLabel>
            {sourceAccount ? (
              <span className="text-[11px] text-muted-foreground">
                Available:{' '}
                <strong className="text-foreground">
                  {formatMoney(sourceAccount.ledger_balance, currencyCode)}
                </strong>
              </span>
            ) : null}
          </div>
          <NativeSelect
            name="sourceAccountId"
            value={sourceAccountId}
            onChange={(e) => handleSourceChange(e.target.value)}
            disabled={isFormBusy}
            required
            className="w-full"
          >
            <option value="" disabled>
              Select source account
            </option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.account_number}) ·{' '}
                {formatMoney(account.ledger_balance, account.currency_code)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {/* Swap button divider */}
        <div className="relative -my-1 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/60" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleSwapAccounts}
            disabled={isFormBusy || !destinationAccountId}
            className="relative z-10 h-6 gap-1 rounded-full bg-background px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
            title="Swap source and destination"
          >
            <ArrowLeftRight className="size-3" /> Swap
          </Button>
        </div>

        {/* To Account */}
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel className="text-xs font-medium">To account</FieldLabel>
            {destinationAccount ? (
              <span className="text-[11px] text-muted-foreground">
                Current:{' '}
                <strong className="text-foreground">
                  {formatMoney(
                    destinationAccount.ledger_balance,
                    destinationAccount.currency_code,
                  )}
                </strong>
              </span>
            ) : null}
          </div>
          <NativeSelect
            name="destinationAccountId"
            value={destinationAccountId}
            onChange={(e) => setDestinationAccountId(e.target.value)}
            disabled={isFormBusy || eligibleDestinations.length === 0}
            required
            className="w-full"
          >
            {eligibleDestinations.length === 0 ? (
              <option value="" disabled>
                No matching {currencyCode} accounts available
              </option>
            ) : (
              <>
                <option value="" disabled>
                  Select destination account
                </option>
                {eligibleDestinations.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.account_number}) ·{' '}
                    {formatMoney(account.ledger_balance, account.currency_code)}
                  </option>
                ))}
              </>
            )}
          </NativeSelect>
        </Field>

        {/* Transfer Amount */}
        <Field>
          <FieldLabel className="text-xs font-medium">Amount</FieldLabel>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <span className="text-xs font-medium text-muted-foreground">{currencyCode}</span>
            </InputGroupAddon>
            <InputGroupInput
              name="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              disabled={isFormBusy}
              required
            />
            {sourceBalanceNum > 0 ? (
              <InputGroupButton
                size="xs"
                onClick={fillMaxAmount}
                disabled={isFormBusy}
                title={`Fill max available (${currencyCode} ${formatMoney(sourceBalanceNum, currencyCode)})`}
              >
                Max
              </InputGroupButton>
            ) : null}
          </InputGroup>

          {isInsufficientBalance ? (
            <FieldError className="text-[11px]">
              Amount exceeds available balance ({currencyCode}{' '}
              {formatMoney(sourceBalanceNum, currencyCode)}).
            </FieldError>
          ) : isAmountInvalid ? (
            <FieldError className="text-[11px]">
              Please enter a valid amount greater than zero.
            </FieldError>
          ) : parsedAmount > 0 && destinationAccount && sourceAccount ? (
            <FieldDescription className="text-[11px] text-muted-foreground">
              New balances: {sourceAccount.name} (
              {formatMoney(sourceBalanceNum - parsedAmount, currencyCode)}) →{' '}
              {destinationAccount.name} (
              {formatMoney(Number(destinationAccount.ledger_balance) + parsedAmount, currencyCode)}
              )
            </FieldDescription>
          ) : null}
        </Field>

        {/* Reference */}
        <Field>
          <FieldLabel className="text-xs font-medium">
            Reference <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            name="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. Cash deposit to bank, wallet refill"
            disabled={isFormBusy}
            maxLength={200}
          />
        </Field>
      </div>
    </ActionDialog>
  );
}
