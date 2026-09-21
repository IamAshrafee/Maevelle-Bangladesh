'use client';

import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Landmark,
  Layers,
  MoreHorizontal,
  RotateCcw,
  Scale,
  Smartphone,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { FinancialAccountDto } from '@maevelle/contracts';

import { OperationalEmptyState } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { NativeSelect } from '@/components/ui/native-select';
import { SearchInput } from '@/components/ui/search-input';
import {
  Stats,
  StatsCard,
  StatsDescription,
  StatsTitle,
  StatsValue,
} from '@/components/ui/stats';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney, humanizeFinanceCode } from '@/lib/finance/types';
import { cn } from '@/lib/utils';

export interface AccountsTableProps {
  readonly accounts: readonly FinancialAccountDto[];
  readonly onTransfer?: ((accountId: string) => void) | undefined;
  readonly onViewActivity?: ((accountId: string) => void) | undefined;
  readonly onReconcile?: ((accountId: string) => void) | undefined;
}

type AccountTypeFilter = 'ALL' | 'BANK' | 'MOBILE_WALLET' | 'CASH' | 'OTHER';
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type SortField = 'balance' | 'name' | 'activity';
type SortOrder = 'asc' | 'desc';

function getAccountVisual(type: string) {
  switch (type.toUpperCase()) {
    case 'BANK':
      return {
        icon: Landmark,
        iconBoxClass:
          'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 ring-1 ring-blue-500/20',
        badgeClass:
          'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
        label: 'Bank Account',
      };
    case 'MOBILE_WALLET':
      return {
        icon: Smartphone,
        iconBoxClass:
          'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 ring-1 ring-purple-500/20',
        badgeClass:
          'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
        label: 'Mobile Wallet',
      };
    case 'CASH':
      return {
        icon: Banknote,
        iconBoxClass:
          'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 ring-1 ring-emerald-500/20',
        badgeClass:
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
        label: 'Cash Drawer',
      };
    default:
      return {
        icon: Layers,
        iconBoxClass:
          'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 ring-1 ring-amber-500/20',
        badgeClass:
          'bg-muted text-muted-foreground border-border',
        label: humanizeFinanceCode(type),
      };
  }
}

function formatMovementTime(isoDate: string | null | undefined): { date: string; time: string } | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;

  return {
    date: new Intl.DateTimeFormat('en-BD', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d),
    time: new Intl.DateTimeFormat('en-BD', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d),
  };
}

export function AccountsTable({
  accounts,
  onTransfer,
  onViewActivity,
  onReconcile,
}: AccountsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortField, setSortField] = useState<SortField>('balance');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Liquidity & Account KPI calculations across all accounts
  const kpis = useMemo(() => {
    let totalBalance = 0;
    let bankBalance = 0;
    let cashAndWalletBalance = 0;
    let activeCount = 0;

    for (const account of accounts) {
      const balance = Number(account.ledger_balance) || 0;
      if (account.status === 'ACTIVE') {
        activeCount += 1;
        totalBalance += balance;

        const type = account.account_type.toUpperCase();
        if (type === 'BANK') {
          bankBalance += balance;
        } else if (type === 'CASH' || type === 'MOBILE_WALLET') {
          cashAndWalletBalance += balance;
        }
      }
    }

    return {
      totalBalance,
      bankBalance,
      cashAndWalletBalance,
      activeCount,
      totalCount: accounts.length,
    };
  }, [accounts]);

  // Client-side filtering & sorting
  const filteredAndSortedAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return accounts
      .filter((account) => {
        // Search filter
        if (query) {
          const matchesName = account.name.toLowerCase().includes(query);
          const matchesNumber = account.account_number.toLowerCase().includes(query);
          const matchesReference = account.reference_label?.toLowerCase().includes(query) ?? false;
          if (!matchesName && !matchesNumber && !matchesReference) {
            return false;
          }
        }

        // Type filter
        if (typeFilter !== 'ALL' && account.account_type.toUpperCase() !== typeFilter) {
          return false;
        }

        // Status filter
        if (statusFilter !== 'ALL' && account.status.toUpperCase() !== statusFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortField === 'balance') {
          comparison = Number(a.ledger_balance) - Number(b.ledger_balance);
        } else if (sortField === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sortField === 'activity') {
          const timeA = a.last_movement_at ? new Date(a.last_movement_at).getTime() : 0;
          const timeB = b.last_movement_at ? new Date(b.last_movement_at).getTime() : 0;
          comparison = timeA - timeB;
        }
        return sortOrder === 'desc' ? -comparison : comparison;
      });
  }, [accounts, searchQuery, typeFilter, statusFilter, sortField, sortOrder]);

  const hasActiveFilters = searchQuery !== '' || typeFilter !== 'ALL' || statusFilter !== 'ALL';

  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleCopyCode = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard write failed or blocked
    }
  };

  if (!accounts.length) {
    return (
      <OperationalEmptyState
        title="No financial accounts"
        description="Create Cash, Bank, mobile-wallet, or courier holding accounts before recording account-backed money movement."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:gap-5">
      {/* 1. Liquidity & Operational Summary using Maevelle's Stats Component */}
      <Stats aria-label="Financial accounts summary">
        <StatsCard>
          <StatsTitle>Total Liquid Funds</StatsTitle>
          <StatsValue>{formatMoney(kpis.totalBalance)}</StatsValue>
          <StatsDescription>Across all active accounts</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Commercial Banks</StatsTitle>
          <StatsValue>{formatMoney(kpis.bankBalance)}</StatsValue>
          <StatsDescription>Operating bank holdings</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Cash & Mobile Money</StatsTitle>
          <StatsValue>{formatMoney(kpis.cashAndWalletBalance)}</StatsValue>
          <StatsDescription>Immediate operating liquidity</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Active Accounts</StatsTitle>
          <StatsValue>
            {kpis.activeCount}{' '}
            <span className="text-xs font-normal text-muted-foreground">/ {kpis.totalCount}</span>
          </StatsValue>
          <StatsDescription>
            {kpis.totalCount - kpis.activeCount > 0
              ? `${kpis.totalCount - kpis.activeCount} inactive/frozen`
              : 'All accounts operational'}
          </StatsDescription>
        </StatsCard>
      </Stats>

      {/* 2. Compact Search, Filter & Sort Toolbar */}
      <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-2.5 sm:p-3 shadow-2xs lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery('')}
              placeholder="Search by name, code, or label..."
              shortcut="/"
              label="Search accounts"
              className="h-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <NativeSelect
              size="sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AccountTypeFilter)}
              aria-label="Filter by account type"
              className="text-xs"
            >
              <option value="ALL">All account types</option>
              <option value="BANK">Banks</option>
              <option value="MOBILE_WALLET">Mobile wallets</option>
              <option value="CASH">Cash drawers</option>
              <option value="OTHER">Other / Clearing</option>
            </NativeSelect>

            <NativeSelect
              size="sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by account status"
              className="text-xs"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </NativeSelect>

            {hasActiveFilters ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={resetFilters}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3" /> Reset
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2.5 border-t pt-2 lg:border-t-0 lg:pt-0">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            Showing <strong className="text-foreground">{filteredAndSortedAccounts.length}</strong> of{' '}
            {accounts.length}
          </span>

          <div className="flex items-center gap-1.5">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">Sort:</span>
            <NativeSelect
              size="sm"
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-') as [SortField, SortOrder];
                setSortField(field);
                setSortOrder(order);
              }}
              aria-label="Sort accounts"
              className="text-xs"
            >
              <option value="balance-desc">Balance: Highest first</option>
              <option value="balance-asc">Balance: Lowest first</option>
              <option value="name-asc">Name: A to Z</option>
              <option value="name-desc">Name: Z to A</option>
              <option value="activity-desc">Activity: Most recent</option>
            </NativeSelect>
          </div>
        </div>
      </div>

      {/* 3. The Accounts Table / Filtered Empty State */}
      {filteredAndSortedAccounts.length === 0 ? (
        <Empty className="py-10 border rounded-xl bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Landmark className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No accounts match your filters</EmptyTitle>
            <EmptyDescription>
              Try adjusting your search query or changing the type or status filter.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" variant="outline" onClick={resetFilters} className="gap-1.5">
              <RotateCcw className="size-3.5" /> Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-[220px] py-2 px-3.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        if (sortField === 'name') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('name');
                          setSortOrder('asc');
                        }
                      }}
                      className="-ml-2 h-7 px-2 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5"
                    >
                      <span>Account</span>
                      {sortField === 'name' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="size-3 text-primary" />
                        ) : (
                          <ArrowDown className="size-3 text-primary" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 text-muted-foreground/40" />
                      )}
                    </Button>
                  </TableHead>
                  <TableHead className="w-[140px] hidden sm:table-cell py-2 px-3 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Type
                  </TableHead>
                  <TableHead className="w-[100px] py-2 px-3 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="min-w-[150px] text-right py-2 px-3.5">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          if (sortField === 'balance') {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('balance');
                            setSortOrder('desc');
                          }
                        }}
                        className="-mr-2 h-7 px-2 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5"
                      >
                        <span>Ledger balance</span>
                        {sortField === 'balance' ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="size-3 text-primary" />
                          ) : (
                            <ArrowDown className="size-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 text-muted-foreground/40" />
                        )}
                      </Button>
                    </div>
                  </TableHead>
                  <TableHead className="min-w-[130px] hidden md:table-cell py-2 px-3 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Last movement
                  </TableHead>
                  <TableHead className="w-[160px] text-right py-2 px-3.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedAccounts.map((account) => {
                  const visual = getAccountVisual(account.account_type);
                  const Icon = visual.icon;
                  const balanceNumber = Number(account.ledger_balance) || 0;
                  const isNegative = balanceNumber < 0;
                  const isCopied = copiedId === account.id;
                  const movement = formatMovementTime(account.last_movement_at);

                  return (
                    <TableRow
                      key={account.id}
                      className="group/row hover:bg-muted/40 transition-colors border-b border-border/70"
                    >
                      {/* 1. Account details */}
                      <TableCell className="py-2.5 px-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover/row:scale-105',
                              visual.iconBoxClass,
                            )}
                          >
                            <Icon className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/finance/accounts/${account.id}`}
                              className="block truncate text-xs sm:text-sm font-semibold text-foreground hover:text-primary transition-colors"
                            >
                              {account.name}
                            </Link>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                              <span className="font-mono tracking-tight font-medium text-foreground/80">
                                {account.account_number}
                              </span>
                              <button
                                type="button"
                                data-slot="button"
                                onClick={() => handleCopyCode(account.account_number, account.id)}
                                title="Copy account number"
                                className="inline-flex size-4 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition"
                              >
                                {isCopied ? (
                                  <Check className="size-3 text-emerald-600 animate-in zoom-in-50 duration-150" />
                                ) : (
                                  <Copy className="size-2.5 opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                )}
                              </button>
                              {account.reference_label ? (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="truncate max-w-[130px] text-[10px] text-muted-foreground">
                                    {account.reference_label}
                                  </span>
                                </>
                              ) : null}
                            </div>
                            {/* Mobile-only type inline badge */}
                            <div className="mt-1 sm:hidden">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium border',
                                  visual.badgeClass,
                                )}
                              >
                                <Icon className="size-2.5" />
                                {visual.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Account Type (Tablet & Desktop) */}
                      <TableCell className="hidden sm:table-cell py-2.5 px-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium',
                            visual.badgeClass,
                          )}
                        >
                          <Icon className="size-3 shrink-0 opacity-80" />
                          <span>{visual.label}</span>
                        </span>
                      </TableCell>

                      {/* 3. Status */}
                      <TableCell className="py-2.5 px-3">
                        <StatusBadge status={account.status} className="text-[11px] px-2 py-0" />
                      </TableCell>

                      {/* 4. Ledger Balance */}
                      <TableCell className="py-2.5 px-3.5 text-right">
                        <div className="flex flex-col items-end">
                          <span
                            className={cn(
                              'font-mono text-xs sm:text-sm font-semibold tabular-nums',
                              isNegative ? 'text-destructive flex items-center gap-1' : 'text-foreground',
                            )}
                          >
                            {isNegative ? <AlertCircle className="size-3.5 inline text-destructive" /> : null}
                            {formatMoney(account.ledger_balance, account.currency_code)}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                            {account.currency_code || 'BDT'}
                          </span>
                        </div>
                      </TableCell>

                      {/* 5. Last Movement (Desktop) */}
                      <TableCell className="hidden md:table-cell py-2.5 px-3">
                        {movement ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-foreground">
                              {movement.date}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {movement.time}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] italic text-muted-foreground">No movements</span>
                        )}
                      </TableCell>

                      {/* 6. Single-line Actions (No wrapping) */}
                      <TableCell className="py-2.5 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {onTransfer ? (
                            <Button
                              size="xs"
                              variant="outline"
                              className="h-7 gap-1.5 px-2.5 text-xs font-medium text-foreground hover:bg-muted shadow-2xs"
                              onClick={() => onTransfer(account.id)}
                            >
                              <ArrowLeftRight className="size-3 text-muted-foreground" />
                              <span>Transfer</span>
                            </Button>
                          ) : null}

                          {onViewActivity ? (
                            <Button
                              size="xs"
                              variant="ghost"
                              className="hidden xl:inline-flex h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                              onClick={() => onViewActivity(account.id)}
                            >
                              <Activity className="size-3" />
                              <span>Activity</span>
                            </Button>
                          ) : null}

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  className="size-7 text-muted-foreground hover:text-foreground"
                                  title="More account actions"
                                />
                              }
                            >
                              <MoreHorizontal className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {onViewActivity ? (
                                <DropdownMenuItem onClick={() => onViewActivity(account.id)}>
                                  <Activity className="size-3.5 mr-2 text-muted-foreground" />
                                  <span>View activity</span>
                                </DropdownMenuItem>
                              ) : null}
                              {onReconcile ? (
                                <DropdownMenuItem onClick={() => onReconcile(account.id)}>
                                  <Scale className="size-3.5 mr-2 text-muted-foreground" />
                                  <span>Reconcile balance</span>
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onClick={() => handleCopyCode(account.account_number, account.id)}
                              >
                                <Copy className="size-3.5 mr-2 text-muted-foreground" />
                                <span>Copy account code</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem render={<Link href={`/finance/accounts/${account.id}`} />}>
                                <ExternalLink className="size-3.5 mr-2 text-muted-foreground" />
                                <span>Account details</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="size-7 text-muted-foreground/60 hover:text-foreground"
                            render={<Link href={`/finance/accounts/${account.id}`} />}
                            title="View Account Details & Provenance"
                          >
                            <ChevronRight className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
