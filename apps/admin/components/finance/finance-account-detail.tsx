'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Coins,
  History,
  Info,
  Scale,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type {
  FinanceAccountDetailDto,
  FinanceLedgerEntryDto,
  FinanceReconciliationDto,
  FinancialAccountDto,
  PaginatedResultDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { BalanceCheckDialog } from '@/components/finance/balance-check-dialog';
import { SetOpeningBalanceDialog } from '@/components/finance/set-opening-balance-dialog';
import { TransferFundsDialog } from '@/components/finance/transfer-dialog';
import { OperationalFeedback } from '@/components/operational-worklist';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchApiData } from '@/lib/api';

import { AccountDetailHeader } from './account-detail/account-detail-header';
import { AccountDetailStats } from './account-detail/account-detail-stats';
import { AccountInfoTab } from './account-detail/account-info-tab';
import { AccountLedgerTab } from './account-detail/account-ledger-tab';
import { AccountReconciliationsTab } from './account-detail/account-reconciliations-tab';
import { AccountStatusDialog } from './account-detail/account-status-dialog';
import { EditAccountDialog } from './account-detail/edit-account-dialog';
import { ReopenReconciliationDialog } from './account-detail/reopen-reconciliation-dialog';
import { ResolveReconciliationDialog } from './account-detail/resolve-reconciliation-dialog';
import type {
  AccountLedgerData,
  LedgerFilterState,
} from './account-detail/types';

export function FinanceAccountDetail({ accountId }: { readonly accountId: string }) {
  // Authorization capabilities
  const canManage = useAdminCapability('finance.accounts.manage');
  const canTransfer = useAdminCapability('finance.transfers.create');
  const canReconcile = useAdminCapability('finance.reconciliation.manage');
  const canViewReconciliation = useAdminCapability('finance.reconciliation.view');
  const canViewAccounts = useAdminCapability('finance.accounts.view');

  // Account and environment state
  const [account, setAccount] = useState<FinanceAccountDetailDto>();
  const [allAccounts, setAllAccounts] = useState<readonly FinancialAccountDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('ledger');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // User feedback notice
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'warning' | 'danger'>('success');

  // Dialog visibility states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [openingBalanceDialogOpen, setOpeningBalanceDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [balanceCheckDialogOpen, setBalanceCheckDialogOpen] = useState(false);
  const [resolveCheck, setResolveCheck] = useState<FinanceReconciliationDto | undefined>();
  const [reopenCheck, setReopenCheck] = useState<FinanceReconciliationDto | undefined>();

  // Ledger activity state & filters
  const [ledgerFilters, setLedgerFilters] = useState<LedgerFilterState>({
    query: '',
    direction: 'ALL',
    transactionType: 'ALL',
    from: '',
    to: '',
    page: 1,
    pageSize: 25,
  });
  const [ledgerData, setLedgerData] = useState<AccountLedgerData>({
    entries: [],
    pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
  });
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);

  // Reconciliation checks state
  const [reconciliations, setReconciliations] = useState<readonly FinanceReconciliationDto[]>([]);
  const [isReconciliationsLoading, setIsReconciliationsLoading] = useState(false);

  // 1. Load core account detail and list of all accounts
  const loadAccount = useCallback(async () => {
    try {
      const [accountDetail, accountsList] = await Promise.all([
        fetchApiData<FinanceAccountDetailDto>(
          `/admin/finance/accounts/${encodeURIComponent(accountId)}`,
        ),
        canViewAccounts
          ? fetchApiData<readonly FinancialAccountDto[]>('/admin/finance/accounts')
          : Promise.resolve([]),
      ]);

      if (!accountDetail) throw new Error('Financial account was not found.');
      setAccount(accountDetail);
      setAllAccounts(accountsList ?? []);
      return accountDetail;
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Financial account could not be loaded.',
      );
      setState('error');
      return null;
    }
  }, [accountId, canViewAccounts]);

  // 2. Load ledger movements for this account with filters
  const loadLedger = useCallback(
    async (filters: LedgerFilterState) => {
      setIsLedgerLoading(true);
      try {
        const queryParams = new URLSearchParams({
          accountId,
          page: String(filters.page),
          pageSize: String(filters.pageSize),
        });

        if (filters.query.trim()) queryParams.set('q', filters.query.trim());
        if (filters.direction !== 'ALL') queryParams.set('direction', filters.direction);
        if (filters.transactionType !== 'ALL')
          queryParams.set('transactionType', filters.transactionType);
        if (filters.from) queryParams.set('from', filters.from);
        if (filters.to) queryParams.set('to', filters.to);

        const result = await fetchApiData<PaginatedResultDto<FinanceLedgerEntryDto>>(
          `/admin/finance/ledger?${queryParams.toString()}`,
        );

        setLedgerData({
          entries: result?.items ?? [],
          pagination: result?.pagination ?? {
            page: filters.page,
            pageSize: filters.pageSize,
            totalItems: 0,
            totalPages: 0,
          },
        });
      } catch {
        // Fallback gracefully
        setLedgerData({
          entries: [],
          pagination: {
            page: filters.page,
            pageSize: filters.pageSize,
            totalItems: 0,
            totalPages: 0,
          },
        });
      } finally {
        setIsLedgerLoading(false);
      }
    },
    [accountId],
  );

  // 3. Load statement reconciliations specifically for this account
  const loadReconciliations = useCallback(async () => {
    if (!canViewReconciliation) return;
    setIsReconciliationsLoading(true);
    try {
      const result = await fetchApiData<readonly FinanceReconciliationDto[]>(
        `/admin/finance/reconciliations?accountId=${encodeURIComponent(accountId)}`,
      );
      setReconciliations(result ?? []);
    } catch {
      setReconciliations([]);
    } finally {
      setIsReconciliationsLoading(false);
    }
  }, [accountId, canViewReconciliation]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    setState('loading');

    void Promise.all([loadAccount(), loadLedger(ledgerFilters), loadReconciliations()]).then(
      ([acc]) => {
        if (isMounted && acc) {
          setState('ready');
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, [loadAccount, loadLedger, loadReconciliations]);

  // Handle ledger filter adjustments
  const handleFiltersChange = (newFilters: Partial<LedgerFilterState>) => {
    const updated = { ...ledgerFilters, ...newFilters };
    setLedgerFilters(updated);
    void loadLedger(updated);
  };

  const handleResetFilters = () => {
    const reset: LedgerFilterState = {
      query: '',
      direction: 'ALL',
      transactionType: 'ALL',
      from: '',
      to: '',
      page: 1,
      pageSize: 25,
    };
    setLedgerFilters(reset);
    void loadLedger(reset);
  };

  // Comprehensive refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadAccount(), loadLedger(ledgerFilters), loadReconciliations()]);
      setFeedbackMessage('Financial account details and movements refreshed.');
      setFeedbackTone('success');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Command executor for Transfer and Balance Check dialogs
  const handleCommand = async (path: string, body: Record<string, unknown>) => {
    await fetchApiData(path, {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setFeedbackMessage('Operation saved successfully. Account balances refreshed.');
    setFeedbackTone('success');
    await handleRefresh();
  };

  // ---------------------------------------------------------------------------
  // Loading & Error states
  // ---------------------------------------------------------------------------
  if (state === 'loading') {
    return (
      <main className="grid gap-5 px-4 py-6 sm:px-6 lg:px-8 max-w-[1500px] mx-auto">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </main>
    );
  }

  if (state === 'error' || !account) {
    return (
      <main className="grid gap-4 px-4 py-12 text-sm sm:px-6 lg:px-8 max-w-[1500px] mx-auto">
        <div className="flex items-center gap-2 text-destructive font-medium">
          <XCircle className="size-5 shrink-0" />
          <span>{errorMessage || 'Financial account could not be found.'}</span>
        </div>
        <div>
          <Button render={<Link href="/finance/accounts" />} variant="outline">
            <ArrowLeft className="mr-1.5 size-4" /> Back to financial accounts
          </Button>
        </div>
      </main>
    );
  }

  const isAccountActive = account.status === 'ACTIVE';
  const openReconciliationsCount = reconciliations.filter(
    (r) => r.status === 'OPEN' && Number(r.difference_amount) !== 0,
  ).length;

  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-6">
        {/* User Operational Feedback Banner */}
        {feedbackMessage ? (
          <OperationalFeedback tone={feedbackTone}>{feedbackMessage}</OperationalFeedback>
        ) : null}

        {/* Deactivated Notice Banner */}
        {!isAccountActive ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Financial Account Inactive
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  This account has been deactivated. It cannot be used as a payment source, transfer destination, or expense payment method until reactivated.
                </p>
              </div>
            </div>
            {canManage ? (
              <Button
                size="sm"
                variant="default"
                onClick={() => setStatusDialogOpen(true)}
                className="shrink-0"
              >
                Reactivate account
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Opening Balance Callout Banner */}
        {account.canSetOpeningBalance ? (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1.5 text-primary shrink-0 mt-0.5">
                <Coins className="size-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">
                  Initial Opening Float Available
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  This newly created account currently has zero recorded movements. Record an opening balance to establish its starting cash float.
                </p>
              </div>
            </div>
            {canManage ? (
              <Button
                size="sm"
                variant="default"
                onClick={() => setOpeningBalanceDialogOpen(true)}
                className="w-full shrink-0 sm:w-auto"
              >
                <Coins className="mr-1.5 size-4" />
                Set opening balance
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Header with Visuals, Copy Code, and Actions */}
        <AccountDetailHeader
          account={account}
          canManage={canManage}
          canTransfer={canTransfer}
          canReconcile={canReconcile}
          isRefreshing={isRefreshing}
          onRefresh={() => void handleRefresh()}
          onOpenTransfer={() => setTransferDialogOpen(true)}
          onOpenBalanceCheck={() => setBalanceCheckDialogOpen(true)}
          onOpenOpeningBalance={() => setOpeningBalanceDialogOpen(true)}
          onOpenEdit={() => setEditDialogOpen(true)}
          onOpenStatus={() => setStatusDialogOpen(true)}
        />

        {/* Key Metrics / Stats Strip */}
        <AccountDetailStats
          account={account}
          onOpenBalanceCheck={
            canReconcile && isAccountActive ? () => setBalanceCheckDialogOpen(true) : undefined
          }
        />

        {/* Tabbed Workflows: Ledger Activity, Reconciliations, and Account Details */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="inline-flex h-9 w-full justify-start overflow-x-auto sm:w-fit bg-muted/60 p-0.5 border border-border/40">
            <TabsTrigger value="ledger" className="gap-2 text-xs sm:text-sm px-3">
              <History className="size-3.5" />
              <span>Ledger movements</span>
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                {account.summary.entryCount}
              </span>
            </TabsTrigger>

            <TabsTrigger value="reconciliations" className="gap-2 text-xs sm:text-sm px-3">
              <Scale className="size-3.5" />
              <span>Statement audits</span>
              {openReconciliationsCount > 0 ? (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  {openReconciliationsCount}
                </span>
              ) : null}
            </TabsTrigger>

            <TabsTrigger value="info" className="gap-2 text-xs sm:text-sm px-3">
              <Info className="size-3.5" />
              <span>Account information</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="outline-hidden">
            <AccountLedgerTab
              ledgerData={ledgerData}
              filters={ledgerFilters}
              isLoading={isLedgerLoading}
              onFiltersChange={handleFiltersChange}
              onResetFilters={handleResetFilters}
            />
          </TabsContent>

          <TabsContent value="reconciliations" className="outline-hidden">
            <AccountReconciliationsTab
              reconciliations={reconciliations}
              account={account}
              canManage={canManage}
              isLoading={isReconciliationsLoading}
              onOpenBalanceCheck={() => setBalanceCheckDialogOpen(true)}
              onResolveDifference={(check) => setResolveCheck(check)}
              onReopenDifference={(check) => setReopenCheck(check)}
            />
          </TabsContent>

          <TabsContent value="info" className="outline-hidden">
            <AccountInfoTab
              account={account}
              canManage={canManage}
              onOpenEdit={() => setEditDialogOpen(true)}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* Dialog Modals */}
      {/* --------------------------------------------------------------------- */}

      {/* Edit Account Metadata Dialog */}
      <EditAccountDialog
        open={editDialogOpen}
        account={account}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => {
          setFeedbackMessage('Account details updated successfully.');
          setFeedbackTone('success');
          void handleRefresh();
        }}
      />

      {/* Account Status Change Dialog */}
      <AccountStatusDialog
        open={statusDialogOpen}
        account={account}
        onOpenChange={setStatusDialogOpen}
        onSuccess={() => {
          setFeedbackMessage(
            account.status === 'ACTIVE'
              ? 'Financial account deactivated.'
              : 'Financial account reactivated and ready for operations.',
          );
          setFeedbackTone('success');
          void handleRefresh();
        }}
      />

      {/* Set Opening Balance Dialog */}
      <SetOpeningBalanceDialog
        open={openingBalanceDialogOpen}
        onOpenChange={setOpeningBalanceDialogOpen}
        account={account}
        onSuccess={() => {
          setFeedbackMessage('Opening balance established successfully.');
          setFeedbackTone('success');
          void handleRefresh();
        }}
      />

      {/* Transfer Funds Dialog */}
      <TransferFundsDialog
        open={transferDialogOpen}
        accounts={allAccounts}
        defaultSourceAccountId={account.id}
        onOpenChange={setTransferDialogOpen}
        onSuccess={() => {
          setFeedbackMessage('Fund transfer completed and balances updated.');
          setFeedbackTone('success');
          void handleRefresh();
        }}
        onCommand={handleCommand}
      />

      {/* Balance Check / Statement Audit Dialog */}
      <BalanceCheckDialog
        open={balanceCheckDialogOpen}
        accounts={allAccounts}
        defaultAccountId={account.id}
        onOpenChange={setBalanceCheckDialogOpen}
        onSuccess={() => {
          setFeedbackMessage('Balance check recorded and reconciliation log updated.');
          setFeedbackTone('success');
          void handleRefresh();
        }}
        onCommand={handleCommand}
      />

      {/* Resolve Reconciliation Difference Dialog */}
      <ResolveReconciliationDialog
        open={Boolean(resolveCheck)}
        check={resolveCheck}
        onOpenChange={(open) => {
          if (!open) setResolveCheck(undefined);
        }}
        onSuccess={() => {
          setFeedbackMessage('Reconciliation difference resolved.');
          setFeedbackTone('success');
          void handleRefresh();
        }}
      />

      {/* Reopen Reconciliation Difference Dialog */}
      <ReopenReconciliationDialog
        open={Boolean(reopenCheck)}
        check={reopenCheck}
        onOpenChange={(open) => {
          if (!open) setReopenCheck(undefined);
        }}
        onSuccess={() => {
          setFeedbackMessage('Reconciliation difference reopened for review.');
          setFeedbackTone('success');
          void handleRefresh();
        }}
      />
    </main>
  );
}
