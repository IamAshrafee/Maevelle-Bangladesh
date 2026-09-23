'use client';

import { type FormEvent, useState } from 'react';
import type { FinanceAccountDetailDto } from '@maevelle/contracts';
import { AlertTriangle, DollarSign } from 'lucide-react';

import { ActionDialog } from '@/components/ui/action-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api';
import { formatMoney } from '@/lib/finance/types';

export interface SetOpeningBalanceDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly account: FinanceAccountDetailDto;
  readonly onSuccess: () => Promise<void> | void;
}

export function SetOpeningBalanceDialog({
  open,
  onOpenChange,
  account,
  onSuccess,
}: SetOpeningBalanceDialogProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setError(null);
    setValidationError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setValidationError(null);

    const cleanAmount = amount.replace(/,/g, '').trim();
    const num = Number(cleanAmount);
    if (!cleanAmount || isNaN(num) || num <= 0) {
      setValidationError('Please enter a valid amount greater than zero.');
      return;
    }

    setBusy(true);
    try {
      await apiRequest(
        `/admin/finance/accounts/${encodeURIComponent(account.id)}/opening-balance`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: cleanAmount,
            description: description.trim() || undefined,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      handleOpenChange(false);
      await onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to record opening balance.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Set Initial Opening Balance"
      description={`Record the one-time starting float or initial balance for ${account.name}.`}
      icon={DollarSign}
      size="md"
      busy={busy}
      submitLabel="Record Opening Balance"
      busyLabel="Recording..."
      submitDisabled={busy || !amount.trim()}
      error={error}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{account.name}</span>
            <Badge variant="outline">{account.currency_code}</Badge>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Account code: {account.account_number}</span>
            <span>Current balance: {formatMoney(account.ledger_balance, account.currency_code)}</span>
          </div>
        </div>

        <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-xs font-semibold">One-time action</AlertTitle>
          <AlertDescription className="text-xs">
            This opening balance can only be set once while the account balance is zero. After posting, it cannot be changed or resubmitted.
          </AlertDescription>
        </Alert>

        <Field>
          <FieldLabel htmlFor="opening-balance-amount">
            Opening balance amount ({account.currency_code})
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <span className="text-xs font-medium text-muted-foreground">
                {account.currency_code}
              </span>
            </InputGroupAddon>
            <InputGroupInput
              id="opening-balance-amount"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 15,000.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setValidationError(null);
              }}
              autoFocus
              required
            />
          </InputGroup>
          {validationError ? (
            <FieldError>{validationError}</FieldError>
          ) : (
            <FieldDescription>
              Enter the starting funds or cash float deposited into this account.
            </FieldDescription>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="opening-balance-description">
            Description or notes (optional)
          </FieldLabel>
          <Textarea
            id="opening-balance-description"
            rows={2}
            placeholder="e.g. Initial float, Owner capital, or Cash drawer opening"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FieldDescription>
            Optional reference recorded with this ledger transaction and in the audit log.
          </FieldDescription>
        </Field>
      </div>
    </ActionDialog>
  );
}
