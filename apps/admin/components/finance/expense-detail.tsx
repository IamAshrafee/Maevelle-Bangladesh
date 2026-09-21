'use client';

import { ArrowLeft, Ban, CreditCard, ExternalLink, PencilLine, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import type { FinanceExpenseDetailDto, FinancialAccountDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import {
  FinanceCommandDialog,
  type FinanceDialogState,
} from '@/components/finance/finance-dialogs';
import { OperationalFeedback } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';

export function ExpenseDetail({ expenseId }: { readonly expenseId: string }) {
  const canPay = useAdminCapability('finance.expenses.pay');
  const canCancel = useAdminCapability('finance.expenses.create');
  const canAdjust = useAdminCapability('finance.expenses.create');
  const canViewAccounts = useAdminCapability('finance.accounts.view');
  const [expense, setExpense] = useState<FinanceExpenseDetailDto>();
  const [accounts, setAccounts] = useState<readonly FinancialAccountDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<FinanceDialogState>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'danger'>('success');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [detail, financialAccounts] = await Promise.all([
        fetchApiData<FinanceExpenseDetailDto>(`/admin/finance/expenses/${expenseId}`),
        canViewAccounts
          ? fetchApiData<readonly FinancialAccountDto[]>('/admin/finance/accounts')
          : Promise.resolve([]),
      ]);
      setExpense(detail);
      setAccounts(financialAccounts);
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Expense could not be loaded.');
      setTone('danger');
      setState('error');
    }
  }, [canViewAccounts, expenseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function command(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(path, {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          ...(path.endsWith('/pay') ? { idempotencyKey: crypto.randomUUID() } : {}),
        }),
      });
      setDialog(undefined);
      setMessage('Expense payment recorded and account balance refreshed.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Expense operation was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expense) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
    setBusy(true);
    try {
      await fetchApiData(`/admin/finance/expenses/${expense.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: expense.version, reason }),
      });
      setCancelOpen(false);
      setMessage('Unpaid Expense cancelled. The audit history remains available.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Expense cancellation was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expense) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/finance/expenses/${expense.id}/adjustments`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: expense.version,
          adjustmentType: form.get('adjustmentType'),
          amount: form.get('amount'),
          reason: form.get('reason'),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setAdjustmentOpen(false);
      setMessage('Expense adjustment recorded without changing the original amount.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Expense adjustment was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading' && !expense)
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-xl lg:col-span-2" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </main>
    );

  if (!expense)
    return (
      <main className="grid gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Expense was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/finance/expenses" />}>
          <ArrowLeft /> Back to expenses
        </Button>
      </main>
    );

  const paid = Number(expense.outstanding) === 0 && expense.status !== 'CANCELLED';
  const canCancelCurrent = canCancel && expense.status === 'RECORDED' && Number(expense.paid) === 0;
  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1400px] gap-5">
        <Breadcrumb
          mobileMode="back"
          items={[
            { label: 'Finance', href: '/finance' },
            { label: 'Expenses', href: '/finance/expenses' },
            { label: expense.expense_number, current: true },
          ]}
        />
        <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{expense.description}</h1>
              <StatusBadge
                status={
                  expense.status === 'CANCELLED' ? 'CANCELLED' : paid ? 'PAID' : 'OUTSTANDING'
                }
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {expense.expense_number} · {expense.category_name} ·{' '}
              {formatFinanceDate(expense.expense_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAdjust && expense.status === 'RECORDED' ? (
              <Button variant="outline" onClick={() => setAdjustmentOpen(true)}>
                <PencilLine /> Adjust
              </Button>
            ) : null}
            {canCancelCurrent ? (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban /> Cancel Expense
              </Button>
            ) : null}
            {canPay && expense.status === 'RECORDED' && Number(expense.outstanding) > 0 ? (
              <Button onClick={() => setDialog({ kind: 'expense-payment', expense })}>
                <CreditCard /> Pay Expense
              </Button>
            ) : null}
          </div>
        </header>
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Original amount', formatMoney(expense.amount, expense.currency_code)],
            ['Paid', formatMoney(expense.paid, expense.currency_code)],
            ['Adjustments', formatMoney(expense.adjustments, expense.currency_code)],
            ['Outstanding', formatMoney(expense.outstanding, expense.currency_code)],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <span className="text-xs text-muted-foreground">{label}</span>
                <strong className="mt-1 block text-xl">{value}</strong>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Expense details</CardTitle>
              <CardDescription>
                Merchant-facing context and related business source.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail
                label="Category"
                value={`${expense.category_name} · ${humanizeFinanceCode(expense.category_classification)}`}
              />
              <Detail label="Payee / vendor" value={expense.payee_name ?? 'Not recorded'} />
              <Detail
                label="Expense reference"
                value={expense.external_reference ?? 'Not recorded'}
              />
              <Detail label="Created" value={formatFinanceDate(expense.created_at, true)} />
              {expense.source_domain === 'procurement.purchase' && expense.source_id ? (
                <div>
                  <span className="text-xs text-muted-foreground">Related purchase</span>
                  <Link
                    className="mt-1 flex items-center gap-1 font-medium text-primary hover:underline"
                    href={`/purchases/${expense.source_id}`}
                  >
                    {expense.source_reference ?? 'Purchase'}
                    {expense.source_counterparty ? ` · ${expense.source_counterparty}` : ''}
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              ) : null}
              {expense.notes ? (
                <Detail className="sm:col-span-2" label="Notes" value={expense.notes} />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
              <CardDescription>Immutable account-backed money movement.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {expense.payments.length ? (
                expense.payments.map((payment) => (
                  <div key={payment.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span>
                        <Link
                          className="font-medium text-primary hover:underline"
                          href={`/finance/accounts/${payment.accountId}`}
                        >
                          {payment.accountName}
                        </Link>
                        <small className="block text-muted-foreground">
                          {payment.transactionNumber} · {formatFinanceDate(payment.paidAt, true)}
                        </small>
                      </span>
                      <strong>{formatMoney(payment.amount, expense.currency_code)}</strong>
                    </div>
                    {payment.reference ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Reference: {payment.reference}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No account payment has been recorded.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Adjustments</CardTitle>
              <CardDescription>
                Corrections and credits retained separately from the original amount.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {expense.adjustmentHistory.length ? (
                expense.adjustmentHistory.map((adjustment) => (
                  <div
                    key={adjustment.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span>
                      <strong>{humanizeFinanceCode(adjustment.type)}</strong>
                      <small className="block text-muted-foreground">
                        {adjustment.reason} · {formatFinanceDate(adjustment.createdAt, true)}
                      </small>
                    </span>
                    <strong>{formatMoney(adjustment.amount, expense.currency_code)}</strong>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No adjustments recorded.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="size-4" /> Activity
              </CardTitle>
              <CardDescription>Audited lifecycle events for this Expense.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {expense.activity.map((event) => (
                <div key={event.id} className="rounded-lg border p-3 text-sm">
                  <strong>
                    {humanizeFinanceCode(event.action.replace('finance.expense.', ''))}
                  </strong>
                  <small className="block text-muted-foreground">
                    {formatFinanceDate(event.occurredAt, true)}
                  </small>
                  {event.reason ? <p className="mt-1">{event.reason}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <FinanceCommandDialog
          state={dialog}
          accounts={accounts}
          categories={[]}
          busy={busy}
          onClose={() => setDialog(undefined)}
          onCommand={command}
        />
        <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
          <DialogContent>
            <form className="grid gap-4" onSubmit={adjust}>
              <DialogHeader>
                <DialogTitle>Adjust {expense.expense_number}</DialogTitle>
                <DialogDescription>
                  Keep the original Expense intact while recording a traceable correction. Credits
                  and reversals require a negative amount.
                </DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-sm font-medium">
                Adjustment type
                <NativeSelect name="adjustmentType" defaultValue="CORRECTION" required>
                  <option value="CORRECTION">Correction</option>
                  <option value="CREDIT">Credit</option>
                  <option value="REVERSAL">Reversal</option>
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Signed amount
                <Input
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  placeholder="Use -500.00 to reduce the Expense"
                  required
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Reason
                <Textarea name="reason" minLength={4} maxLength={1000} required />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdjustmentOpen(false)}>
                  Close
                </Button>
                <Button type="submit" disabled={busy}>
                  Record adjustment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent>
            <form className="grid gap-4" onSubmit={cancel}>
              <DialogHeader>
                <DialogTitle>Cancel {expense.expense_number}</DialogTitle>
                <DialogDescription>
                  Only unpaid Expenses can be cancelled. The record and reason remain in audit
                  history.
                </DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-sm font-medium">
                Cancellation reason
                <Textarea name="reason" minLength={4} maxLength={1000} required autoFocus />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                  Keep Expense
                </Button>
                <Button type="submit" variant="destructive" disabled={busy}>
                  Cancel Expense
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
