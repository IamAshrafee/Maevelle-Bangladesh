'use client';

import {
  Activity,
  ArrowLeftRight,
  Banknote,
  Landmark,
  Plus,
  RefreshCw,
  Scale,
  SlidersHorizontal,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  FinanceCodSettlementDto,
  FinanceExpenseDto,
  FinanceLedgerEntryDto,
  FinanceOverviewDto,
  FinanceReconciliationDto,
  FinanceTrendRangeDto,
  FinanceTrendsDto,
  FinancialAccountDto,
  OutstandingCodSettlementPaymentDto,
  PaginatedResultDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import {
  FinanceCommandDialog,
  type FinanceDialogState,
} from '@/components/finance/finance-dialogs';
import { CodSettlementDialog } from '@/components/finance/cod-settlement-dialog';
import { CodSettlementSection } from '@/components/finance/cod-settlement-section';
import { ExpenseControls } from '@/components/finance/expense-controls';
import {
  AccountsSection,
  ActivitySection,
  ExpensesSection,
  FinanceOverview,
  ReconciliationSection,
} from '@/components/finance/finance-sections';
import { OperationalFeedback, OperationalPageHeader } from '@/components/operational-worklist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchApiData } from '@/lib/api';
import {
  emptyFinanceWorkspace,
  type ExpenseCategoryDto,
  type FinanceSection,
  type FinanceWorkspaceData,
} from '@/lib/finance/types';

export type FinanceConsoleMode = 'overview' | 'expenses' | 'treasury' | 'cod-settlements';

const idempotentPaths = new Set([
  '/admin/finance/accounts',
  '/admin/finance/expenses',
  '/admin/finance/transfers',
  '/admin/finance/movements',
  '/admin/finance/cod-settlements',
]);

function resolveTreasurySection(tab?: string | null): FinanceSection {
  if (!tab) return 'accounts';
  if (tab === 'transfers') return 'transfers';
  if (['accounts', 'movements', 'transfers', 'reconciliation'].includes(tab)) {
    return tab as FinanceSection;
  }
  if (tab === 'activity') return 'movements';
  return 'accounts';
}

function sectionCopy(section: FinanceSection, mode: FinanceConsoleMode): { title: string; description: string } {
  if (mode === 'overview') {
    return {
      title: 'Finance overview',
      description:
        'Understand collected money, refunds, expenses, account balances, and actions that need attention.',
    };
  }
  if (mode === 'expenses') {
    return {
      title: 'Business expenses',
      description:
        'Record obligations, connect supply-related costs, and pay expenses from real accounts.',
    };
  }
  if (mode === 'cod-settlements') {
    return {
      title: 'Courier COD settlements',
      description:
        'Track collected cash held by couriers, record remittances and deductions, and receive the net amount into a financial account.',
    };
  }
  switch (section) {
    case 'accounts':
      return {
        title: 'Financial accounts',
        description: 'Where company money is held across banks, mobile wallets, and cash drawers.',
      };
    case 'movements':
    case 'transfers':
      return {
        title: 'Activity & transfers',
        description:
          'Chronological ledger of money in, money out, internal transfers, and controlled adjustments.',
      };
    case 'reconciliation':
      return {
        title: 'Balance checks',
        description:
          'Compare Maevelle balances with bank, wallet, cash, or courier statements without changing history.',
      };
    case 'cod-settlements':
      return {
        title: 'Courier COD settlements',
        description:
          'Track collected cash held by couriers, record remittances and deductions, and receive the net amount into a financial account.',
      };
    default:
      return {
        title: 'Accounts & activity',
        description: 'Manage company financial accounts, internal transfers, and cash ledger records.',
      };
  }
}

export function FinanceConsole({
  mode = 'treasury',
  section,
  initialSection,
}: {
  readonly mode?: FinanceConsoleMode | undefined;
  readonly section?: FinanceSection | undefined;
  readonly initialSection?: string | undefined;
}) {
  const searchParams = useSearchParams();
  const paramTab = searchParams.get('tab');

  const [activeSection, setActiveSection] = useState<FinanceSection>(() => {
    if (mode === 'overview') return 'overview';
    if (mode === 'expenses') return 'expenses';
    if (mode === 'cod-settlements') return 'cod-settlements';
    return resolveTreasurySection(paramTab || section || initialSection);
  });

  useEffect(() => {
    if (mode === 'treasury') {
      const currentTab = searchParams.get('tab');
      if (currentTab) {
        setActiveSection(resolveTreasurySection(currentTab));
      }
    }
  }, [mode, searchParams]);

  const handleTabChange = useCallback((newTab: FinanceSection) => {
    setActiveSection(newTab);
    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      if (newTab === 'accounts' || newTab === 'overview') {
        currentUrl.searchParams.delete('tab');
      } else {
        currentUrl.searchParams.set('tab', newTab);
      }
      window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
    }
  }, []);

  const canViewAccounts = useAdminCapability('finance.accounts.view');
  const canManageAccounts = useAdminCapability('finance.accounts.manage');
  const canViewExpenses = useAdminCapability('finance.expenses.view');
  const canCreateExpenses = useAdminCapability('finance.expenses.create');
  const canPayExpenses = useAdminCapability('finance.expenses.pay');
  const canManageCategories = useAdminCapability('finance.categories.manage');
  const canViewCash = useAdminCapability('finance.cash.view');
  const canAdjustCash = useAdminCapability('finance.cash.record_manual');
  const canTransfer = useAdminCapability('finance.transfers.create');
  const canViewReconciliation = useAdminCapability('finance.reconciliation.view');
  const canManageReconciliation = useAdminCapability('finance.reconciliation.manage');
  const canViewCodSettlements = useAdminCapability('finance.cod_settlements.view');
  const canManageCodSettlements = useAdminCapability('finance.cod_settlements.manage');

  const [data, setData] = useState<FinanceWorkspaceData>(emptyFinanceWorkspace);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dialog, setDialog] = useState<FinanceDialogState>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [query, setQuery] = useState('');
  const [codSettlementPage, setCodSettlementPage] = useState(1);
  const [codDialogOpen, setCodDialogOpen] = useState(false);
  const [trendRange, setTrendRange] = useState<FinanceTrendRangeDto>('LAST_30_DAYS');
  const [expenseQuery, setExpenseQuery] = useState('');
  const [appliedExpenseQuery, setAppliedExpenseQuery] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [expenseStatus, setExpenseStatus] = useState('ALL');
  const [expensePaymentState, setExpensePaymentState] = useState('ALL');
  const [expenseFrom, setExpenseFrom] = useState('');
  const [expenseTo, setExpenseTo] = useState('');
  const [expensePage, setExpensePage] = useState(1);

  const [activityFilter, setActivityFilter] = useState<
    'ALL' | 'TRANSFERS' | 'IN' | 'OUT' | 'ADJUSTMENTS'
  >(activeSection === 'transfers' ? 'TRANSFERS' : 'ALL');
  const [activityAccountName, setActivityAccountName] = useState<string>('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const isOverview = mode === 'overview';
      const isExpenses = mode === 'expenses';
      const isCodSettlements = mode === 'cod-settlements';
      const needsAccounts =
        isOverview ||
        isExpenses ||
        isCodSettlements ||
        [
          'accounts',
          'expenses',
          'movements',
          'transfers',
          'cod-settlements',
          'reconciliation',
        ].includes(activeSection);
      const needsExpenses = isOverview || isExpenses;
      const needsLedger =
        !isExpenses && !isCodSettlements && ['accounts', 'movements', 'transfers'].includes(activeSection);
      const needsCategories = isExpenses;
      const needsChecks = isOverview || (!isExpenses && !isCodSettlements && activeSection === 'reconciliation');
      const needsCodSettlements = isCodSettlements;
      const expenseParameters = new URLSearchParams({
        page: String(expensePage),
        pageSize: '25',
      });
      if (appliedExpenseQuery) expenseParameters.set('q', appliedExpenseQuery);
      if (expenseCategoryId) expenseParameters.set('categoryId', expenseCategoryId);
      if (expenseAccountId) expenseParameters.set('accountId', expenseAccountId);
      if (expenseStatus !== 'ALL') expenseParameters.set('status', expenseStatus);
      if (expensePaymentState !== 'ALL') expenseParameters.set('paymentState', expensePaymentState);
      if (expenseFrom) expenseParameters.set('from', expenseFrom);
      if (expenseTo) expenseParameters.set('to', expenseTo);
      const [
        accounts,
        expenseResult,
        ledgerResult,
        categories,
        reconciliations,
        financeOverview,
        financeTrends,
        outstandingCodPayments,
        codSettlements,
      ] = await Promise.all([
        canViewAccounts && needsAccounts
          ? fetchApiData<readonly FinancialAccountDto[]>('/admin/finance/accounts')
          : Promise.resolve([]),
        canViewExpenses && needsExpenses
          ? fetchApiData<PaginatedResultDto<FinanceExpenseDto>>(
              `/admin/finance/expenses?${expenseParameters.toString()}`,
            )
          : Promise.resolve({
              items: [],
              pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
            }),
        canViewCash && needsLedger
          ? fetchApiData<PaginatedResultDto<FinanceLedgerEntryDto>>(
              '/admin/finance/ledger?pageSize=100',
            )
          : Promise.resolve({
              items: [],
              pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
            }),
        canViewExpenses && needsCategories
          ? fetchApiData<readonly ExpenseCategoryDto[]>('/admin/finance/categories')
          : Promise.resolve([]),
        canViewReconciliation && needsChecks
          ? fetchApiData<readonly FinanceReconciliationDto[]>('/admin/finance/reconciliations')
          : Promise.resolve([]),
        canViewCash && isOverview
          ? fetchApiData<FinanceOverviewDto>('/admin/finance/overview')
          : Promise.resolve(null),
        canViewCash && isOverview
          ? fetchApiData<FinanceTrendsDto>(`/admin/finance/trends?range=${trendRange}`)
          : Promise.resolve(null),
        canViewCodSettlements && needsCodSettlements
          ? fetchApiData<readonly OutstandingCodSettlementPaymentDto[]>(
              '/admin/finance/cod-settlements/outstanding',
            )
          : Promise.resolve([]),
        canViewCodSettlements && needsCodSettlements
          ? fetchApiData<PaginatedResultDto<FinanceCodSettlementDto>>(
              `/admin/finance/cod-settlements?page=${codSettlementPage}&pageSize=25`,
            )
          : Promise.resolve({
              items: [],
              pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
            }),
      ]);
      setData((prev) => ({
        accounts: accounts.length > 0 || !prev.accounts.length ? accounts : prev.accounts,
        expenses:
          expenseResult.items.length > 0 || !prev.expenses.length
            ? expenseResult.items
            : prev.expenses,
        expensePagination: expenseResult.pagination,
        ledger:
          ledgerResult.items.length > 0 || !prev.ledger.length
            ? ledgerResult.items
            : prev.ledger,
        categories:
          categories.length > 0 || !prev.categories.length ? categories : prev.categories,
        reconciliations:
          reconciliations.length > 0 || !prev.reconciliations.length
            ? reconciliations
            : prev.reconciliations,
        outstandingCodPayments:
          outstandingCodPayments.length > 0 || !prev.outstandingCodPayments.length
            ? outstandingCodPayments
            : prev.outstandingCodPayments,
        codSettlements:
          codSettlements.items.length > 0 || !prev.codSettlements.items.length
            ? codSettlements
            : prev.codSettlements,
        overview: financeOverview ?? prev.overview,
        trends: financeTrends ?? prev.trends,
      }));
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Finance could not be loaded.');
      setMessageTone('danger');
      setState('error');
    }
  }, [
    activeSection,
    appliedExpenseQuery,
    canViewAccounts,
    canViewCash,
    canViewCodSettlements,
    canViewExpenses,
    canViewReconciliation,
    codSettlementPage,
    expenseAccountId,
    expenseCategoryId,
    expenseFrom,
    expensePage,
    expensePaymentState,
    expenseStatus,
    expenseTo,
    mode,
    trendRange,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function command(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const requiresKey = idempotentPaths.has(path) || path.endsWith('/pay');
      await fetchApiData(path, {
        method: 'POST',
        body: JSON.stringify({
          ...body,
          ...(requiresKey ? { idempotencyKey: crypto.randomUUID() } : {}),
        }),
      });
      setDialog(undefined);
      setCodDialogOpen(false);
      setMessage('Financial record saved. Balances and activity have been refreshed.');
      setMessageTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The finance operation was rejected.');
      setMessageTone('danger');
    } finally {
      setBusy(false);
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleLedger = useMemo(() => {
    return data.ledger
      .filter((entry) => {
        if (activityAccountName && entry.account_name !== activityAccountName) {
          return false;
        }
        if (activityFilter === 'TRANSFERS') {
          return entry.transaction_type === 'INTERNAL_TRANSFER';
        }
        if (activityFilter === 'IN') {
          return Number(entry.amount_delta) > 0;
        }
        if (activityFilter === 'OUT') {
          return Number(entry.amount_delta) < 0;
        }
        if (activityFilter === 'ADJUSTMENTS') {
          return entry.transaction_type === 'EXTERNAL_ADJUSTMENT';
        }
        return true;
      })
      .filter((entry) =>
        [entry.transaction_number, entry.description, entry.account_name, entry.transaction_type]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      );
  }, [activityAccountName, activityFilter, data.ledger, normalizedQuery]);

  const copy = sectionCopy(activeSection, mode);
  const actions =
    mode === 'overview' ? (
      <div className="flex flex-wrap gap-2">
        {canTransfer ? (
          <Button variant="outline" onClick={() => setDialog({ kind: 'transfer' })}>
            <ArrowLeftRight /> Transfer
          </Button>
        ) : null}
        {canCreateExpenses ? (
          <Button onClick={() => setDialog({ kind: 'expense' })}>
            <Plus /> Record expense
          </Button>
        ) : null}
      </div>
    ) : mode === 'expenses' ? (
      <div className="flex flex-wrap gap-2">
        {canManageCategories ? (
          <Button variant="outline" onClick={() => setDialog({ kind: 'category' })}>
            Manage categories
          </Button>
        ) : null}
        {canCreateExpenses ? (
          <Button onClick={() => setDialog({ kind: 'expense' })}>
            <Plus /> Record expense
          </Button>
        ) : null}
      </div>
    ) : mode === 'cod-settlements' ? (
      canManageCodSettlements ? (
        <Button
          onClick={() => setCodDialogOpen(true)}
          disabled={!data.outstandingCodPayments.some((payment) => payment.canSettle)}
        >
          <Banknote /> Record settlement
        </Button>
      ) : undefined
    ) : activeSection === 'accounts' ? (
      <div className="flex flex-wrap gap-2">
        {canTransfer ? (
          <Button variant="outline" onClick={() => setDialog({ kind: 'transfer' })}>
            <ArrowLeftRight /> Transfer
          </Button>
        ) : null}
        {canManageAccounts ? (
          <Button onClick={() => setDialog({ kind: 'account' })}>
            <Plus /> Add account
          </Button>
        ) : null}
      </div>
    ) : activeSection === 'movements' || activeSection === 'transfers' ? (
      <div className="flex flex-wrap gap-2">
        {canAdjustCash ? (
          <Button variant="outline" onClick={() => setDialog({ kind: 'cash-adjustment' })}>
            <SlidersHorizontal /> Adjustment
          </Button>
        ) : null}
        {canTransfer ? (
          <Button onClick={() => setDialog({ kind: 'transfer' })}>
            <ArrowLeftRight /> Transfer
          </Button>
        ) : null}
      </div>
    ) : activeSection === 'reconciliation' && canManageReconciliation ? (
      <Button onClick={() => setDialog({ kind: 'balance-check' })}>
        <Scale /> Compare balance
      </Button>
    ) : null;

  const treasuryTabs = [
    {
      key: 'accounts' as const,
      label: 'Accounts',
      icon: Landmark,
      badge: data.accounts.length || undefined,
    },
    {
      key: 'movements' as const,
      label: 'Activity & transfers',
      icon: Activity,
    },
    {
      key: 'reconciliation' as const,
      label: 'Balance checks',
      icon: Scale,
      badge:
        data.reconciliations.filter(
          (r) => r.status === 'OPEN' && Number(r.difference_amount) !== 0,
        ).length || undefined,
    },
  ];

  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-6">
        <OperationalPageHeader
          eyebrow="Payments & finance"
          title={copy.title}
          description={copy.description}
          actions={actions}
        />
        {message ? <OperationalFeedback tone={messageTone}>{message}</OperationalFeedback> : null}

        {mode === 'treasury' ? (
          <Tabs
            value={activeSection === 'transfers' ? 'movements' : activeSection}
            onValueChange={(val) => {
              if (val === 'movements') {
                setActivityFilter('ALL');
              }
              handleTabChange(val as FinanceSection);
            }}
            className="w-full"
          >
            <TabsList className="inline-flex h-9 w-full justify-start overflow-x-auto sm:w-fit">
              {treasuryTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className="gap-2 px-3 text-xs sm:text-sm"
                  >
                    <Icon className="size-4" />
                    <span>{tab.label}</span>
                    {tab.badge ? (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {tab.badge}
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        ) : null}

        {mode === 'treasury' &&
        (activeSection === 'movements' || activeSection === 'transfers') &&
        state === 'ready' ? (
          <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card p-2.5 sm:p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={activityFilter}
              onValueChange={(val) => {
                if (val) setActivityFilter(val as typeof activityFilter);
              }}
              aria-label="Activity filter"
              className="w-full sm:w-auto"
            >
              <TabsList className="h-8 p-0.5 w-full justify-start overflow-x-auto sm:w-fit bg-muted/70">
                {(
                  [
                    ['ALL', 'All movements'],
                    ['TRANSFERS', 'Transfers'],
                    ['IN', 'Money in'],
                    ['OUT', 'Money out'],
                    ['ADJUSTMENTS', 'Adjustments'],
                  ] as const
                ).map(([filterVal, label]) => (
                  <TabsTrigger
                    key={filterVal}
                    value={filterVal}
                    className="px-2.5 py-1 text-xs font-medium"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
              {data.accounts.length > 0 ? (
                <NativeSelect
                  value={activityAccountName}
                  onChange={(e) => setActivityAccountName(e.target.value)}
                  className="h-8 text-xs bg-background shadow-2xs"
                  aria-label="Filter by account"
                >
                  <option value="">All accounts</option>
                  {data.accounts.map((acc) => (
                    <option key={acc.id} value={acc.name}>
                      {acc.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activity..."
                className="h-8 w-44 text-xs sm:w-56 bg-background shadow-2xs"
              />
            </div>
          </div>
        ) : null}

        {mode === 'expenses' && state === 'ready' ? (
          <ExpenseControls
            query={expenseQuery}
            categoryId={expenseCategoryId}
            accountId={expenseAccountId}
            status={expenseStatus}
            paymentState={expensePaymentState}
            from={expenseFrom}
            to={expenseTo}
            categories={data.categories}
            accounts={data.accounts}
            pagination={data.expensePagination}
            loading={false}
            onQueryChange={setExpenseQuery}
            onCategoryChange={(value) => {
              setExpenseCategoryId(value);
              setExpensePage(1);
            }}
            onAccountChange={(value) => {
              setExpenseAccountId(value);
              setExpensePage(1);
            }}
            onStatusChange={(value) => {
              setExpenseStatus(value);
              setExpensePage(1);
            }}
            onPaymentStateChange={(value) => {
              setExpensePaymentState(value);
              setExpensePage(1);
            }}
            onFromChange={(value) => {
              setExpenseFrom(value);
              setExpensePage(1);
            }}
            onToChange={(value) => {
              setExpenseTo(value);
              setExpensePage(1);
            }}
            onQuickRangeChange={(from, to) => {
              setExpenseFrom(from);
              setExpenseTo(to);
              setExpensePage(1);
            }}
            onApply={(event) => {
              event.preventDefault();
              setAppliedExpenseQuery(expenseQuery.trim());
              setExpensePage(1);
            }}
            onReset={() => {
              setExpenseQuery('');
              setAppliedExpenseQuery('');
              setExpenseCategoryId('');
              setExpenseAccountId('');
              setExpenseStatus('ALL');
              setExpensePaymentState('ALL');
              setExpenseFrom('');
              setExpenseTo('');
              setExpensePage(1);
            }}
            onPageChange={setExpensePage}
          />
        ) : null}

        {state === 'loading' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading finance">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="font-medium">Finance data is unavailable.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The displayed balance is never replaced with a false zero when loading fails.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>
              <RefreshCw /> Try again
            </Button>
          </div>
        ) : null}

        {state === 'ready' && mode === 'overview' && data.overview ? (
          <FinanceOverview
            accounts={data.accounts}
            expenses={data.expenses}
            overview={data.overview}
            trends={data.trends}
            onTrendRangeChange={setTrendRange}
          />
        ) : null}

        {state === 'ready' && mode === 'treasury' && activeSection === 'accounts' ? (
          <AccountsSection
            accounts={data.accounts}
            onTransfer={(accountId) =>
              setDialog({ kind: 'transfer', defaultSourceAccountId: accountId })
            }
            onViewActivity={(accountId) => {
              const acc = data.accounts.find((a) => a.id === accountId);
              if (acc) setActivityAccountName(acc.name);
              handleTabChange('movements');
            }}
            onReconcile={(accountId) =>
              setDialog({ kind: 'balance-check', defaultAccountId: accountId })
            }
            onCreateAccount={canManageAccounts ? () => setDialog({ kind: 'account' }) : undefined}
          />
        ) : null}

        {state === 'ready' && mode === 'expenses' ? (
          <ExpensesSection
            expenses={data.expenses}
            canPay={canPayExpenses}
            onPay={(expense) => setDialog({ kind: 'expense-payment', expense })}
          />
        ) : null}

        {state === 'ready' &&
        mode === 'treasury' &&
        (activeSection === 'movements' || activeSection === 'transfers') ? (
          <ActivitySection entries={visibleLedger} />
        ) : null}

        {state === 'ready' && mode === 'treasury' && activeSection === 'reconciliation' ? (
          <ReconciliationSection
            checks={data.reconciliations}
            canManage={canManageReconciliation}
            onResolve={(check) => setDialog({ kind: 'reconciliation-resolution', check })}
            onReopen={(check) => setDialog({ kind: 'reconciliation-reopen', check })}
          />
        ) : null}

        {state === 'ready' && mode === 'cod-settlements' ? (
          <CodSettlementSection
            outstanding={data.outstandingCodPayments}
            settlements={data.codSettlements}
            onPageChange={setCodSettlementPage}
          />
        ) : null}

        <FinanceCommandDialog
          state={dialog}
          accounts={data.accounts}
          categories={data.categories}
          busy={busy}
          onClose={() => setDialog(undefined)}
          onCommand={command}
        />
        {codDialogOpen ? (
          <CodSettlementDialog
            open
            payments={data.outstandingCodPayments}
            accounts={data.accounts}
            busy={busy}
            onOpenChange={setCodDialogOpen}
            onCommand={command}
          />
        ) : null}
      </div>
    </main>
  );
}
