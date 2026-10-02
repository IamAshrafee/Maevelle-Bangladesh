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
  if (tab === 'transfers') return 'movements';
  if (['accounts', 'movements', 'transfers', 'cod-settlements', 'reconciliation'].includes(tab)) {
    return tab as FinanceSection;
  }
  if (tab === 'activity') return 'movements';
  return 'accounts';
}

function sectionCopy(
  section: FinanceSection,
  mode: FinanceConsoleMode,
): { title: string; description: string } {
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
        description:
          'Where company money is held across banks, mobile wallets, cash drawers, and holding accounts.',
      };
    case 'movements':
    case 'transfers':
      return {
        title: 'Activity & ledger',
        description:
          'Chronological ledger of money in, money out, internal transfers, and controlled adjustments.',
      };
    case 'cod-settlements':
      return {
        title: 'Courier COD settlements',
        description:
          'Track collected cash held by couriers, record remittances and deductions, and receive the net amount into a financial account.',
      };
    case 'reconciliation':
      return {
        title: 'Balance checks',
        description:
          'Compare Maevelle balances with bank, wallet, cash, or courier statements without changing history.',
      };
    default:
      return {
        title: 'Accounts & treasury',
        description:
          'Manage company financial accounts, activity ledger, courier COD settlements, and balance checks.',
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

  const [ledgerQuery, setLedgerQuery] = useState('');
  const [appliedLedgerQuery, setAppliedLedgerQuery] = useState('');
  const [ledgerDirection, setLedgerDirection] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [ledgerTransactionType, setLedgerTransactionType] = useState('ALL');
  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerTo, setLedgerTo] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);

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
        !isExpenses &&
        (isOverview || activeSection === 'movements' || activeSection === 'transfers');
      const needsCategories = isExpenses;
      const needsChecks =
        isOverview || (!isExpenses && !isCodSettlements && activeSection === 'reconciliation');
      const needsCodSettlements =
        isCodSettlements ||
        (mode === 'treasury' &&
          (activeSection === 'cod-settlements' || activeSection === 'accounts'));
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

      const ledgerParameters = new URLSearchParams({
        page: String(ledgerPage),
        pageSize: '25',
      });
      if (appliedLedgerQuery) ledgerParameters.set('q', appliedLedgerQuery);
      if (ledgerDirection !== 'ALL') ledgerParameters.set('direction', ledgerDirection);
      if (ledgerTransactionType !== 'ALL')
        ledgerParameters.set('transactionType', ledgerTransactionType);
      if (ledgerAccountId) ledgerParameters.set('accountId', ledgerAccountId);
      if (ledgerFrom) ledgerParameters.set('from', ledgerFrom);
      if (ledgerTo) ledgerParameters.set('to', ledgerTo);

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
              `/admin/finance/ledger?${ledgerParameters.toString()}`,
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
          ledgerResult.items.length > 0 || !prev.ledger.length ? ledgerResult.items : prev.ledger,
        ledgerPagination: ledgerResult.pagination,
        categories: categories.length > 0 || !prev.categories.length ? categories : prev.categories,
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
    appliedLedgerQuery,
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
    ledgerAccountId,
    ledgerDirection,
    ledgerFrom,
    ledgerPage,
    ledgerTo,
    ledgerTransactionType,
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
      const requiresKey =
        idempotentPaths.has(path) ||
        path.endsWith('/pay') ||
        path.endsWith('/owner-funded-payments');
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
    ) : mode === 'cod-settlements' || activeSection === 'cod-settlements' ? (
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
      label: 'Activity & ledger',
      icon: Activity,
    },
    {
      key: 'cod-settlements' as const,
      label: 'COD settlements',
      icon: Banknote,
      badge: data.outstandingCodPayments.filter((p) => p.canSettle).length || undefined,
    },
    {
      key: 'reconciliation' as const,
      label: 'Balance checks',
      icon: Scale,
      badge:
        data.reconciliations.filter((r) => r.status === 'OPEN' && Number(r.difference_amount) !== 0)
          .length || undefined,
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
              setLedgerAccountId(accountId);
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
          <ActivitySection
            entries={data.ledger}
            pagination={data.ledgerPagination}
            query={ledgerQuery}
            direction={ledgerDirection}
            transactionType={ledgerTransactionType}
            accountId={ledgerAccountId}
            from={ledgerFrom}
            to={ledgerTo}
            accounts={data.accounts}
            loading={busy}
            onQueryChange={setLedgerQuery}
            onDirectionChange={(dir) => {
              setLedgerDirection(dir);
              setLedgerPage(1);
            }}
            onTransactionTypeChange={(type) => {
              setLedgerTransactionType(type);
              setLedgerPage(1);
            }}
            onAccountChange={(id) => {
              setLedgerAccountId(id);
              setLedgerPage(1);
            }}
            onFromChange={(f) => {
              setLedgerFrom(f);
              setLedgerPage(1);
            }}
            onToChange={(t) => {
              setLedgerTo(t);
              setLedgerPage(1);
            }}
            onQuickRangeChange={(f, t) => {
              setLedgerFrom(f);
              setLedgerTo(t);
              setLedgerPage(1);
            }}
            onApply={(e) => {
              e.preventDefault();
              setAppliedLedgerQuery(ledgerQuery.trim());
              setLedgerPage(1);
            }}
            onReset={() => {
              setLedgerQuery('');
              setAppliedLedgerQuery('');
              setLedgerDirection('ALL');
              setLedgerTransactionType('ALL');
              setLedgerAccountId('');
              setLedgerFrom('');
              setLedgerTo('');
              setLedgerPage(1);
            }}
            onPageChange={setLedgerPage}
          />
        ) : null}

        {state === 'ready' && mode === 'treasury' && activeSection === 'reconciliation' ? (
          <ReconciliationSection
            checks={data.reconciliations}
            canManage={canManageReconciliation}
            onResolve={(check) => setDialog({ kind: 'reconciliation-resolution', check })}
            onReopen={(check) => setDialog({ kind: 'reconciliation-reopen', check })}
          />
        ) : null}

        {state === 'ready' &&
        (mode === 'cod-settlements' ||
          (mode === 'treasury' && activeSection === 'cod-settlements')) ? (
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
