'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  ExternalLink,
  HandCoins,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  User,
  AlertTriangle,
} from 'lucide-react';
import type { CapitalEventDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';
import { signedMoney } from './types';

export interface CapitalTransactionDetailSheetProps {
  readonly event?: CapitalEventDto | undefined;
  readonly defaultCurrency: string;
  readonly open: boolean;
  readonly canManage: boolean;
  readonly onClose: () => void;
  readonly onOpenContributor: (contributorId: string) => void;
  readonly onOpenTransaction: (eventId: string) => void;
  readonly onReverse: (event: CapitalEventDto) => void;
}

export function CapitalTransactionDetailSheet({
  event,
  defaultCurrency,
  open,
  canManage,
  onClose,
  onOpenContributor,
  onOpenTransaction,
  onReverse,
}: CapitalTransactionDetailSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!event) return null;

  const isIncoming = Number(event.amountDelta) > 0;
  const isOutgoing = Number(event.amountDelta) < 0;

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  function getEventIcon(type: CapitalEventDto['eventType']) {
    switch (type) {
      case 'CONTRIBUTION':
        return <ArrowDownToLine className="size-4 text-emerald-600" />;
      case 'OWNER_FUNDED_EXPENSE':
        return <HandCoins className="size-4 text-emerald-600" />;
      case 'WITHDRAWAL':
        return <ArrowUpFromLine className="size-4 text-rose-600" />;
      case 'REVERSAL':
        return <RotateCcw className="size-4 text-amber-600" />;
      default:
        return null;
    }
  }

  function getEventDescription(type: CapitalEventDto['eventType']) {
    switch (type) {
      case 'CONTRIBUTION':
        return 'Capital deposited into a business financial account. Increases cash and contributor capital position without altering revenue.';
      case 'OWNER_FUNDED_EXPENSE':
        return 'Business expense paid directly with personal funds. Increases contributor capital position and pays the obligation without changing business account cash.';
      case 'WITHDRAWAL':
        return 'Capital returned to the contributor from a business account. Reduces cash and capital position; not classified as a business expense.';
      case 'REVERSAL':
        return 'Compensating accounting reversal. Cancels the financial effect of an earlier transaction while preserving the complete audit trail.';
      default:
        return '';
    }
  }

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-foreground">
              {getEventIcon(event.eventType)}
              <span>{event.transactionNumber}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <StatusBadge status={humanizeFinanceCode(event.eventType)} />
              {event.isReversed ? (
                <Badge variant="destructive" className="text-[10px]">
                  Reversed
                </Badge>
              ) : null}
            </div>
          </div>
          <SheetTitle className="sr-only">Capital Transaction Detail</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground mt-1">
            Recorded {formatFinanceDate(event.occurredAt, true)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 px-6 py-5 space-y-5 text-sm">
          {/* Capital Impact Card */}
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Capital impact</span>
            <div
              className={`text-2xl font-bold tabular-nums ${
                isOutgoing ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {signedMoney(event.amountDelta, event.currencyCode || defaultCurrency, formatMoney)}
            </div>
            <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
              {getEventDescription(event.eventType)}
            </p>
          </div>

          {/* Reversal Status Banner */}
          {event.isReversed ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                <AlertTriangle className="size-4 shrink-0" />
                <span>This transaction has been reversed</span>
              </div>
              {event.reversalReason ? (
                <p className="text-xs text-foreground/90 leading-relaxed">
                  Reason: <span className="italic font-medium">{event.reversalReason}</span>
                </p>
              ) : null}
              {event.reversalEventId && event.reversalTransactionNumber ? (
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => onOpenTransaction(event.reversalEventId!)}
                  >
                    <RotateCcw className="size-3" />
                    <span>View reversal {event.reversalTransactionNumber}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Reversal Of Banner (If this event is itself a reversal) */}
          {event.eventType === 'REVERSAL' && event.reversalOfEventId ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-xs">
                <RotateCcw className="size-4 shrink-0" />
                <span>Compensating reversal transaction</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This transaction offsets and reverses an earlier capital entry.
              </p>
              {event.reversalOfTransactionNumber ? (
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => onOpenTransaction(event.reversalOfEventId!)}
                  >
                    <span>View original {event.reversalOfTransactionNumber}</span>
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Contributor Card */}
          <div className="rounded-xl border p-4 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Contributor</span>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <User className="size-4 text-primary" />
                {event.contributorName}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-primary hover:underline gap-1"
                onClick={() => onOpenContributor(event.contributorId)}
              >
                <span>View ledger</span>
                <ExternalLink className="size-3" />
              </Button>
            </div>
          </div>

          {/* Business Connections */}
          <div className="rounded-xl border p-4 space-y-3">
            <span className="text-xs font-medium text-muted-foreground">Business connection</span>
            {event.accountId && event.accountName ? (
              <div className="flex items-start justify-between gap-3 pt-1">
                <div>
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Landmark className="size-4 text-emerald-600" />
                    <span>{event.accountName}</span>
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">
                    {isIncoming ? 'Received deposited capital' : 'Disbursed withdrawn capital'}
                  </span>
                </div>
                <Link
                  href={`/finance/accounts/${event.accountId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <span>Account detail</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            ) : null}

            {event.expenseId && event.expenseNumber ? (
              <div className="flex items-start justify-between gap-3 pt-1">
                <div>
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <ReceiptText className="size-4 text-primary" />
                    <span>Expense {event.expenseNumber}</span>
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">
                    Paid personally outside business accounts
                  </span>
                </div>
                <Link
                  href={`/finance/expenses/${event.expenseId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <span>Expense record</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            ) : null}

            {event.purchaseId && event.purchaseNumber ? (
              <div className="flex items-start justify-between gap-3 pt-1">
                <div>
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShoppingBag className="size-4 text-blue-600" />
                    <span>Purchase order {event.purchaseNumber}</span>
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">
                    Supplier invoice obligation funded by owner
                  </span>
                </div>
                <Link
                  href={`/purchases/${event.purchaseId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <span>Purchase order</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            ) : null}

            {!event.accountId && !event.expenseId && !event.purchaseId ? (
              <span className="text-xs text-muted-foreground block">
                Direct capital ledger transaction.
              </span>
            ) : null}
          </div>

          {/* Reference & Notes */}
          {(event.reference || event.note) ? (
            <div className="rounded-xl border p-4 space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Reference & notes</span>
              {event.reference ? (
                <div>
                  <span className="text-xs text-muted-foreground block">Reference:</span>
                  <p className="font-medium text-foreground text-xs">{event.reference}</p>
                </div>
              ) : null}
              {event.note ? (
                <div>
                  <span className="text-xs text-muted-foreground block">Notes:</span>
                  <p className="text-foreground text-xs whitespace-pre-wrap">{event.note}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t bg-muted/10 p-4 flex-row flex-wrap items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => handleCopy(event.transactionNumber)}
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            <span>{copied ? 'Copied' : 'Copy transaction #'}</span>
          </Button>

          <div className="flex items-center gap-2">
            {canManage && !event.isReversed && event.eventType !== 'REVERSAL' ? (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 text-xs"
                onClick={() => onReverse(event)}
              >
                <RotateCcw className="size-3.5" />
                <span>Reverse entry</span>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
