'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ExternalLink,
  HandCoins,
  Landmark,
  PencilLine,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  User,
  UserPlus,
} from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { SearchInput } from '@/components/ui/search-input';
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
import { fetchApiData } from '@/lib/api';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';

import { CapitalContributorDetailSheet } from './capital/capital-contributor-detail-sheet';
import { CapitalTransactionDetailSheet } from './capital/capital-transaction-detail-sheet';
import { CapitalContributorDialog } from './capital/capital-contributor-dialog';
import { CapitalMovementDialog } from './capital/capital-movement-dialog';
import { CapitalOwnerExpenseDialog } from './capital/capital-owner-expense-dialog';
import { CapitalReversalDialog } from './capital/capital-reversal-dialog';
import {
  type CapitalDialog,
  type CapitalSheet,
  signedMoney,
} from './capital/types';

const emptyPagination = { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 };

export function CapitalConsole() {
  const searchParams = useSearchParams();
  const requestedExpenseId = searchParams.get('expenseId') ?? '';
  const requestedContributorId = searchParams.get('contributorId') ?? '';
  const requestedEventId = searchParams.get('eventId') ?? '';
  const requestedAction = searchParams.get('action') ?? '';

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

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [contributorFilter, setContributorFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<'ALL' | CapitalEventDto['eventType']>('ALL');
  const [page, setPage] = useState(1);

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<CapitalDialog>();
  const [sheet, setSheet] = useState<CapitalSheet>();
  const [singleEventDetail, setSingleEventDetail] = useState<CapitalEventDto>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'danger'>('success');

  const defaultCurrency = overview?.currency || 'BDT';

  // Load overview, contributors, accounts, and expenses
  const loadBaseData = useCallback(async () => {
    if (!canView) {
      setState('ready');
      return;
    }
    try {
      const [summary, people, financialAccounts, outstandingExpenses] = await Promise.all([
        fetchApiData<CapitalOverviewDto>('/admin/finance/capital/overview'),
        fetchApiData<readonly CapitalContributorDto[]>('/admin/finance/capital/contributors'),
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
      setAccounts(financialAccounts);
      setExpenses(outstandingExpenses.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Owner capital data could not be loaded.');
      setTone('danger');
      setState('error');
    }
  }, [canView, canViewAccounts, canViewExpenses]);

  // Load ledger events with filters
  const loadEvents = useCallback(async () => {
    if (!canView) return;
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '25');
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (contributorFilter) params.set('contributorId', contributorFilter);
      if (eventTypeFilter !== 'ALL') params.set('eventType', eventTypeFilter);

      const history = await fetchApiData<PaginatedResultDto<CapitalEventDto>>(
        `/admin/finance/capital/events?${params.toString()}`,
      );
      setEvents(history.items);
      setPagination(history.pagination);
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Capital ledger could not be loaded.');
      setTone('danger');
      setState('error');
    }
  }, [canView, contributorFilter, eventTypeFilter, page, searchQuery]);

  // Initial load
  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  // Fetch events whenever filters change
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // Handle URL parameters for cross-module workflows
  useEffect(() => {
    if (requestedExpenseId && canManage) {
      setDialog({ kind: 'owner-expense', preselectedExpenseId: requestedExpenseId });
    } else if (requestedContributorId) {
      setSheet({ kind: 'contributor-detail', contributorId: requestedContributorId });
    } else if (requestedEventId) {
      setSheet({ kind: 'transaction-detail', eventId: requestedEventId });
    } else if (requestedAction === 'contribution' && canManage) {
      setDialog({ kind: 'movement', movementType: 'CONTRIBUTION' });
    } else if (requestedAction === 'withdrawal' && canManage) {
      setDialog({ kind: 'movement', movementType: 'WITHDRAWAL' });
    }
  }, [canManage, requestedAction, requestedContributorId, requestedEventId, requestedExpenseId]);

  // Fetch individual event for transaction sheet if opened
  useEffect(() => {
    if (sheet?.kind === 'transaction-detail') {
      const existing = events.find((e) => e.id === sheet.eventId);
      if (existing) {
        setSingleEventDetail(existing);
      } else {
        void fetchApiData<CapitalEventDto>(`/admin/finance/capital/events/${sheet.eventId}`)
          .then((data) => setSingleEventDetail(data))
          .catch(() => {});
      }
    } else {
      setSingleEventDetail(undefined);
    }
  }, [events, sheet]);

  // Reset filters
  function handleResetFilters() {
    setSearchQuery('');
    setContributorFilter('');
    setEventTypeFilter('ALL');
    setPage(1);
  }

  const hasActiveFilters = Boolean(searchQuery.trim()) || Boolean(contributorFilter) || eventTypeFilter !== 'ALL';

  // Command execution helper
  async function submitCommand(path: string, method: string, body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setMessage('');
    try {
      await fetchApiData(path, {
        method,
        body: JSON.stringify(body),
      });
      setDialog(undefined);
      setMessage(successMessage);
      setTone('success');
      await Promise.all([loadBaseData(), loadEvents()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The capital operation was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  // Selected contributor for detail sheet
  const activeSheetContributor = useMemo(() => {
    if (sheet?.kind !== 'contributor-detail') return undefined;
    return contributors.find((c) => c.id === sheet.contributorId);
  }, [contributors, sheet]);

  if (!canView) {
    return (
      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          You do not have permission to view owner capital. Contact your organization administrator.
        </OperationalFeedback>
      </main>
    );
  }

  if (state === 'loading' && !overview) {
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </main>
    );
  }

  if (!overview) {
    return (
      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Owner capital is currently unavailable.'}
        </OperationalFeedback>
      </main>
    );
  }

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
          title="Owner capital & funding"
          description="Track money contributed into business accounts and commercial costs paid directly with personal funds. Owner capital updates cash and funding positions without distorting sales revenue."
          actions={
            canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setDialog({ kind: 'contributor' })}>
                  <UserPlus className="size-4 mr-1.5" />
                  <span>Add contributor</span>
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: 'owner-expense' })}>
                  <HandCoins className="size-4 mr-1.5 text-emerald-600" />
                  <span>Personal payment</span>
                </Button>
                <Button
                  onClick={() => setDialog({ kind: 'movement', movementType: 'CONTRIBUTION' })}
                >
                  <Plus className="size-4 mr-1.5" />
                  <span>Record capital</span>
                </Button>
              </div>
            ) : undefined
          }
        />

        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}

        {/* Financial Position Overview Stats */}
        <Stats aria-label="Owner capital summary">
          <StatsCard>
            <StatsTitle>Capital contributed</StatsTitle>
            <StatsValue>{formatMoney(overview.totalContributed, overview.currency)}</StatsValue>
            <StatsDescription>Cash deposited into business bank & cash accounts</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Personally funded costs</StatsTitle>
            <StatsValue>{formatMoney(overview.ownerFundedExpenses, overview.currency)}</StatsValue>
            <StatsDescription>Business expenses & supplier bills paid outside accounts</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Withdrawn</StatsTitle>
            <StatsValue>{formatMoney(overview.totalWithdrawn, overview.currency)}</StatsValue>
            <StatsDescription>Permanent capital returned from business accounts</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Net capital position</StatsTitle>
            <StatsValue className="text-primary font-bold">
              {formatMoney(overview.netCapital, overview.currency)}
            </StatsValue>
            <StatsDescription>
              Contributions & personal costs less withdrawals and reversals
            </StatsDescription>
          </StatsCard>
        </Stats>

        {/* Contributors Section */}
        <Card className="border-border/80 shadow-2xs">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold">Capital contributors</CardTitle>
              <CardDescription className="text-xs">
                Individuals providing permanent capital or funding costs personally. Independent of team membership or cap-table shares.
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground font-medium shrink-0">
              {overview.contributorCount} registered {overview.contributorCount === 1 ? 'person' : 'people'}
            </span>
          </CardHeader>
          <CardContent>
            {contributors.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {contributors.map((person) => (
                  <div
                    key={person.id}
                    className="group rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {person.displayName}
                          </strong>
                          {person.linkedUserId ? (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <ShieldCheck className="size-3 text-primary" />
                              <span>{person.linkedUserName || 'Team Account'}</span>
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <StatusBadge status={person.status} />
                          {canManage ? (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Edit ${person.displayName}`}
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setDialog({ kind: 'edit-contributor', contributor: person })
                              }
                            >
                              <PencilLine className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {person.contactNote ? (
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                          {person.contactNote}
                        </p>
                      ) : null}

                      {/* 4-Metric Mini Summary Grid */}
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-border/40 pt-2.5">
                        <div>
                          <dt className="text-[10px] text-muted-foreground">Contributed cash</dt>
                          <dd className="font-medium tabular-nums text-foreground">
                            {formatMoney(person.grossContributed, defaultCurrency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-muted-foreground">Personally funded</dt>
                          <dd className="font-medium tabular-nums text-foreground">
                            {formatMoney(person.ownerFundedExpenses, defaultCurrency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-muted-foreground">Withdrawn</dt>
                          <dd className="font-medium tabular-nums text-foreground">
                            {formatMoney(person.withdrawn, defaultCurrency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-medium text-primary">Net capital</dt>
                          <dd className="font-bold tabular-nums text-primary">
                            {formatMoney(person.netCapital, defaultCurrency)}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {person.lastActivityAt
                          ? `Active ${formatFinanceDate(person.lastActivityAt, false)}`
                          : 'No recorded activity'}
                      </span>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-xs text-primary hover:underline gap-1 p-0 h-auto font-medium"
                        onClick={() => setSheet({ kind: 'contributor-detail', contributorId: person.id })}
                      >
                        <span>View details & ledger</span>
                        <ExternalLink className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <OperationalEmptyState
                title="No capital contributors registered"
                description="Add the first owner or investor who contributes funds or personally covers business expenses."
                action={
                  canManage ? (
                    <Button onClick={() => setDialog({ kind: 'contributor' })}>
                      <UserPlus className="size-4 mr-1.5" />
                      <span>Add contributor</span>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </CardContent>
        </Card>

        {/* Capital Ledger Section */}
        <Card className="border-border/80 shadow-2xs">
          <CardHeader className="gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Capital ledger</CardTitle>
                <CardDescription className="text-xs">
                  Authoritative, append-only history tracing contributions, personal payments, withdrawals, and corrections.
                </CardDescription>
              </div>
              <span className="text-xs text-muted-foreground">
                {pagination.totalItems} total transactions
              </span>
            </div>

            {/* Filter and Search Toolbar */}
            <div className="mt-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-t border-border/40 pt-3">
              <div className="flex-1 max-w-sm">
                <SearchInput
                  placeholder="Search transaction #, ref, note, person, account..."
                  value={searchQuery}
                  onChange={(val) => {
                    setSearchQuery(val);
                    setPage(1);
                  }}
                  onClear={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Contributor Filter */}
                <NativeSelect
                  value={contributorFilter}
                  onChange={(e) => {
                    setContributorFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 text-xs w-[160px]"
                  aria-label="Filter by contributor"
                >
                  <option value="">All contributors</option>
                  {contributors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </NativeSelect>

                {/* Event Type Filter */}
                <NativeSelect
                  value={eventTypeFilter}
                  onChange={(e) => {
                    setEventTypeFilter(e.target.value as typeof eventTypeFilter);
                    setPage(1);
                  }}
                  className="h-8 text-xs w-[170px]"
                  aria-label="Filter by activity type"
                >
                  <option value="ALL">All activity types</option>
                  <option value="CONTRIBUTION">Capital contributions</option>
                  <option value="OWNER_FUNDED_EXPENSE">Personally funded costs</option>
                  <option value="WITHDRAWAL">Capital withdrawals</option>
                  <option value="REVERSAL">Reversals & corrections</option>
                </NativeSelect>

                {hasActiveFilters ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetFilters}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="size-3 mr-1" />
                    Reset
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4">
            {events.length ? (
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[14%]">Date</TableHead>
                        <TableHead className="w-[18%]">Contributor</TableHead>
                        <TableHead className="w-[16%]">Activity</TableHead>
                        <TableHead className="w-[18%]">Connection</TableHead>
                        <TableHead className="w-[16%]">Reference & Trx #</TableHead>
                        <TableHead className="w-[12%] text-right">Capital impact</TableHead>
                        <TableHead className="w-[6%] text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((event) => {
                        const isNeg = Number(event.amountDelta) < 0;
                        return (
                          <TableRow
                            key={event.id}
                            className="cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => setSheet({ kind: 'transaction-detail', eventId: event.id })}
                          >
                            {/* Date */}
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatFinanceDate(event.occurredAt, true)}
                            </TableCell>

                            {/* Contributor */}
                            <TableCell>
                              <button
                                type="button"
                                className="font-semibold text-xs text-foreground hover:text-primary hover:underline flex items-center gap-1.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSheet({ kind: 'contributor-detail', contributorId: event.contributorId });
                                }}
                              >
                                <User className="size-3.5 text-muted-foreground" />
                                <span>{event.contributorName}</span>
                              </button>
                            </TableCell>

                            {/* Activity Badge */}
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <StatusBadge status={humanizeFinanceCode(event.eventType)} />
                                {event.isReversed ? (
                                  <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                    Reversed
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>

                            {/* Connection */}
                            <TableCell>
                              {event.accountId && event.accountName ? (
                                <Link
                                  href={`/finance/accounts/${event.accountId}`}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Landmark className="size-3.5 text-emerald-600 shrink-0" />
                                  <span className="truncate max-w-[140px]">{event.accountName}</span>
                                </Link>
                              ) : event.expenseId && event.expenseNumber ? (
                                <Link
                                  href={`/finance/expenses/${event.expenseId}`}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ReceiptText className="size-3.5 text-primary shrink-0" />
                                  <span>{event.expenseNumber}</span>
                                </Link>
                              ) : event.purchaseId && event.purchaseNumber ? (
                                <Link
                                  href={`/purchases/${event.purchaseId}`}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ShoppingBag className="size-3.5 text-blue-600 shrink-0" />
                                  <span>{event.purchaseNumber}</span>
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">Direct record</span>
                              )}
                            </TableCell>

                            {/* Reference */}
                            <TableCell>
                              <span className="block font-mono text-xs text-foreground">
                                {event.transactionNumber}
                              </span>
                              {event.reference ? (
                                <span className="block text-[11px] text-muted-foreground truncate max-w-[150px]">
                                  {event.reference}
                                </span>
                              ) : null}
                            </TableCell>

                            {/* Capital Impact */}
                            <TableCell
                              className={`text-right text-xs font-semibold tabular-nums ${
                                isNeg ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {signedMoney(event.amountDelta, event.currencyCode || defaultCurrency, formatMoney)}
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="text-right">
                              {canManage && !event.isReversed && event.eventType !== 'REVERSAL' ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDialog({ kind: 'reversal', event });
                                  }}
                                >
                                  <RotateCcw className="size-3" />
                                  <span>Reverse</span>
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <OperationalEmptyState
                title={hasActiveFilters ? 'No matching capital transactions' : 'No capital activity recorded yet'}
                description={
                  hasActiveFilters
                    ? 'No transactions matched the search query or selected filters. Try clearing or relaxing filters.'
                    : 'Contributions, personal expense funding, and withdrawals will appear here in chronological order.'
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={handleResetFilters}>
                      Clear filters
                    </Button>
                  ) : canManage ? (
                    <Button onClick={() => setDialog({ kind: 'movement', movementType: 'CONTRIBUTION' })}>
                      <Plus className="size-4 mr-1.5" />
                      <span>Record first contribution</span>
                    </Button>
                  ) : undefined
                }
              />
            )}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                <span>
                  Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                  {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of{' '}
                  {pagination.totalItems} entries
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || state === 'loading'}
                    onClick={() => setPage((val) => val - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pagination.totalPages || state === 'loading'}
                    onClick={() => setPage((val) => val + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Contributor Detail Sheet */}
        <CapitalContributorDetailSheet
          contributor={activeSheetContributor}
          defaultCurrency={defaultCurrency}
          open={sheet?.kind === 'contributor-detail'}
          canManage={canManage}
          onClose={() => setSheet(undefined)}
          onEditContributor={(c) => {
            setSheet(undefined);
            setDialog({ kind: 'edit-contributor', contributor: c });
          }}
          onRecordContribution={(cId) => {
            setSheet(undefined);
            setDialog({ kind: 'movement', movementType: 'CONTRIBUTION', preselectedContributorId: cId });
          }}
          onRecordPersonalPayment={(cId) => {
            setSheet(undefined);
            setDialog({ kind: 'owner-expense', preselectedContributorId: cId });
          }}
          onRecordWithdrawal={(cId) => {
            setSheet(undefined);
            setDialog({ kind: 'movement', movementType: 'WITHDRAWAL', preselectedContributorId: cId });
          }}
          onOpenTransaction={(eId) => {
            setSheet({ kind: 'transaction-detail', eventId: eId });
          }}
          onReverse={(ev) => {
            setSheet(undefined);
            setDialog({ kind: 'reversal', event: ev });
          }}
        />

        {/* Transaction Detail Sheet */}
        <CapitalTransactionDetailSheet
          event={singleEventDetail}
          defaultCurrency={defaultCurrency}
          open={sheet?.kind === 'transaction-detail'}
          canManage={canManage}
          onClose={() => setSheet(undefined)}
          onOpenContributor={(cId) => {
            setSheet({ kind: 'contributor-detail', contributorId: cId });
          }}
          onOpenTransaction={(eId) => {
            setSheet({ kind: 'transaction-detail', eventId: eId });
          }}
          onReverse={(ev) => {
            setSheet(undefined);
            setDialog({ kind: 'reversal', event: ev });
          }}
        />

        {/* Add Contributor Dialog */}
        <CapitalContributorDialog
          mode="create"
          open={dialog?.kind === 'contributor'}
          busy={busy}
          onClose={() => setDialog(undefined)}
          onSubmit={async (data) => {
            await submitCommand(
              '/admin/finance/capital/contributors',
              'POST',
              {
                displayName: data.displayName,
                contactNote: data.contactNote,
                linkedUserId: data.linkedUserId || undefined,
                idempotencyKey: crypto.randomUUID(),
              },
              `Capital contributor "${data.displayName}" added successfully.`,
            );
          }}
        />

        {/* Edit Contributor Dialog */}
        <CapitalContributorDialog
          mode="edit"
          contributor={dialog?.kind === 'edit-contributor' ? dialog.contributor : undefined}
          open={dialog?.kind === 'edit-contributor'}
          busy={busy}
          onClose={() => setDialog(undefined)}
          onSubmit={async (data) => {
            if (dialog?.kind !== 'edit-contributor') return;
            await submitCommand(
              `/admin/finance/capital/contributors/${dialog.contributor.id}`,
              'PATCH',
              {
                displayName: data.displayName,
                contactNote: data.contactNote,
                status: data.status,
                linkedUserId: data.linkedUserId,
                expectedVersion: dialog.contributor.version,
              },
              `Contributor "${data.displayName}" updated. Existing ledger history remains intact.`,
            );
          }}
        />

        {/* Record Capital Movement (Contribution or Withdrawal) Dialog */}
        <CapitalMovementDialog
          initialType={dialog?.kind === 'movement' ? dialog.movementType : 'CONTRIBUTION'}
          preselectedContributorId={dialog?.kind === 'movement' ? dialog.preselectedContributorId : undefined}
          contributors={contributors}
          accounts={accounts}
          defaultCurrency={defaultCurrency}
          open={dialog?.kind === 'movement'}
          busy={busy}
          onClose={() => setDialog(undefined)}
          onSubmit={async (data) => {
            await submitCommand(
              '/admin/finance/capital/account-movements',
              'POST',
              {
                ...data,
                idempotencyKey: crypto.randomUUID(),
              },
              data.type === 'CONTRIBUTION'
                ? 'Capital contribution recorded. Destination account balance and contributor capital position updated.'
                : 'Capital withdrawal recorded. Source account balance and contributor capital position updated.',
            );
          }}
        />

        {/* Record Personal Payment (Owner-Funded Expense) Dialog */}
        <CapitalOwnerExpenseDialog
          preselectedExpenseId={dialog?.kind === 'owner-expense' ? dialog.preselectedExpenseId : undefined}
          preselectedContributorId={dialog?.kind === 'owner-expense' ? dialog.preselectedContributorId : undefined}
          contributors={contributors}
          expenses={expenses}
          defaultCurrency={defaultCurrency}
          open={dialog?.kind === 'owner-expense'}
          busy={busy}
          onClose={() => setDialog(undefined)}
          onSubmit={async (data) => {
            await submitCommand(
              `/admin/finance/expenses/${data.expenseId}/owner-funded-payments`,
              'POST',
              {
                contributorId: data.contributorId,
                amount: data.amount,
                occurredAt: data.occurredAt,
                reference: data.reference,
                note: data.note,
                idempotencyKey: crypto.randomUUID(),
              },
              'Personally funded expense payment recorded. The obligation is settled without changing business account cash balances.',
            );
          }}
        />

        {/* Reversal Confirmation Dialog */}
        <CapitalReversalDialog
          event={dialog?.kind === 'reversal' ? dialog.event : undefined}
          defaultCurrency={defaultCurrency}
          open={dialog?.kind === 'reversal'}
          busy={busy}
          onClose={() => setDialog(undefined)}
          onSubmit={async (reason) => {
            if (dialog?.kind !== 'reversal') return;
            await submitCommand(
              `/admin/finance/capital/events/${dialog.event.id}/reversal`,
              'POST',
              {
                reason,
                idempotencyKey: crypto.randomUUID(),
              },
              `Transaction ${dialog.event.transactionNumber} reversed with compensating accounting record.`,
            );
          }}
        />
      </div>
    </main>
  );
}
