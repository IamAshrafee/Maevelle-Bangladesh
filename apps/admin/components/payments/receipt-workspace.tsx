'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import type { PaymentDetailDto, PaymentPageDto, PaymentExceptionDto } from '@maevelle/contracts';
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
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';
import { formatFinanceDate } from '@/lib/finance/types';
import { useAdminContext } from '../admin-capabilities';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
  CopyButton,
  PaymentMoney,
  PaymentNotice,
  PaymentField,
  PaymentPager,
  PaymentQueryState,
  paymentLabel,
} from './payment-ui';
import { PaymentCommand } from './payment-command';
import { CreateRefundAction, RefundOperations } from './refund-operations';

export function ReceiptWorkspace({ paymentId }: { paymentId: string }) {
  const query = usePaymentQuery<PaymentDetailDto>(`/admin/payments/${paymentId}`);
  return (
    <PaymentQueryState query={query}>
      {query.data && (
        <ReceiptReconciliation payment={query.data} refresh={query.refresh} showRefundAction />
      )}
    </PaymentQueryState>
  );
}

export function ReceiptReconciliation({
  payment,
  refresh,
  showRefundAction = false,
  onClose,
}: {
  payment: PaymentDetailDto;
  refresh: () => void;
  showRefundAction?: boolean;
  onClose?: () => void;
}) {
  const paymentId = payment.id;
  const actor = useAdminContext();
  const correct = usePaymentPermission('payments.correct');
  const [reverse, setReverse] = useState(false);
  const r = payment.verifiedReceipt;

  const refundBlocksReversal = Boolean(
    payment.refunds.some((refund) =>
      ['REQUESTED', 'PROCESSING', 'UNKNOWN_EXTERNAL_OUTCOME', 'COMPLETED'].includes(refund.status),
    ),
  );

  return (
    <Card className="border-border bg-card shadow-2xs">
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Verified Receipt & Reconciliation</h3>
              {r && <StatusBadge status={r.reversed ? 'REVERSED' : r.disposition} />}
            </div>
            {payment.externalReference && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Recorded transfer reference:</span>
                <code className="font-mono text-xs font-semibold text-foreground">
                  {payment.externalReference}
                </code>
                <CopyButton value={payment.externalReference} label="Transfer Reference" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>

        {r ? (
          <>
            {/* 4-Metric Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">Actual Received</span>
                <PaymentMoney value={r.received} currency={payment.currency} size="lg" />
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">Original Allocation</span>
                <PaymentMoney value={r.allocated} currency={payment.currency} size="lg" />
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">Original Unallocated</span>
                <PaymentMoney value={r.unallocated} currency={payment.currency} size="lg" />
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">Remaining Liability</span>
                <PaymentMoney
                  value={r.remainingUnallocated}
                  currency={payment.currency}
                  size="lg"
                  className={Number(r.remainingUnallocated) > 0 ? 'text-amber-600 dark:text-amber-400' : ''}
                />
              </div>
            </div>

            {r.disposition === 'LATE_RECEIPT_LIABILITY' && (
              <PaymentNotice tone="warning">
                Late funds were retained for reconciliation. This did not reopen the Order or allocate stock.
              </PaymentNotice>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Originating Order:</span>
                <Link
                  href={`/orders/${r.orderId}`}
                  className="font-mono font-medium text-primary hover:underline"
                >
                  {payment.orderNumber}
                </Link>
              </div>
              {showRefundAction && (
                <div className="flex items-center gap-1.5">
                  <span>Current Order Outstanding:</span>
                  <PaymentMoney value={payment.order.outstanding} currency={payment.currency} size="sm" />
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              {showRefundAction && <CreateRefundAction payment={payment} onRefresh={refresh} />}
              {correct && !r.reversed && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  disabled={r.verifiedBy === actor.actorId || refundBlocksReversal}
                  onClick={() => setReverse(true)}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Record evidenced receipt reversal
                </Button>
              )}
            </div>

            {refundBlocksReversal && (
              <PaymentNotice tone="warning">
                Existing refund obligations block reversal. Reconcile their financial history before any correction.
              </PaymentNotice>
            )}

            {r.verifiedBy === actor.actorId && (
              <p className="text-xs text-muted-foreground">
                Maker-checker rule: A different authorized operator must correct or reverse this receipt.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This payment has no separately verified wallet receipt.
          </p>
        )}

        {/* Refund history on this receipt */}
        {payment.refunds.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-border">
            <h4 className="text-sm font-semibold text-foreground">Refund History on This Payment</h4>
            <div className="grid gap-2">
              {payment.refunds.map((refund) => (
                <div
                  key={refund.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-mono font-semibold text-foreground">{refund.refundNumber}</span>
                    <span className="block text-muted-foreground">
                      Requested {formatFinanceDate(refund.requestedAt, true)}
                    </span>
                  </div>
                  <PaymentMoney value={refund.amount} currency={refund.currency} size="sm" />
                  <StatusBadge status={refund.status} />
                  <RefundOperations refund={refund} onRefresh={refresh} />
                </div>
              ))}
            </div>
          </div>
        )}

        {reverse && (
          <PaymentCommand
            title="Record independent receipt reversal"
            path={`/admin/payments/${paymentId}/reversal`}
            consequence="This records a compensating Finance adjustment. It never deletes transfer history, reverses stock or reopens an Order. Pending or completed refunds block reversal until reconciled."
            onClose={() => setReverse(false)}
            onSuccess={() => {
              setReverse(false);
              refresh();
            }}
            build={(f) => ({
              reason: String(f.get('reason')),
              evidenceReference: String(f.get('evidenceReference')),
            })}
          >
            <PaymentField label="Correction reason" name="reason" maxLength={512} />
            <PaymentField
              label="Independent reversal evidence reference"
              name="evidenceReference"
              maxLength={512}
            />
          </PaymentCommand>
        )}
      </CardContent>
    </Card>
  );
}

export function ReceiptExceptions() {
  const allowed = usePaymentPermission('payments.review');
  const view = usePaymentPermission('payments.view');
  const [page, setPage] = useState(1);
  const [selected, select] = useState<string>();

  const q = usePaymentQuery<PaymentPageDto<PaymentExceptionDto>>(
    allowed ? `/admin/payments/receipt-exceptions?page=${page}` : null,
  );

  if (!allowed) return <PaymentNotice>Payment review permission is required.</PaymentNotice>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Receipt Exceptions Queue</h3>
          <p className="text-xs text-muted-foreground">
            Late payments, excess money received, and reversed receipts requiring financial disposition.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={q.refresh}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <>
            {/* Mobile Cards (< 768px) */}
            <div className="grid gap-3 md:hidden">
              {q.data.items.map((r) => (
                <Card key={r.paymentId} className="overflow-hidden border-border bg-card shadow-2xs">
                  <CardContent className="grid gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="font-mono text-sm font-bold text-foreground">
                          {r.paymentId.slice(0, 8)}…
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>Order:</span>
                          <Link
                            href={`/orders/${r.orderId}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {r.orderId.slice(0, 8)}…
                          </Link>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {paymentLabel(r.disposition)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2.5 text-center">
                      <div>
                        <span className="block text-[11px] text-muted-foreground">Received</span>
                        <PaymentMoney value={r.received} size="sm" />
                      </div>
                      <div>
                        <span className="block text-[11px] text-muted-foreground">Unallocated</span>
                        <PaymentMoney value={r.unallocated} size="sm" className="text-amber-600 dark:text-amber-400" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <StatusBadge status={r.status} />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold"
                        disabled={!view}
                        onClick={() => select(r.paymentId)}
                      >
                        Reconcile
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop Table (>= 768px) */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table stickyHeader density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Payment ID</TableHead>
                      <TableHead className="w-[140px]">Order ID</TableHead>
                      <TableHead>Disposition</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Unallocated</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data.items.map((r) => (
                      <TableRow key={r.paymentId}>
                        <TableCell>
                          <Link
                            href={`/payments/${r.paymentId}`}
                            className="font-mono font-semibold text-primary hover:underline text-xs"
                          >
                            {r.paymentId.slice(0, 12)}…
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/orders/${r.orderId}`}
                            className="font-mono font-medium text-foreground hover:text-primary hover:underline text-xs"
                          >
                            {r.orderId.slice(0, 12)}…
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal text-xs">
                            {paymentLabel(r.disposition)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <PaymentMoney value={r.received} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          <PaymentMoney value={r.unallocated} size="sm" className="text-amber-600 dark:text-amber-400" />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-semibold"
                            disabled={!view}
                            onClick={() => select(r.paymentId)}
                          >
                            Reconcile
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <EmptyState
            title="No receipt exceptions found"
            description="Overpayments, late payments received after order expiry, or unallocated funds will appear here for operational resolution."
          />
        )}

        {q.data ? (
          <PaymentPager page={page} total={q.data.pagination.totalItems} onPage={setPage} />
        ) : null}
      </PaymentQueryState>

      {/* Selected Reconciliation Workspace */}
      {selected ? (
        <div className="mt-4">
          <ReceiptWorkspace key={selected} paymentId={selected} />
        </div>
      ) : null}
    </div>
  );
}
