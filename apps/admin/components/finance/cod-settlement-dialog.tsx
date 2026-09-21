'use client';

import { type FormEvent, useMemo, useState } from 'react';

import type { FinancialAccountDto, OutstandingCodSettlementPaymentDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatFinanceDate, formatMoney } from '@/lib/finance/types';

type Command = (path: string, body: Record<string, unknown>) => Promise<void>;

export function CodSettlementDialog({
  open,
  payments,
  accounts,
  busy,
  onOpenChange,
  onCommand,
}: {
  readonly open: boolean;
  readonly payments: readonly OutstandingCodSettlementPaymentDto[];
  readonly accounts: readonly FinancialAccountDto[];
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCommand: Command;
}) {
  const eligible = useMemo(() => payments.filter((payment) => payment.canSettle), [payments]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [amounts, setAmounts] = useState<Readonly<Record<string, string>>>({});
  const selectedPayments = eligible.filter((payment) => selected.has(payment.paymentId));
  const anchor = selectedPayments[0];
  const gross = selectedPayments.reduce(
    (total, payment) => total + Number(amounts[payment.paymentId] ?? payment.outstandingAmount),
    0,
  );

  function toggle(payment: OutstandingCodSettlementPaymentDto, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(payment.paymentId);
      else next.delete(payment.paymentId);
      return next;
    });
    if (checked)
      setAmounts((current) => ({
        ...current,
        [payment.paymentId]: payment.outstandingAmount,
      }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const localDate = String(data.get('settledAt') ?? '').trim();
    await onCommand('/admin/finance/cod-settlements', {
      destinationAccountId: data.get('destinationAccountId'),
      remittanceReference: data.get('remittanceReference'),
      deductionAmount: data.get('deductionAmount') || '0',
      deductionNote: data.get('deductionNote') || undefined,
      settledAt: localDate ? new Date(localDate).toISOString() : undefined,
      allocations: selectedPayments.map((payment) => ({
        paymentId: payment.paymentId,
        amount: amounts[payment.paymentId] ?? payment.outstandingAmount,
      })),
    });
  }

  const destinationAccounts = accounts.filter(
    (account) =>
      account.status === 'ACTIVE' &&
      account.currency_code === anchor?.currency &&
      account.id !== anchor.sourceAccountId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form className="grid gap-5" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Record courier COD settlement</DialogTitle>
            <DialogDescription>
              Match a courier remittance to collected COD Payments. The holding-account reduction,
              bank receipt, deduction, allocations, audit event, and remittance reference are saved
              together.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Payments included</legend>
            {eligible.length ? (
              eligible.map((payment) => {
                const compatible =
                  !anchor ||
                  selected.has(payment.paymentId) ||
                  (payment.sourceAccountId === anchor.sourceAccountId &&
                    payment.currency === anchor.currency &&
                    payment.carrierName.toLocaleLowerCase() ===
                      anchor.carrierName.toLocaleLowerCase());
                const checked = selected.has(payment.paymentId);
                return (
                  <div
                    key={payment.paymentId}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[auto_1fr_9rem] sm:items-center"
                  >
                    <Checkbox
                      aria-label={`Include ${payment.paymentNumber}`}
                      checked={checked}
                      disabled={!compatible}
                      onCheckedChange={(value) => toggle(payment, value === true)}
                    />
                    <span className="min-w-0">
                      <strong className="block truncate">
                        {payment.paymentNumber} · {payment.orderNumber}
                      </strong>
                      <span className="block text-xs text-muted-foreground">
                        {payment.carrierName} · {payment.sourceAccountName} · collected{' '}
                        {formatFinanceDate(payment.collectedAt)}
                      </span>
                    </span>
                    <Input
                      aria-label={`Allocation for ${payment.paymentNumber}`}
                      inputMode="decimal"
                      disabled={!checked}
                      required={checked}
                      value={amounts[payment.paymentId] ?? payment.outstandingAmount}
                      onChange={(event) =>
                        setAmounts((current) => ({
                          ...current,
                          [payment.paymentId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No posted COD Payments are ready for settlement. Post a collected COD Payment to a
                courier holding account first.
              </p>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Receiving account
              <NativeSelect className="w-full" name="destinationAccountId" required defaultValue="">
                <option value="" disabled>
                  Choose account
                </option>
                {destinationAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {formatMoney(account.ledger_balance, account.currency_code)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Remittance reference
              <Input name="remittanceReference" maxLength={200} required />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Settlement time
              <Input name="settledAt" type="datetime-local" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Courier deduction
              <Input name="deductionAmount" inputMode="decimal" defaultValue="0" required />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Deduction explanation
            <Textarea
              name="deductionNote"
              maxLength={1000}
              placeholder="Required when a courier charge or other amount was withheld."
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-4 py-3 text-sm">
            <span>{selected.size} Payments selected</span>
            <strong>Gross allocation {formatMoney(gross, anchor?.currency ?? 'BDT')}</strong>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy || selected.size === 0 || destinationAccounts.length === 0 || gross <= 0
              }
            >
              Record settlement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
