'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { FinancialAccountDto } from '@maevelle/contracts';
import { Sparkles } from 'lucide-react';

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

export type AccountType = 'MOBILE_WALLET' | 'BANK' | 'CASH' | 'OTHER';

function getNextAvailableCode(
  prefix: string,
  existingAccounts: readonly FinancialAccountDto[],
): string {
  const normalizedPrefix = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ACC';
  const existingNumbers = new Set(
    existingAccounts.map((a) => a.account_number.toUpperCase().trim()),
  );

  for (let i = 1; i <= 99; i++) {
    const candidate = `${normalizedPrefix}-${String(i).padStart(2, '0')}`;
    if (!existingNumbers.has(candidate)) {
      return candidate;
    }
  }
  return `${normalizedPrefix}-${Date.now().toString().slice(-4)}`;
}

function deriveCodeFromName(
  name: string,
  type: AccountType,
  existingAccounts: readonly FinancialAccountDto[],
): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let prefix = '';
  const firstWord = words[0];
  if (words.length === 1 && firstWord) {
    prefix = firstWord.slice(0, 6).toUpperCase();
  } else if (words.length > 1) {
    prefix = words
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 5)
      .toUpperCase();
  } else {
    prefix =
      type === 'BANK'
        ? 'BANK'
        : type === 'MOBILE_WALLET'
          ? 'BKASH'
          : type === 'CASH'
            ? 'CASH'
            : 'COURIER';
  }
  return getNextAvailableCode(prefix, existingAccounts);
}

export interface CreateFinancialAccountDialogProps {
  readonly open: boolean;
  readonly existingAccounts?: readonly FinancialAccountDto[];
  readonly busy?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
  readonly onCommand: (path: string, body: Record<string, unknown>) => Promise<void>;
}

export function CreateFinancialAccountDialog({
  open,
  existingAccounts = [],
  busy = false,
  onOpenChange,
  onSuccess,
  onCommand,
}: CreateFinancialAccountDialogProps) {
  const [accountType, setAccountType] = useState<AccountType>('MOBILE_WALLET');
  const [name, setName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [currencyCode, setCurrencyCode] = useState('BDT');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [userCustomizedCode, setUserCustomizedCode] = useState(false);
  const [inDialogError, setInDialogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset when dialog opens
  useEffect(() => {
    if (open) {
      setInDialogError(null);
      setIsSubmitting(false);
      if (!name) {
        setAccountType('MOBILE_WALLET');
        setName('');
        setAccountNumber(getNextAvailableCode('BKASH', existingAccounts));
        setCurrencyCode('BDT');
        setReferenceLabel('');
        setOpeningBalance('');
        setUserCustomizedCode(false);
      }
    }
  }, [open, existingAccounts, name]);

  const handleTypeChange = useCallback(
    (newType: AccountType) => {
      setAccountType(newType);
      if (!userCustomizedCode) {
        const prefix =
          newType === 'BANK'
            ? 'BANK'
            : newType === 'MOBILE_WALLET'
              ? 'BKASH'
              : newType === 'CASH'
                ? 'CASH'
                : 'STEADFAST';
        setAccountNumber(getNextAvailableCode(prefix, existingAccounts));
      }
    },
    [existingAccounts, userCustomizedCode],
  );

  const handleNameChange = useCallback(
    (newName: string) => {
      setName(newName);
      if (!userCustomizedCode && newName.trim().length >= 2) {
        setAccountNumber(deriveCodeFromName(newName, accountType, existingAccounts));
      }
    },
    [accountType, existingAccounts, userCustomizedCode],
  );

  const handleAutoSuggestCode = useCallback(() => {
    const code = deriveCodeFromName(name || accountType, accountType, existingAccounts);
    setAccountNumber(code);
    setUserCustomizedCode(true);
  }, [accountType, existingAccounts, name]);

  const normalizedCode = accountNumber.trim().toUpperCase();
  const conflictingAccount = useMemo(() => {
    if (!normalizedCode) return null;
    return (
      existingAccounts.find((a) => a.account_number.toUpperCase().trim() === normalizedCode) ?? null
    );
  }, [existingAccounts, normalizedCode]);

  const cleanOpeningBalance = useMemo(() => {
    return openingBalance.replace(/,/g, '').trim();
  }, [openingBalance]);

  const parsedOpeningBalance = useMemo(() => {
    if (!cleanOpeningBalance) return 0;
    const num = Number(cleanOpeningBalance);
    return Number.isFinite(num) ? num : NaN;
  }, [cleanOpeningBalance]);

  const isOpeningBalanceInvalid = useMemo(() => {
    if (!cleanOpeningBalance) return false;
    return Number.isNaN(parsedOpeningBalance) || !/^-?\d+(\.\d{1,4})?$/.test(cleanOpeningBalance);
  }, [cleanOpeningBalance, parsedOpeningBalance]);

  const currentReferencePlaceholder = useMemo(() => {
    switch (accountType) {
      case 'BANK':
        return 'e.g. A/C 150-120-xxxxxx, Gulshan Branch';
      case 'MOBILE_WALLET':
        return 'e.g. 01711-xxxxxx (Merchant Wallet)';
      case 'CASH':
        return 'e.g. Flagship Store Counter #1';
      case 'OTHER':
        return 'e.g. Steadfast Merchant CID #48920';
    }
  }, [accountType]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInDialogError(null);

    if (!name.trim()) {
      setInDialogError('Account name is required.');
      return;
    }

    if (!normalizedCode) {
      setInDialogError('Account code is required.');
      return;
    }

    if (conflictingAccount) {
      setInDialogError(
        `Account code "${normalizedCode}" is already in use by "${conflictingAccount.name}".`,
      );
      return;
    }

    if (isOpeningBalanceInvalid) {
      setInDialogError('Opening balance must be a valid decimal amount (e.g. 15000 or 15000.50).');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCommand('/admin/finance/accounts', {
        accountNumber: normalizedCode,
        name: name.trim(),
        accountType,
        currencyCode: currencyCode.trim().toUpperCase(),
        referenceLabel: referenceLabel.trim() || undefined,
        openingBalance: cleanOpeningBalance || undefined,
      });

      setName('');
      setAccountNumber('');
      setReferenceLabel('');
      setOpeningBalance('');
      setUserCustomizedCode(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      setInDialogError(
        error instanceof Error ? error.message : 'Financial account could not be created.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormBusy = busy || isSubmitting;

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Create financial account"
      description="Add a bank account, mobile wallet, cash drawer, or courier clearing account."
      onSubmit={handleSubmit}
      error={inDialogError}
      busy={isFormBusy}
      submitLabel="Create account"
      busyLabel="Creating…"
      submitDisabled={Boolean(conflictingAccount) || isOpeningBalanceInvalid}
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel className="text-xs font-medium">Account name</FieldLabel>
          <Input
            name="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Main bKash Wallet"
            disabled={isFormBusy}
            required
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel className="text-xs font-medium">Account type</FieldLabel>
          <NativeSelect
            name="accountType"
            value={accountType}
            onChange={(e) => handleTypeChange(e.target.value as AccountType)}
            disabled={isFormBusy}
            className="w-full"
          >
            <option value="MOBILE_WALLET">Mobile wallet (bKash, Nagad…)</option>
            <option value="BANK">Bank account</option>
            <option value="CASH">Cash drawer / register</option>
            <option value="OTHER">Courier holding / other</option>
          </NativeSelect>
        </Field>

        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel className="text-xs font-medium">Account code</FieldLabel>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleAutoSuggestCode}
              disabled={isFormBusy}
              className="h-4 px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="size-3 mr-1" /> Suggest
            </Button>
          </div>
          <Input
            name="accountNumber"
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value.toUpperCase());
              setUserCustomizedCode(true);
            }}
            placeholder="BKASH-01"
            disabled={isFormBusy}
            required
          />
          {conflictingAccount ? (
            <FieldError className="text-[11px]">
              Already used by &quot;{conflictingAccount.name}&quot;
            </FieldError>
          ) : null}
        </Field>

        <Field>
          <FieldLabel className="text-xs font-medium">Currency</FieldLabel>
          <NativeSelect
            name="currencyCode"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            disabled={isFormBusy}
            className="w-full"
          >
            <option value="BDT">BDT — Bangladeshi Taka (৳)</option>
            <option value="USD">USD — US Dollar ($)</option>
            <option value="EUR">EUR — Euro (€)</option>
            <option value="GBP">GBP — British Pound (£)</option>
          </NativeSelect>
        </Field>

        <Field>
          <FieldLabel className="text-xs font-medium">
            Reference <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            name="referenceLabel"
            value={referenceLabel}
            onChange={(e) => setReferenceLabel(e.target.value)}
            placeholder={currentReferencePlaceholder}
            disabled={isFormBusy}
            maxLength={200}
          />
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel className="text-xs font-medium">
            Opening balance <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <span className="text-xs font-medium text-muted-foreground">{currencyCode}</span>
            </InputGroupAddon>
            <InputGroupInput
              name="openingBalance"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              disabled={isFormBusy}
            />
            {openingBalance ? (
              <InputGroupButton
                size="xs"
                onClick={() => setOpeningBalance('')}
                disabled={isFormBusy}
              >
                Clear
              </InputGroupButton>
            ) : null}
          </InputGroup>
          {isOpeningBalanceInvalid ? (
            <FieldError className="text-[11px]">
              Please enter a valid numeric amount (e.g. 15000 or 15000.50).
            </FieldError>
          ) : (
            <FieldDescription className="text-[11px] text-muted-foreground">
              Immutable opening ledger entry. Leave empty for zero starting balance.
            </FieldDescription>
          )}
        </Field>
      </div>
    </ActionDialog>
  );
}
