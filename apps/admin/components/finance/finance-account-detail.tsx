'use client';

import { ArrowLeft, CheckCircle2, Coins, Power, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import type {
  FinanceAccountDetailDto,
  FinanceLedgerEntryDto,
  PaginatedResultDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { SetOpeningBalanceDialog } from '@/components/finance/set-opening-balance-dialog';
import { ActivitySection } from '@/components/finance/finance-sections';
import { StatusBadge } from '@/components/status-badge';
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
import { Textarea } from '@/components/ui/textarea';
import { apiRequest, fetchApiData } from '@/lib/api';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';

export function FinanceAccountDetail({ accountId }: { readonly accountId: string }) {
  const [account, setAccount] = useState<FinanceAccountDetailDto>();
  const [entries, setEntries] = useState<readonly FinanceLedgerEntryDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [openingBalanceDialogOpen, setOpeningBalanceDialogOpen] = useState(false);

  const canManage = useAdminCapability('finance.accounts.manage');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [accountDetail, activityResult] = await Promise.all([
        fetchApiData<FinanceAccountDetailDto>(
          `/admin/finance/accounts/${encodeURIComponent(accountId)}`,
        ),
        fetchApiData<PaginatedResultDto<FinanceLedgerEntryDto>>(
          `/admin/finance/ledger?accountId=${encodeURIComponent(accountId)}&pageSize=100`,
        ),
      ]);
      if (!accountDetail) throw new Error('Financial account was not found.');
      setAccount(accountDetail);
      setEntries(activityResult?.items ?? []);
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Financial account could not be loaded.');
      setState('error');
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStatusChange(event: FormEvent) {
    event.preventDefault();
    if (!account) return;
    setStatusBusy(true);
    setStatusError('');
    const targetStatus = account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiRequest(`/admin/finance/accounts/${encodeURIComponent(accountId)}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: targetStatus,
          expectedVersion: Number(account.version),
          reason: statusReason.trim(),
        }),
      });
      setStatusDialogOpen(false);
      setStatusReason('');
      await load();
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : 'Account status could not be changed.',
      );
    } finally {
      setStatusBusy(false);
    }
  }

  if (state === 'loading')
    return (
      <main className="grid gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </main>
    );
  if (state === 'error' || !account)
    return (
      <main className="grid gap-4 px-4 py-10 text-sm">
        <p className="text-destructive">
          <XCircle className="mr-2 inline size-4" />
          {message}
        </p>
        <Button render={<Link href="/finance/accounts" />} variant="outline">
          <ArrowLeft /> Back to accounts
        </Button>
      </main>
    );

  const inflow = account.summary.totalInflow;
  const outflow = account.summary.totalOutflow;
  const entryCount = account.summary.entryCount;
  const isAccountActive = account.status === 'ACTIVE';

  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              href="/finance/accounts"
            >
              <ArrowLeft className="size-4" /> Financial accounts
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
              <StatusBadge status={account.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {humanizeFinanceCode(account.account_type)} · {account.account_number}
              {account.reference_label ? ` · ${account.reference_label}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && account.canSetOpeningBalance ? (
              <Button
                variant="default"
                onClick={() => setOpeningBalanceDialogOpen(true)}
              >
                <Coins className="mr-1.5 size-4" />
                Set opening balance
              </Button>
            ) : null}
            {canManage ? (
              <Button
                variant={isAccountActive ? 'outline' : 'default'}
                onClick={() => {
                  setStatusError('');
                  setStatusReason('');
                  setStatusDialogOpen(true);
                }}
              >
                <Power className="mr-1.5 size-4" />
                {isAccountActive ? 'Deactivate account' : 'Activate account'}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 size-4" /> Refresh
            </Button>
          </div>
        </header>

        {account.canSetOpeningBalance ? (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Initial Opening Balance Available
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">
                This account currently has a zero balance and no opening float recorded. Operators can record a one-time starting balance.
              </p>
            </div>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => setOpeningBalanceDialogOpen(true)}
                className="w-full shrink-0 sm:w-auto"
              >
                <Coins className="mr-1.5 size-4" />
                Set opening balance
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Current ledger balance</CardDescription>
              <CardTitle className="text-2xl">
                {formatMoney(account.ledger_balance, account.currency_code)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Total money in</CardDescription>
              <CardTitle className="text-2xl text-emerald-600">
                {formatMoney(inflow, account.currency_code)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Total money out</CardDescription>
              <CardTitle className="text-2xl text-rose-600">
                {formatMoney(outflow, account.currency_code)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Balance provenance</CardTitle>
            <CardDescription>
              The displayed balance is the sum of {entryCount} immutable account entr
              {entryCount === 1 ? 'y' : 'ies'}
              {account.last_movement_at
                ? `, last changed ${formatFinanceDate(account.last_movement_at, true)}`
                : ''}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {account.latestReconciliation ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>
                  Latest reconciliation was recorded on{' '}
                  {formatFinanceDate(account.latestReconciliation.observedAt, true)} with status{' '}
                  <strong className="uppercase">{account.latestReconciliation.status}</strong>
                  {Number(account.latestReconciliation.differenceAmount) !== 0
                    ? ` (difference: ${formatMoney(account.latestReconciliation.differenceAmount, account.currency_code)})`
                    : ' (perfect match)'}
                  .
                </span>
              </div>
            ) : null}
            <Link
              className="text-sm font-medium text-primary hover:underline"
              href="/finance?tab=reconciliation"
            >
              Compare this balance with an external statement
            </Link>
          </CardContent>
        </Card>
        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-semibold">Account activity</h2>
            <p className="text-sm text-muted-foreground">
              Payments, refunds, expenses, transfers, and adjustments affecting only this account.
            </p>
          </div>
          <ActivitySection entries={entries} />
        </section>
      </div>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void handleStatusChange(e)}>
            <DialogHeader>
              <DialogTitle>
                {isAccountActive ? 'Deactivate account' : 'Activate account'}
              </DialogTitle>
              <DialogDescription>
                {isAccountActive
                  ? 'Deactivating this account will prevent it from being used for new transactions and expenses.'
                  : 'Reactivating this account makes it available again for operations, transfers, and payments.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {statusError ? (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {statusError}
                </div>
              ) : null}
              <div className="grid gap-2">
                <label htmlFor="status-reason" className="text-sm font-medium">
                  Reason for status change
                </label>
                <Textarea
                  id="status-reason"
                  required
                  minLength={4}
                  maxLength={1000}
                  placeholder="Explain why this account is being deactivated or reactivated..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="min-h-[90px]"
                />
                <span className="text-xs text-muted-foreground">
                  Minimum 4 characters. This action is recorded in the immutable audit log.
                </span>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatusDialogOpen(false)}
                disabled={statusBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={isAccountActive ? 'destructive' : 'default'}
                disabled={statusBusy || statusReason.trim().length < 4}
              >
                {statusBusy
                  ? 'Saving...'
                  : isAccountActive
                    ? 'Confirm deactivation'
                    : 'Confirm activation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SetOpeningBalanceDialog
        open={openingBalanceDialogOpen}
        onOpenChange={setOpeningBalanceDialogOpen}
        account={account}
        onSuccess={load}
      />
    </main>
  );
}
