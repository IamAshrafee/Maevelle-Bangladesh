'use client';

import { CheckCircle2, Copy, ExternalLink, Landmark, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import type { PaymentDto, RefundDto } from '@maevelle/contracts';

import { OperationalEmptyState } from '../operational-worklist';
import { StatusBadge } from '../status-badge';
import { CopyButton } from './payment-ui';

interface PaymentsTableProps {
  readonly payments: readonly PaymentDto[];
  readonly busy: boolean;
  readonly canPostFinance: boolean;
  readonly hasAccounts: boolean;
  readonly onPost: (payment: PaymentDto) => void;
  readonly onRefund: (payment: PaymentDto) => void;
}

export function PaymentsTable({
  payments,
  busy,
  canPostFinance,
  hasAccounts,
  onPost,
  onRefund,
}: PaymentsTableProps) {
  if (!payments.length) {
    return (
      <OperationalEmptyState
        title="No payments found"
        description="No customer payments match your search query or selected filters. Clear the search or adjust filters to view recorded payments."
      />
    );
  }

  return (
    <>
      {/* Mobile Card View (< 768px) */}
      <div className="grid gap-3 md:hidden">
        {payments.map((payment) => {
          const isCod = payment.method === 'COD';
          const hasRefund = Number(payment.refunded) > 0;
          return (
            <Card key={payment.id} className="overflow-hidden border-border bg-card shadow-2xs">
              <CardContent className="grid gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link
                        className="font-mono text-sm font-bold text-primary hover:underline"
                        href={`/payments/${payment.id}`}
                      >
                        {payment.paymentNumber}
                      </Link>
                      <CopyButton value={payment.paymentNumber} label="Payment Number" />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Order</span>
                      <Link
                        className="font-mono font-medium text-foreground hover:text-primary hover:underline"
                        href={`/orders/${payment.orderId}`}
                      >
                        {payment.orderNumber}
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {humanizeFinanceCode(payment.method)}
                    </Badge>
                    <StatusBadge status={payment.status} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2.5 text-center">
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Collected</span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {formatMoney(payment.amount, payment.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Refunded</span>
                    <span className="font-mono text-xs font-medium tabular-nums text-destructive">
                      {hasRefund ? `-${formatMoney(payment.refunded, payment.currency)}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Net</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                      {formatMoney(payment.net, payment.currency)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <span>Ledger account:</span>
                    {payment.financePosting ? (
                      <span className="font-medium text-foreground truncate max-w-[180px]">
                        {payment.financePosting.accountName}
                      </span>
                    ) : isCod ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        Courier Holding
                      </span>
                    ) : (
                      <StatusBadge status="NOT_POSTED" />
                    )}
                  </div>
                  {payment.externalReference && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Reference:</span>
                      <div className="flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                          {payment.externalReference}
                        </code>
                        <CopyButton value={payment.externalReference} label="Reference" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span>Confirmed:</span>
                    <time dateTime={payment.confirmedAt}>
                      {formatFinanceDate(payment.confirmedAt, true)}
                    </time>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 text-xs"
                    render={<Link href={`/payments/${payment.id}`} />}
                  >
                    View Details
                  </Button>
                  {!payment.financePosting && canPostFinance && !isCod ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1 text-xs"
                      disabled={busy || !hasAccounts}
                      onClick={() => onPost(payment)}
                      type="button"
                    >
                      <Landmark className="size-3.5" aria-hidden="true" />
                      Receive
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    disabled={busy || Number(payment.net) <= 0}
                    onClick={() => onRefund(payment)}
                    type="button"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Refund
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop Table View (>= 768px) */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Payment</TableHead>
                <TableHead className="w-[130px]">Order</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Received into</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Confirmed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Link
                        className="font-mono font-semibold text-primary hover:underline"
                        href={`/payments/${payment.id}`}
                      >
                        {payment.paymentNumber}
                      </Link>
                      <CopyButton value={payment.paymentNumber} label="Payment Number" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-mono font-medium text-foreground hover:text-primary hover:underline"
                      href={`/orders/${payment.orderId}`}
                    >
                      {payment.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal text-xs">
                      {humanizeFinanceCode(payment.method)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium tabular-nums">
                    {formatMoney(payment.amount, payment.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {Number(payment.refunded) > 0 ? (
                      <span className="text-destructive font-medium">
                        -{formatMoney(payment.refunded, payment.currency)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums text-foreground">
                    {formatMoney(payment.net, payment.currency)}
                  </TableCell>
                  <TableCell>
                    {payment.financePosting ? (
                      <div className="space-y-0.5">
                        <span className="text-xs font-medium text-foreground">
                          {payment.financePosting.accountName}
                        </span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {payment.financePosting.transactionNumber}
                        </span>
                      </div>
                    ) : payment.method === 'COD' ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              Courier Holding
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Cash in courier custody. Remittance tracked in Finance COD settlements.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <StatusBadge status="NOT_POSTED" />
                    )}
                  </TableCell>
                  <TableCell>
                    {payment.externalReference ? (
                      <div className="flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                          {payment.externalReference}
                        </code>
                        <CopyButton value={payment.externalReference} label="Reference" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                    <time dateTime={payment.confirmedAt}>
                      {formatFinanceDate(payment.confirmedAt)}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        render={<Link href={`/payments/${payment.id}`} />}
                      >
                        View
                      </Button>
                      {!payment.financePosting && canPostFinance && payment.method !== 'COD' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-xs"
                          disabled={busy || !hasAccounts}
                          onClick={() => onPost(payment)}
                          type="button"
                          title="Post to financial treasury account"
                        >
                          <Landmark className="size-3.5" aria-hidden="true" />
                          Receive
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={busy || Number(payment.net) <= 0}
                        onClick={() => onRefund(payment)}
                        type="button"
                        title="Issue refund"
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        Refund
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

interface RefundsTableProps {
  readonly refunds: readonly RefundDto[];
  readonly busy: boolean;
  readonly canPostFinance: boolean;
  readonly hasAccounts: boolean;
  readonly onComplete: (refund: RefundDto) => void;
  readonly onPost: (refund: RefundDto) => void;
}

export function RefundsTable({
  refunds,
  busy,
  canPostFinance,
  hasAccounts,
  onComplete,
  onPost,
}: RefundsTableProps) {
  if (!refunds.length) {
    return (
      <OperationalEmptyState
        title="No customer refunds found"
        description="No refund records match your search or filter criteria. Refunds are initiated from confirmed payments in All Payments."
      />
    );
  }

  return (
    <>
      {/* Mobile Card View (< 768px) */}
      <div className="grid gap-3 md:hidden">
        {refunds.map((refund) => (
          <Card key={refund.id} className="overflow-hidden border-border bg-card shadow-2xs">
            <CardContent className="grid gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-foreground">
                      {refund.refundNumber}
                    </span>
                    <CopyButton value={refund.refundNumber} label="Refund Number" />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Order:</span>
                    <Link
                      className="font-mono font-medium text-primary hover:underline"
                      href={`/orders/${refund.orderId}`}
                    >
                      {refund.orderNumber}
                    </Link>
                    <span>·</span>
                    <Link
                      className="font-mono hover:underline text-muted-foreground"
                      href={`/payments/${refund.paymentId}`}
                    >
                      Pmt {refund.paymentNumber}
                    </Link>
                  </div>
                </div>
                <StatusBadge status={refund.status} />
              </div>

              <div className="flex items-baseline justify-between rounded-lg bg-rose-50/50 dark:bg-rose-950/20 px-3 py-2 border border-rose-200/60 dark:border-rose-900/40">
                <span className="text-xs text-muted-foreground">Refund amount</span>
                <span className="font-mono text-sm font-bold tabular-nums text-destructive">
                  -{formatMoney(refund.amount, refund.currency)}
                </span>
              </div>

              <div className="grid gap-1.5 text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                  <span>Reason:</span>
                  <span className="font-medium text-foreground">
                    {humanizeFinanceCode(refund.reasonCode)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Funding account:</span>
                  {refund.financePosting ? (
                    <span className="font-medium text-foreground truncate max-w-[180px]">
                      {refund.financePosting.accountName}
                    </span>
                  ) : refund.status === 'COMPLETED' ? (
                    <StatusBadge status="NOT_POSTED" />
                  ) : (
                    <span>—</span>
                  )}
                </div>
                {refund.externalReference && (
                  <div className="flex items-center justify-between gap-2">
                    <span>Reference:</span>
                    <div className="flex items-center gap-1">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                        {refund.externalReference}
                      </code>
                      <CopyButton value={refund.externalReference} label="Reference" />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span>Requested:</span>
                  <time dateTime={refund.requestedAt}>
                    {formatFinanceDate(refund.requestedAt, true)}
                  </time>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-border pt-3">
                {['REQUESTED', 'PROCESSING'].includes(refund.status) ? (
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1 h-9 gap-1.5 text-xs font-semibold"
                    disabled={busy}
                    onClick={() => onComplete(refund)}
                    type="button"
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Complete refund
                  </Button>
                ) : null}
                {refund.status === 'COMPLETED' && !refund.financePosting && canPostFinance ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 gap-1.5 text-xs font-medium"
                    disabled={busy || !hasAccounts}
                    onClick={() => onPost(refund)}
                    type="button"
                  >
                    <Landmark className="size-3.5" aria-hidden="true" />
                    Record account
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-3 text-xs"
                  render={<Link href={`/payments/${refund.paymentId}`} />}
                >
                  Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table View (>= 768px) */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Refund</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order / payment</TableHead>
                <TableHead>Paid from</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-semibold text-foreground">
                          {refund.refundNumber}
                        </span>
                        <CopyButton value={refund.refundNumber} label="Refund Number" />
                      </div>
                      <Link
                        className="block font-mono text-[11px] text-muted-foreground hover:text-primary hover:underline"
                        href={`/payments/${refund.paymentId}`}
                      >
                        Pmt {refund.paymentNumber}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums text-destructive">
                    -{formatMoney(refund.amount, refund.currency)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={refund.status} />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <Link
                        className="font-mono font-medium text-primary hover:underline text-xs"
                        href={`/orders/${refund.orderId}`}
                      >
                        {refund.orderNumber}
                      </Link>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {refund.paymentNumber}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {refund.financePosting ? (
                      <div className="space-y-0.5">
                        <span className="text-xs font-medium text-foreground">
                          {refund.financePosting.accountName}
                        </span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {refund.financePosting.transactionNumber}
                        </span>
                      </div>
                    ) : refund.status === 'COMPLETED' ? (
                      <StatusBadge status="NOT_POSTED" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {humanizeFinanceCode(refund.reasonCode)}
                  </TableCell>
                  <TableCell>
                    {refund.externalReference ? (
                      <div className="flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                          {refund.externalReference}
                        </code>
                        <CopyButton value={refund.externalReference} label="Reference" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        Awaiting completion
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                    <time dateTime={refund.requestedAt}>
                      {formatFinanceDate(refund.requestedAt)}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {['REQUESTED', 'PROCESSING'].includes(refund.status) ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 gap-1.5 text-xs font-semibold"
                          disabled={busy}
                          onClick={() => onComplete(refund)}
                          type="button"
                        >
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          Complete
                        </Button>
                      ) : refund.status === 'COMPLETED' &&
                        !refund.financePosting &&
                        canPostFinance ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs"
                          disabled={busy || !hasAccounts}
                          onClick={() => onPost(refund)}
                          type="button"
                        >
                          <Landmark className="size-3.5" aria-hidden="true" />
                          Record account
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
