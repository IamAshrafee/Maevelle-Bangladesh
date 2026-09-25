'use client';

import { useState } from 'react';
import {
  ArrowLeftRight,
  Banknote,
  Check,
  Coins,
  Copy,
  Landmark,
  Layers,
  Pencil,
  Power,
  RefreshCw,
  Scale,
  Smartphone,
} from 'lucide-react';
import type { FinanceAccountDetailDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AccountDetailHeaderProps {
  readonly account: FinanceAccountDetailDto;
  readonly canManage: boolean;
  readonly canTransfer: boolean;
  readonly canReconcile: boolean;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
  readonly onOpenTransfer: () => void;
  readonly onOpenBalanceCheck: () => void;
  readonly onOpenOpeningBalance: () => void;
  readonly onOpenEdit: () => void;
  readonly onOpenStatus: () => void;
}

function getAccountVisual(type: string) {
  switch (type.toUpperCase()) {
    case 'BANK':
      return {
        icon: Landmark,
        iconBoxClass:
          'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20',
        badgeClass:
          'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
        label: 'Bank Account',
      };
    case 'MOBILE_WALLET':
      return {
        icon: Smartphone,
        iconBoxClass:
          'bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20',
        badgeClass:
          'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
        label: 'Mobile Wallet',
      };
    case 'CASH':
      return {
        icon: Banknote,
        iconBoxClass:
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20',
        badgeClass:
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
        label: 'Cash Account',
      };
    default:
      return {
        icon: Layers,
        iconBoxClass:
          'bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-1 ring-slate-500/20',
        badgeClass:
          'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
        label: 'Other Account',
      };
  }
}

export function AccountDetailHeader({
  account,
  canManage,
  canTransfer,
  canReconcile,
  isRefreshing,
  onRefresh,
  onOpenTransfer,
  onOpenBalanceCheck,
  onOpenOpeningBalance,
  onOpenEdit,
  onOpenStatus,
}: AccountDetailHeaderProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const visual = getAccountVisual(account.account_type);
  const VisualIcon = visual.icon;
  const isAccountActive = account.status === 'ACTIVE';

  const copyAccountCode = async () => {
    try {
      await navigator.clipboard.writeText(account.account_number);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <TooltipProvider>
      <header className="flex flex-col gap-4 border-b pb-5">
        <Breadcrumb
          items={[
            { label: 'Finance', href: '/finance' },
            { label: 'Financial accounts', href: '/finance/accounts' },
            { label: account.name, current: true },
          ]}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${visual.iconBoxClass}`}
              aria-hidden="true"
            >
              <VisualIcon className="size-5" />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground truncate">
                  {account.name}
                </h1>
                <StatusBadge status={account.status} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger
                    onClick={copyAccountCode}
                    className="inline-flex items-center gap-1 font-mono font-medium text-foreground bg-muted/60 hover:bg-muted px-2 py-0.5 rounded border border-border/50 transition-colors"
                  >
                    <span>{account.account_number}</span>
                    {copiedCode ? (
                      <Check className="size-3 text-emerald-600" />
                    ) : (
                      <Copy className="size-3 text-muted-foreground" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {copiedCode ? 'Copied to clipboard!' : 'Click to copy account code'}
                  </TooltipContent>
                </Tooltip>

                <span>·</span>
                <span>{visual.label}</span>
                <span>·</span>
                <span className="font-semibold text-foreground/80">{account.currency_code}</span>

                {account.reference_label ? (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-[280px] sm:max-w-[400px] text-foreground/75" title={account.reference_label}>
                      {account.reference_label}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 sm:self-center">
            {canTransfer && isAccountActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenTransfer}
                className="gap-1.5"
              >
                <ArrowLeftRight className="size-3.5" />
                <span>Transfer funds</span>
              </Button>
            ) : null}

            {canReconcile && isAccountActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenBalanceCheck}
                className="gap-1.5"
              >
                <Scale className="size-3.5" />
                <span>Check balance</span>
              </Button>
            ) : null}

            {canManage && account.canSetOpeningBalance ? (
              <Button
                variant="default"
                size="sm"
                onClick={onOpenOpeningBalance}
                className="gap-1.5"
              >
                <Coins className="size-3.5" />
                <span>Set opening balance</span>
              </Button>
            ) : null}

            {canManage ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onOpenEdit}
                      className="gap-1.5"
                    >
                      <Pencil className="size-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </Button>
                  }
                />
                <TooltipContent side="bottom">Edit account display name and reference notes</TooltipContent>
              </Tooltip>
            ) : null}

            {canManage ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={isAccountActive ? 'outline' : 'default'}
                      size="sm"
                      onClick={onOpenStatus}
                      className={isAccountActive ? 'text-muted-foreground hover:text-destructive' : ''}
                    >
                      <Power className="size-3.5" />
                      <span className="sr-only sm:not-sr-only sm:inline">
                        {isAccountActive ? 'Deactivate' : 'Activate'}
                      </span>
                    </Button>
                  }
                />
                <TooltipContent side="bottom">
                  {isAccountActive ? 'Deactivate account to prevent new usage' : 'Activate account for operations'}
                </TooltipContent>
              </Tooltip>
            ) : null}

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    aria-label="Refresh financial account"
                  >
                    <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Refresh account & ledger</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
