'use client';

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  PencilLine,
  ReceiptText,
  RotateCcw,
  UserPlus,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type {
  CapitalContributorDto,
  CapitalEventDto,
  CapitalOverviewDto,
  FinanceExpenseDto,
  FinancialAccountDto,
  PaginatedResultDto,
} from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '@/components/operational-worklist';
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
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';

type CapitalDialog =
  | { kind: 'contributor' }
  | { kind: 'edit-contributor'; contributor: CapitalContributorDto }
  | { kind: 'movement'; movementType: 'CONTRIBUTION' | 'WITHDRAWAL' }
  | { kind: 'owner-expense' }
  | { kind: 'reversal'; event: CapitalEventDto };

const emptyPagination = { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 };

function localDateTime(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function signedMoney(amount: string, currency: string) {
  const value = Number(amount);
  return `${value > 0 ? '+' : ''}${formatMoney(value, currency)}`;
}

export function CapitalConsole() {
  const searchParams = useSearchParams();
  const requestedExpenseId = searchParams.get('expenseId') ?? '';
  const canView = useAdminCapability('finance.capital.view');
  const canManage = useAdminCapability('finance.capital.manage');
  const canViewAccounts = useAdminCapability('finance.accounts.view');
  const canViewExpenses = useAdminCapability('finance.expenses.view');
  const [overview, setOverview] = useState<CapitalOverviewDto>();
  const [contributors, setContributors] = useState<readonly CapitalContributorDto[]>([]);
  const [events, setEvents] = useState<readonly CapitalEventDto[]>([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [accounts, setAccounts] = useState<readonly FinancialAccountDto[]>([]);
  const [expenses, setExpenses] = useState<readonly FinanceExpenseDto[]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<CapitalDialog>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'danger'>('success');

  const load = useCallback(async () => {
    if (!canView) {
      setState('ready');
      return;
    }
    setState('loading');
    try {
      const [summary, people, history, financialAccounts, outstandingExpenses] = await Promise.all([
        fetchApiData<CapitalOverviewDto>('/admin/finance/capital/overview'),
        fetchApiData<readonly CapitalContributorDto[]>('/admin/finance/capital/contributors'),
        fetchApiData<PaginatedResultDto<CapitalEventDto>>(
          `/admin/finance/capital/events?page=${page}&pageSize=25`,
        ),
        canViewAccounts
          ? fetchApiData<readonly FinancialAccountDto[]>('/admin/finance/accounts')
          : Promise.resolve([]),
        canViewExpenses
          ? fetchApiData<PaginatedResultDto<FinanceExpenseDto>>(
              '/admin/finance/expenses?paymentState=OUTSTANDING&status=RECORDED&page=1&pageSize=100',
            )
          : Promise.resolve({ items: [], pagination: emptyPagination }),
      ]);
      setOverview(summary);
      setContributors(people);
      setEvents(history.items);
      setPagination(history.pagination);
      setAccounts(financialAccounts);
      setExpenses(outstandingExpenses.items);
      setState('ready');
      if (
        requestedExpenseId &&
        canManage &&
        outstandingExpenses.items.some((item) => item.id === requestedExpenseId)
      ) {
        setDialog((current) => current ?? { kind: 'owner-expense' });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Owner capital could not be loaded.');
      setTone('danger');
      setState('error');
    }
  }, [canManage, canView, canViewAccounts, canViewExpenses, page, requestedExpenseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(path: string, body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(path, {
        method: 'POST',
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
      });
      setDialog(undefined);
      setMessage(successMessage);
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The capital operation was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function updateContributor(
    contributor: CapitalContributorDto,
    body: Record<string, unknown>,
  ) {
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(`/admin/finance/capital/contributors/${contributor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...body, expectedVersion: contributor.version }),
      });
      setDialog(undefined);
      setMessage('Capital contributor updated. Existing financial history remains intact.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Contributor update was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          You do not have permission to view owner capital.
        </OperationalFeedback>
      </main>
    );
  }
  if (state === 'loading' && !overview) {
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </main>
    );
  }
  if (!overview) {
    return (
      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Owner capital is unavailable.'}
        </OperationalFeedback>
      </main>
    );
  }

  const activeContributors = contributors.filter((item) => item.status === 'ACTIVE');
  const activeAccounts = accounts.filter(
    (item) => item.status === 'ACTIVE' && item.currency_code === overview.currency,
  );
  const capitalExpenses = expenses.filter((item) => item.currency_code === overview.currency);
  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-6">
        <Breadcrumb
          mobileMode="back"
          items={[
            { label: 'Finance', href: '/finance' },
            { label: 'Owner capital', current: true },
          ]}
        />
        <OperationalPageHeader
          eyebrow="Finance"
          title="Owner capital"
          description="Track money contributors put into the business and costs they pay personally. Capital changes cash and funding position, never sales revenue."
          actions={
            canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setDialog({ kind: 'contributor' })}>
                  <UserPlus /> Add contributor
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: 'owner-expense' })}>
                  <ReceiptText /> Personal payment
                </Button>
                <Button
                  onClick={() => setDialog({ kind: 'movement', movementType: 'CONTRIBUTION' })}
                >
                  <Plus /> Record capital
                </Button>
              </div>
            ) : undefined
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}

        <Stats aria-label="Owner capital summary">
          <StatsCard>
            <StatsTitle>Capital contributed</StatsTitle>
            <StatsValue>{formatMoney(overview.totalContributed, overview.currency)}</StatsValue>
            <StatsDescription>Cash deposited into business Accounts</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Personally funded costs</StatsTitle>
            <StatsValue>{formatMoney(overview.ownerFundedExpenses, overview.currency)}</StatsValue>
            <StatsDescription>Business Expenses paid outside business Accounts</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Withdrawn</StatsTitle>
            <StatsValue>{formatMoney(overview.totalWithdrawn, overview.currency)}</StatsValue>
            <StatsDescription>Capital returned from business Accounts</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Net capital position</StatsTitle>
            <StatsValue>{formatMoney(overview.netCapital, overview.currency)}</StatsValue>
            <StatsDescription>
              Contributions and personal costs, less withdrawals and reversals
            </StatsDescription>
          </StatsCard>
        </Stats>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Contributors</CardTitle>
              <CardDescription>
                People are independent of Team access and do not imply ownership percentages.
              </CardDescription>
            </div>
            <span className="text-sm text-muted-foreground">{overview.contributorCount} total</span>
          </CardHeader>
          <CardContent>
            {contributors.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {contributors.map((person) => (
                  <div key={person.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <strong>{person.displayName}</strong>
                      <div className="flex items-center gap-1">
                        <StatusBadge status={person.status} />
                        {canManage ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Edit ${person.displayName}`}
                            onClick={() =>
                              setDialog({ kind: 'edit-contributor', contributor: person })
                            }
                          >
                            <PencilLine />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {person.contactNote ? (
                      <p className="mt-1 text-sm text-muted-foreground">{person.contactNote}</p>
                    ) : null}
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Net capital</dt>
                        <dd className="font-semibold">
                          {formatMoney(person.netCapital, overview.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Last activity</dt>
                        <dd>
                          {person.lastActivityAt
                            ? formatFinanceDate(person.lastActivityAt)
                            : 'None'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <OperationalEmptyState
                title="No capital contributors"
                description="Add the first person who contributes funds or personally pays a business cost."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capital ledger</CardTitle>
            <CardDescription>
              Append-only history connected to the authoritative Finance transaction, Account,
              Expense, and Purchase records.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {events.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Contributor</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Connection</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Capital impact</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatFinanceDate(event.occurredAt, true)}
                        </TableCell>
                        <TableCell className="font-medium">{event.contributorName}</TableCell>
                        <TableCell>
                          <StatusBadge status={humanizeFinanceCode(event.eventType)} />
                          {event.isReversed ? (
                            <small className="ml-2 text-muted-foreground">Reversed</small>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {event.accountName ??
                            event.purchaseNumber ??
                            event.expenseNumber ??
                            'Capital record'}
                        </TableCell>
                        <TableCell>
                          <span className="block">{event.transactionNumber}</span>
                          {event.reference ? (
                            <small className="text-muted-foreground">{event.reference}</small>
                          ) : null}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${Number(event.amountDelta) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                        >
                          {signedMoney(event.amountDelta, event.currencyCode)}
                        </TableCell>
                        <TableCell>
                          {canManage && !event.isReversed && event.eventType !== 'REVERSAL' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDialog({ kind: 'reversal', event })}
                            >
                              <RotateCcw /> Reverse
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <OperationalEmptyState
                title="No capital activity"
                description="Contributions, withdrawals, and personally funded Expenses will appear here."
              />
            )}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {pagination.totalItems} entries · Page {pagination.page} of{' '}
                {Math.max(1, pagination.totalPages)}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || state === 'loading'}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pagination.totalPages || state === 'loading'}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={dialog?.kind === 'contributor'}
          onOpenChange={(open) => !open && setDialog(undefined)}
        >
          <DialogContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void submit(
                  '/admin/finance/capital/contributors',
                  {
                    displayName: data.get('displayName'),
                    contactNote: data.get('contactNote') || undefined,
                  },
                  'Capital contributor added.',
                );
              }}
            >
              <DialogHeader>
                <DialogTitle>Add capital contributor</DialogTitle>
                <DialogDescription>
                  This person does not receive Team access or an ownership percentage.
                </DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-sm font-medium">
                Name
                <Input name="displayName" maxLength={200} required autoFocus />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Contact or identity note
                <Textarea name="contactNote" maxLength={1000} />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(undefined)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  Add contributor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialog?.kind === 'edit-contributor'}
          onOpenChange={(open) => !open && setDialog(undefined)}
        >
          <DialogContent>
            {dialog?.kind === 'edit-contributor' ? (
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void updateContributor(dialog.contributor, {
                    displayName: data.get('displayName'),
                    contactNote: data.get('contactNote') || null,
                    status: data.get('status'),
                  });
                }}
              >
                <DialogHeader>
                  <DialogTitle>Edit capital contributor</DialogTitle>
                  <DialogDescription>
                    Identity changes are audited. Deactivation prevents new capital activity but
                    preserves the ledger.
                  </DialogDescription>
                </DialogHeader>
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input
                    name="displayName"
                    defaultValue={dialog.contributor.displayName}
                    maxLength={200}
                    required
                    autoFocus
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Contact or identity note
                  <Textarea
                    name="contactNote"
                    defaultValue={dialog.contributor.contactNote ?? ''}
                    maxLength={1000}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Status
                  <NativeSelect name="status" defaultValue={dialog.contributor.status}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </NativeSelect>
                </label>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialog(undefined)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    Save contributor
                  </Button>
                </DialogFooter>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialog?.kind === 'movement'}
          onOpenChange={(open) => !open && setDialog(undefined)}
        >
          <DialogContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (dialog?.kind !== 'movement') return;
                const data = new FormData(event.currentTarget);
                void submit(
                  '/admin/finance/capital/account-movements',
                  {
                    type: dialog.movementType,
                    contributorId: data.get('contributorId'),
                    accountId: data.get('accountId'),
                    amount: data.get('amount'),
                    occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
                    reference: data.get('reference') || undefined,
                    note: data.get('note') || undefined,
                  },
                  dialog.movementType === 'CONTRIBUTION'
                    ? 'Capital contribution recorded. The Account balance now includes the funds.'
                    : 'Capital withdrawal recorded. The Account balance has been reduced.',
                );
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {dialog?.kind === 'movement' && dialog.movementType === 'WITHDRAWAL'
                    ? 'Record capital withdrawal'
                    : 'Record capital contribution'}
                </DialogTitle>
                <DialogDescription>
                  {dialog?.kind === 'movement' && dialog.movementType === 'WITHDRAWAL'
                    ? 'This returns capital from a real business Account and is not an Expense.'
                    : 'This records real money entering a business Account and does not count as Revenue.'}
                </DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-sm font-medium">
                Contributor
                <NativeSelect name="contributorId" required defaultValue="">
                  <option value="" disabled>
                    Choose contributor
                  </option>
                  {activeContributors.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Business Account
                <NativeSelect name="accountId" required defaultValue="">
                  <option value="" disabled>
                    Choose Account
                  </option>
                  {activeAccounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatMoney(item.ledger_balance, item.currency_code)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Amount
                  <Input name="amount" inputMode="decimal" required />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Date and time
                  <Input
                    name="occurredAt"
                    type="datetime-local"
                    defaultValue={localDateTime()}
                    required
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Reference
                <Input name="reference" maxLength={200} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Note
                <Textarea name="note" maxLength={2000} />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(undefined)}>
                  Cancel
                </Button>
                {dialog?.kind === 'movement' && dialog.movementType === 'CONTRIBUTION' ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialog({ kind: 'movement', movementType: 'WITHDRAWAL' })}
                  >
                    <ArrowUpFromLine /> Switch to withdrawal
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialog({ kind: 'movement', movementType: 'CONTRIBUTION' })}
                  >
                    <ArrowDownToLine /> Switch to contribution
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={busy || !activeContributors.length || !activeAccounts.length}
                >
                  Record
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialog?.kind === 'owner-expense'}
          onOpenChange={(open) => !open && setDialog(undefined)}
        >
          <DialogContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const expenseId = String(data.get('expenseId'));
                void submit(
                  `/admin/finance/expenses/${expenseId}/owner-funded-payments`,
                  {
                    contributorId: data.get('contributorId'),
                    amount: data.get('amount'),
                    occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
                    reference: data.get('reference') || undefined,
                    note: data.get('note') || undefined,
                  },
                  'Personal payment recorded. The Expense is paid without changing a business Account balance.',
                );
              }}
            >
              <DialogHeader>
                <DialogTitle>Record personally funded Expense</DialogTitle>
                <DialogDescription>
                  The contributor paid a real business cost with personal money. This increases
                  their capital position without inventing cash in a business Account.
                </DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-sm font-medium">
                Contributor
                <NativeSelect name="contributorId" required defaultValue="">
                  <option value="" disabled>
                    Choose contributor
                  </option>
                  {activeContributors.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Outstanding Expense or supplier invoice
                <NativeSelect name="expenseId" required defaultValue={requestedExpenseId}>
                  <option value="" disabled>
                    Choose Expense
                  </option>
                  {capitalExpenses.map((expense) => (
                    <option key={expense.id} value={expense.id}>
                      {expense.expense_number}
                      {expense.source_reference ? ` · ${expense.source_reference}` : ''} · due{' '}
                      {formatMoney(expense.outstanding, expense.currency_code)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Amount
                  <Input name="amount" inputMode="decimal" required />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Paid at
                  <Input
                    name="occurredAt"
                    type="datetime-local"
                    defaultValue={localDateTime()}
                    required
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Receipt or payment reference
                <Input name="reference" maxLength={200} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Note
                <Textarea name="note" maxLength={2000} />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(undefined)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !activeContributors.length || !capitalExpenses.length}
                >
                  Record personal payment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialog?.kind === 'reversal'}
          onOpenChange={(open) => !open && setDialog(undefined)}
        >
          <DialogContent>
            <form
              className="grid gap-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                if (dialog?.kind !== 'reversal') return;
                const reason = new FormData(event.currentTarget).get('reason');
                void submit(
                  `/admin/finance/capital/events/${dialog.event.id}/reversal`,
                  { reason },
                  'Capital event reversed with a compensating Finance record.',
                );
              }}
            >
              <DialogHeader>
                <DialogTitle>Reverse capital event</DialogTitle>
                <DialogDescription>
                  This preserves the original entry and adds an equal opposite event. Account cash
                  or Expense payment state will be corrected atomically.
                </DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-sm font-medium">
                Reason
                <Textarea name="reason" minLength={4} maxLength={1000} required autoFocus />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(undefined)}>
                  Keep entry
                </Button>
                <Button type="submit" variant="destructive" disabled={busy}>
                  <RotateCcw /> Reverse entry
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
