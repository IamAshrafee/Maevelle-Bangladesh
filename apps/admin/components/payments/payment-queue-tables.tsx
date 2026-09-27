'use client';

import { Banknote, CheckCircle2, XCircle } from 'lucide-react';
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
import { formatFinanceDate, formatMoney } from '@/lib/finance/types';

import type { PaymentAttemptDto, PendingCodCollectionDto } from '@maevelle/contracts';

import { OperationalEmptyState } from '../operational-worklist';

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
        description="No matching manual payment submissions need a decision."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
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
                    className="font-semibold text-primary hover:underline"
                    href={`/orders/${attempt.orderId}`}
                  >
                    {attempt.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {attempt.methodName}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatMoney(attempt.expectedAmount)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {attempt.claimedAmount ? formatMoney(attempt.claimedAmount) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-medium">
                    {attempt.customerReference}
                  </code>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
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
                      <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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
        description="Delivered COD parcels appear here until the collected amount and courier reference are recorded."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Delivery</TableHead>
              <TableHead className="w-[120px]">Order</TableHead>
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
                <TableCell className="font-medium text-foreground">
                  {item.deliveryNumber}
                </TableCell>
                <TableCell>
                  <Link className="font-semibold text-primary hover:underline" href={`/orders/${item.orderId}`}>
                    {item.orderNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  {formatMoney(item.expectedAmount, item.currency)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatMoney(item.outstandingAmount, item.currency)}
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-foreground">
                      {item.carrierName ?? 'Manual delivery'}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {item.trackingReference ?? 'No tracking reference'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <time dateTime={item.deliveredAt}>
                    {formatFinanceDate(item.deliveredAt, true)}
                  </time>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 gap-1.5 text-xs"
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
  );
}
