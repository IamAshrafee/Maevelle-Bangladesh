'use client';

import { CheckCircle2, ExternalLink, Landmark, RotateCcw } from 'lucide-react';
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

import type { PaymentDto, RefundDto } from '@maevelle/contracts';

import { OperationalEmptyState } from '../operational-worklist';
import { StatusBadge } from '../status-badge';

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
        title="No collected payments"
        description="No Payment records match the current filters."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Payment</TableHead>
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
                  <Link
                    className="font-semibold text-primary hover:underline"
                    href={`/payments/${payment.id}`}
                  >
                    {payment.paymentNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    className="font-medium text-foreground hover:text-primary hover:underline"
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
                <TableCell className="text-right font-medium">
                  {formatMoney(payment.amount, payment.currency)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {Number(payment.refunded) > 0 ? (
                    <span className="text-destructive font-medium">
                      -{formatMoney(payment.refunded, payment.currency)}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
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
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      Courier Holding
                    </span>
                  ) : (
                    <StatusBadge status="NOT_POSTED" />
                  )}
                </TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                    {payment.externalReference}
                  </code>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
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
                    {!payment.financePosting && canPostFinance ? (
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
        title="No refunds"
        description="No Refund records match the current filters."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
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
                    <span className="font-semibold text-foreground">
                      {refund.refundNumber}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      Pmt {refund.paymentNumber}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-destructive">
                  -{formatMoney(refund.amount, refund.currency)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={refund.status} />
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <Link
                      className="font-medium text-primary hover:underline text-xs"
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
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                      {refund.externalReference}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Awaiting completion</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <time dateTime={refund.requestedAt}>{formatFinanceDate(refund.requestedAt)}</time>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {['REQUESTED', 'PROCESSING'].includes(refund.status) ? (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 gap-1.5 text-xs"
                        disabled={busy}
                        onClick={() => onComplete(refund)}
                        type="button"
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        Complete refund
                      </Button>
                    ) : refund.status === 'COMPLETED' && !refund.financePosting && canPostFinance ? (
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
  );
}
