'use client';

import { Plus, Scale } from 'lucide-react';
import type { FinanceAccountDetailDto, FinanceReconciliationDto } from '@maevelle/contracts';

import { OperationalEmptyState } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';

interface AccountReconciliationsTabProps {
  readonly reconciliations: readonly FinanceReconciliationDto[];
  readonly account: FinanceAccountDetailDto;
  readonly canManage: boolean;
  readonly isLoading: boolean;
  readonly onOpenBalanceCheck: () => void;
  readonly onResolveDifference: (check: FinanceReconciliationDto) => void;
  readonly onReopenDifference: (check: FinanceReconciliationDto) => void;
}

export function AccountReconciliationsTab({
  reconciliations,
  account,
  canManage,
  isLoading,
  onOpenBalanceCheck,
  onResolveDifference,
  onReopenDifference,
}: AccountReconciliationsTabProps) {
  const currency = account.currency_code;
  const isAccountActive = account.status === 'ACTIVE';

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header Bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Scale className="size-4 text-primary" />
              <span>Statement & Balance Audits</span>
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Compare actual external balances from banks or mobile wallets against Maevelle&apos;s immutable ledger.
            </p>
          </div>

          {canManage && isAccountActive ? (
            <Button size="sm" onClick={onOpenBalanceCheck} className="shrink-0 gap-1.5">
              <Plus className="size-3.5" />
              <span>Record balance check</span>
            </Button>
          ) : null}
        </div>

        {/* Content list */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
        ) : reconciliations.length === 0 ? (
          <Card className="py-12 border-border/80 shadow-2xs">
            <OperationalEmptyState
              title="No balance checks recorded"
              description="No external statement balance checks have been recorded for this account. Auditing balances regularly ensures physical and operational cash integrity."
            />
            {canManage && isAccountActive ? (
              <div className="flex justify-center mt-4">
                <Button variant="default" size="sm" onClick={onOpenBalanceCheck}>
                  <Scale className="size-3.5 mr-1.5" />
                  Perform first balance check
                </Button>
              </div>
            ) : null}
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reconciliations.map((check) => {
              const matched = Number(check.difference_amount) === 0;
              const resolved = check.status === 'CLOSED' && !matched;

              return (
                <Card
                  key={check.id}
                  className={`transition-shadow hover:shadow-xs border-border/80 ${
                    matched
                      ? 'border-emerald-500/20'
                      : resolved
                        ? 'border-border'
                        : 'border-amber-500/35 bg-amber-500/[0.01]'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Scale className="size-3.5 text-muted-foreground" />
                        <Tooltip>
                          <TooltipTrigger>
                            <span>{formatFinanceDate(check.created_at, true)}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {new Date(check.created_at).toISOString()}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <StatusBadge
                        status={matched ? 'MATCHED' : resolved ? 'RESOLVED' : 'EXCEPTION'}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                          Ledger
                        </span>
                        <strong className="text-foreground">
                          {formatMoney(check.ledger_balance, currency)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                          Observed
                        </span>
                        <strong className="text-foreground">
                          {formatMoney(check.observed_balance, currency)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                          Variance
                        </span>
                        <strong
                          className={
                            matched
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {matched ? '0.00' : formatMoney(check.difference_amount, currency)}
                        </strong>
                      </div>
                    </div>

                    {check.resolution ? (
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground text-[10px]">
                          <span className="font-semibold uppercase tracking-wider text-foreground/80">
                            {humanizeFinanceCode(check.resolution.code)}
                          </span>
                          <span>{formatFinanceDate(check.resolution.resolved_at, false)}</span>
                        </div>
                        <p className="text-foreground/90 text-xs italic">
                          &ldquo;{check.resolution.note}&rdquo;
                        </p>
                      </div>
                    ) : null}

                    {/* Operational resolution actions */}
                    {!matched && check.status === 'OPEN' && canManage ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onResolveDifference(check)}
                        className="w-full text-xs h-8"
                      >
                        Resolve difference
                      </Button>
                    ) : null}

                    {resolved && canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onReopenDifference(check)}
                        className="w-full text-xs h-7 text-muted-foreground hover:text-foreground"
                      >
                        Reopen difference
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
