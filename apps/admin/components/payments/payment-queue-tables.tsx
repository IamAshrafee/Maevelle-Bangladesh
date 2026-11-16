'use client';

import { paymentMoney as formatMoney } from '@/lib/payments/transport';
import { Banknote, CheckCircle2, Copy, XCircle } from 'lucide-react';
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
import { formatFinanceDate } from '@/lib/finance/types';

import type { PaymentAttemptDto, PendingCodCollectionDto } from '@maevelle/contracts';

import { OperationalEmptyState } from '../operational-worklist';
import { CopyButton } from './payment-ui';

interface VerificationQueueProps {
  readonly attempts: readonly PaymentAttemptDto[];
  readonly busy: boolean;
  readonly onDecision: (attempt: PaymentAttemptDto, mode: 'verify' | 'reject') => void;
}

export function VerificationQueue({ attempts, busy, onDecision }: VerificationQueueProps) {
  if (!attempts.length) {
    return (
      <OperationalEmptyState
        title="Verification queue is clear"
        description="No customer wallet claims (bKash/Nagad TxIDs) are currently awaiting review. When shoppers submit transaction references at checkout, they appear here for verification against statements."
      />
    );
  }

  return (
    <>
      {/* Mobile Card View (< 1024px) */}
      <div className="grid gap-3 lg:hidden">
        {attempts.map((attempt) => (
          <Card key={attempt.id} className="overflow-hidden border-border bg-card shadow-2xs">
            <CardContent className="grid gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Order:</span>
                    <Link
                      className="font-mono text-sm font-bold text-primary hover:underline"
                      href={`/orders/${attempt.orderId}`}
                    >
                      {attempt.orderNumber}
                    </Link>
                  </div>
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {attempt.methodName}
                  </Badge>
                </div>
                <div className="text-right">
                  <span className="block text-[11px] text-muted-foreground">Expected</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {formatMoney(attempt.expectedAmount)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5 text-xs">
                <div>
                  <span className="block text-muted-foreground">Claimed Amount:</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {attempt.claimedAmount ? formatMoney(attempt.claimedAmount) : 'Not specified'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-muted-foreground">Customer Reference:</span>
                  <div className="flex items-center justify-end gap-1">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                      {attempt.customerReference}
                    </code>
                    <CopyButton value={attempt.customerReference} label="Customer Reference" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Submitted:</span>
                <time dateTime={attempt.submittedAt}>
                  {formatFinanceDate(attempt.submittedAt, true)}
                </time>
              </div>

              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 gap-1.5 text-xs font-semibold"
                  disabled={busy}
                  onClick={() => onDecision(attempt, 'verify')}
                  type="button"
                >
                  <CheckCircle2
                    className="size-3.5 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 h-9 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy}
                  onClick={() => onDecision(attempt, 'reject')}
                  type="button"
                >
                  <XCircle className="size-3.5" aria-hidden="true" />
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table View (>= 1024px) */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Order</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Claimed</TableHead>
                <TableHead>Customer reference</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell>
                    <Link
                      className="font-mono font-semibold text-primary hover:underline"
                      href={`/orders/${attempt.orderId}`}
                    >
                      {attempt.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal text-xs">
                      {attempt.methodName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium tabular-nums">
                    {formatMoney(attempt.expectedAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium tabular-nums">
                    {attempt.claimedAmount ? (
                      formatMoney(attempt.claimedAmount)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-medium">
                        {attempt.customerReference}
                      </code>
                      <CopyButton value={attempt.customerReference} label="Reference" />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                    <time dateTime={attempt.submittedAt}>
                      {formatFinanceDate(attempt.submittedAt, true)}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs font-medium"
                        disabled={busy}
                        onClick={() => onDecision(attempt, 'verify')}
                        type="button"
                      >
                        <CheckCircle2
                          className="size-3.5 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        onClick={() => onDecision(attempt, 'reject')}
                        type="button"
                      >
                        <XCircle className="size-3.5" aria-hidden="true" />
                        Reject
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

interface CodCollectionQueueProps {
  readonly collections: readonly PendingCodCollectionDto[];
  readonly busy: boolean;
  readonly onCollect: (collection: PendingCodCollectionDto) => void;
}

export function CodCollectionQueue({ collections, busy, onCollect }: CodCollectionQueueProps) {
  if (!collections.length) {
    return (
      <OperationalEmptyState
        title="No delivered COD awaiting collection"
        description="Delivered Cash on Delivery parcels appear here once marked delivered by couriers. Use this queue to confirm the actual cash collected from customers at their doorstep."
      />
    );
  }

  return (
    <>
      {/* Mobile Card View (< 1024px) */}
      <ul className="grid gap-3 lg:hidden">
        {collections.map((item) => (
          <li key={item.deliveryId}>
            <Card className="overflow-hidden border-border bg-card shadow-2xs">
              <CardContent className="grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Order:</span>
                      <Link
                        href={`/orders/${item.orderId}`}
                        className="font-mono font-bold text-primary hover:underline text-sm"
                      >
                        {item.orderNumber}
                      </Link>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Delivery:</span>
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {item.deliveryNumber}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    {item.carrierName ?? 'Manual delivery'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2.5 text-center">
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Expected Collectible</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                      {formatMoney(item.expectedAmount, item.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Order Balance</span>
                    <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
                      {formatMoney(item.outstandingAmount, item.currency)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-1.5 text-xs text-muted-foreground">
                  {item.trackingReference && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Tracking reference:</span>
                      <div className="flex items-center gap-1">
                        <code className="font-mono text-[11px] text-foreground font-semibold">
                          {item.trackingReference}
                        </code>
                        <CopyButton value={item.trackingReference} label="Tracking Reference" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span>Delivered:</span>
                    <time className="font-mono tabular-nums" dateTime={item.deliveredAt}>
                      {formatFinanceDate(item.deliveredAt, true)}
                    </time>
                  </div>
                </div>

                <Button
                  className="h-10 w-full gap-2 text-xs font-semibold"
                  disabled={busy}
                  onClick={() => onCollect(item)}
                >
                  <Banknote className="size-4" aria-hidden="true" />
                  Record cash collection
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* Desktop Table View (>= 1024px) */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Delivery</TableHead>
                <TableHead className="w-[130px]">Order</TableHead>
                <TableHead className="text-right">Expected here</TableHead>
                <TableHead className="text-right">Order balance</TableHead>
                <TableHead>Courier / tracking</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.map((item) => (
                <TableRow key={item.deliveryId}>
                  <TableCell className="font-mono font-medium text-foreground">
                    {item.deliveryNumber}
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-mono font-semibold text-primary hover:underline"
                      href={`/orders/${item.orderId}`}
                    >
                      {item.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums text-foreground">
                    {formatMoney(item.expectedAmount, item.currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {formatMoney(item.outstandingAmount, item.currency)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {item.carrierName ?? 'Manual delivery'}
                      </span>
                      {item.trackingReference ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {item.trackingReference}
                          </span>
                          <CopyButton value={item.trackingReference} label="Tracking" />
                        </div>
                      ) : (
                        <span className="block text-[11px] text-muted-foreground italic">
                          No tracking reference
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                    <time dateTime={item.deliveredAt}>
                      {formatFinanceDate(item.deliveredAt, true)}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-8 gap-1.5 text-xs font-semibold"
                      disabled={busy}
                      onClick={() => onCollect(item)}
                      type="button"
                    >
                      <Banknote className="size-3.5" aria-hidden="true" />
                      Record collection
                    </Button>
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
