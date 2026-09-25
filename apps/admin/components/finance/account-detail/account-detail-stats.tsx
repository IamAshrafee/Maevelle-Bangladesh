'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { FinanceAccountDetailDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import {
  Stats,
  StatsCard,
  StatsDescription,
  StatsTitle,
  StatsValue,
} from '@/components/ui/stats';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatFinanceDate, formatMoney } from '@/lib/finance/types';

interface AccountDetailStatsProps {
  readonly account: FinanceAccountDetailDto;
  readonly onOpenBalanceCheck?: (() => void) | undefined;
}

export function AccountDetailStats({
  account,
  onOpenBalanceCheck,
}: AccountDetailStatsProps) {
  const inflow = account.summary.totalInflow;
  const outflow = account.summary.totalOutflow;
  const entryCount = account.summary.entryCount;
  const currency = account.currency_code;
  const netFlow = Number(inflow) - Number(outflow);

  const reconciliation = account.latestReconciliation;
  const isReconciliationMatched =
    reconciliation && Number(reconciliation.differenceAmount) === 0;

  return (
    <TooltipProvider>
      <Stats
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
        aria-label="Account financial overview"
      >
        {/* Ledger Balance */}
        <StatsCard className="relative overflow-hidden border-border/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <StatsTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wallet className="size-3.5 text-primary/80" />
              <span>Current balance</span>
            </StatsTitle>
            <Tooltip>
              <TooltipTrigger
                className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                aria-label="Balance information"
              >
                <HelpCircle className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                Derived directly from {entryCount} immutable financial transactions.
                Maevelle does not mutate account balances directly.
              </TooltipContent>
            </Tooltip>
          </div>
          <StatsValue className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {formatMoney(account.ledger_balance, currency)}
          </StatsValue>
          <StatsDescription className="text-xs text-muted-foreground">
            Audited immutable balance
          </StatsDescription>
        </StatsCard>

        {/* Total Money In */}
        <StatsCard className="border-border/80 shadow-2xs">
          <StatsTitle className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <ArrowDownLeft className="size-3.5" />
            <span>Total money in</span>
          </StatsTitle>
          <StatsValue className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
            {formatMoney(inflow, currency)}
          </StatsValue>
          <StatsDescription className="text-xs text-muted-foreground">
            Cumulative credits received
          </StatsDescription>
        </StatsCard>

        {/* Total Money Out */}
        <StatsCard className="border-border/80 shadow-2xs">
          <StatsTitle className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
            <ArrowUpRight className="size-3.5" />
            <span>Total money out</span>
          </StatsTitle>
          <StatsValue className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400">
            {formatMoney(outflow, currency)}
          </StatsValue>
          <StatsDescription className="text-xs text-muted-foreground">
            Cumulative debits & payments
          </StatsDescription>
        </StatsCard>

        {/* Net Flow & Activity */}
        <StatsCard className="border-border/80 shadow-2xs">
          <StatsTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="size-3.5 text-primary/80" />
            <span>Net cash movement</span>
          </StatsTitle>
          <StatsValue
            className={`mt-1 text-xl sm:text-2xl font-semibold tracking-tight ${
              netFlow >= 0
                ? 'text-foreground'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatMoney(netFlow, currency)}
          </StatsValue>
          <StatsDescription className="text-xs text-muted-foreground">
            {entryCount} total {entryCount === 1 ? 'transaction' : 'transactions'}
          </StatsDescription>
        </StatsCard>

        {/* Reconciliation Health */}
        <StatsCard className="border-border/80 shadow-2xs col-span-1 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <StatsTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Scale className="size-3.5 text-primary/80" />
              <span>Statement audit</span>
            </StatsTitle>
            {reconciliation ? (
              <StatusBadge
                status={
                  isReconciliationMatched
                    ? 'MATCHED'
                    : reconciliation.status === 'CLOSED'
                      ? 'RESOLVED'
                      : 'EXCEPTION'
                }
              />
            ) : (
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded">
                Unchecked
              </span>
            )}
          </div>
          <StatsValue className="mt-1 text-base sm:text-lg font-semibold tracking-tight text-foreground truncate">
            {reconciliation ? (
              isReconciliationMatched ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm sm:text-base font-semibold">
                  <CheckCircle2 className="size-4 shrink-0" /> Perfect match
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 text-sm sm:text-base">
                  Diff: {formatMoney(reconciliation.differenceAmount, currency)}
                </span>
              )
            ) : (
              <span className="text-muted-foreground text-sm font-normal">
                No balance audit
              </span>
            )}
          </StatsValue>
          <StatsDescription className="text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {reconciliation
                ? formatFinanceDate(reconciliation.observedAt, false)
                : 'Never verified'}
            </span>
            {onOpenBalanceCheck ? (
              <button
                type="button"
                onClick={onOpenBalanceCheck}
                className="text-primary hover:underline font-medium text-xs ml-auto"
              >
                Verify now
              </button>
            ) : null}
          </StatsDescription>
        </StatsCard>
      </Stats>
    </TooltipProvider>
  );
}
