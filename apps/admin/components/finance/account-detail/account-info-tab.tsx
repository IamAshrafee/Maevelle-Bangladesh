'use client';

import { useState } from 'react';
import {
  Check,
  Copy,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import type { FinanceAccountDetailDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatFinanceDate, humanizeFinanceCode } from '@/lib/finance/types';

interface AccountInfoTabProps {
  readonly account: FinanceAccountDetailDto;
  readonly canManage: boolean;
  readonly onOpenEdit: () => void;
}

export function AccountInfoTab({
  account,
  canManage,
  onOpenEdit,
}: AccountInfoTabProps) {
  const [copiedId, setCopiedId] = useState(false);

  const copyUuid = async () => {
    try {
      await navigator.clipboard.writeText(account.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Fallback
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Account Configuration */}
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Account Identity</CardTitle>
                <CardDescription>
                  Configuration, naming, and bank/wallet reference parameters.
                </CardDescription>
              </div>
              {canManage ? (
                <Button variant="outline" size="sm" onClick={onOpenEdit} className="gap-1 text-xs">
                  <Pencil className="size-3" />
                  <span>Edit details</span>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="divide-y divide-border/40 text-sm">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Account name</span>
                <span className="font-medium text-foreground">{account.name}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Account code</span>
                <span className="font-mono font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded text-xs border border-border/40">
                  {account.account_number}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Account type</span>
                <span className="font-medium text-foreground">
                  {humanizeFinanceCode(account.account_type)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Currency</span>
                <span className="font-semibold text-foreground">{account.currency_code}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Operating status</span>
                <StatusBadge status={account.status} />
              </div>
              <div className="flex items-start justify-between py-2.5">
                <span className="text-muted-foreground shrink-0 mr-4">Reference details</span>
                <span className="font-medium text-foreground text-right max-w-[260px] break-words">
                  {account.reference_label || (
                    <span className="text-muted-foreground italic font-normal">
                      None configured
                    </span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Audit Provenance & Timestamps */}
          <Card className="border-border/80 shadow-2xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Ledger Provenance</CardTitle>
              <CardDescription>
                Audit timestamps, version tracking, and system identifiers.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border/40 text-sm">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Internal Account ID</span>
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <span className="truncate max-w-[170px] sm:max-w-[210px] text-muted-foreground">
                    {account.id}
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      onClick={copyUuid}
                      className="p-1 hover:text-foreground text-muted-foreground transition-colors"
                      aria-label="Copy account UUID"
                    >
                      {copiedId ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {copiedId ? 'Copied UUID!' : 'Copy UUID'}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Created at</span>
                <span className="font-medium text-foreground">
                  {account.created_at
                    ? formatFinanceDate(account.created_at, true)
                    : 'System initial'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Last updated at</span>
                <span className="font-medium text-foreground">
                  {account.updated_at
                    ? formatFinanceDate(account.updated_at, true)
                    : account.created_at
                      ? formatFinanceDate(account.created_at, true)
                      : 'Initial'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Last movement at</span>
                <span className="font-medium text-foreground">
                  {account.last_movement_at
                    ? formatFinanceDate(account.last_movement_at, true)
                    : 'No movements'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Concurrency version</span>
                <span className="font-mono text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/40">
                  v{account.version}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Opening float recorded</span>
                <span className="font-medium text-foreground">
                  {account.hasOpeningBalance ? 'Yes (immutable)' : 'No (eligible for float)'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Accounting Guarantee Notice */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-4 sm:p-5 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-1 text-sm">
              <h3 className="font-semibold text-foreground">
                Immutable Ledger Architecture Guarantee
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Maevelle does not store a standalone mutable balance column that can be arbitrarily edited.
                The displayed ledger balance of this account ({account.name}) is mathematically derived by summing
                all recorded credit and debit transaction entries in the database. Every operation (payments, transfers,
                expenses, and reconciliations) creates an immutable audit event and outbox message with optimistic
                version locking.
              </p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
