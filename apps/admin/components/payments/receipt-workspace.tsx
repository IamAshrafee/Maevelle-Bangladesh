'use client';
import { useState } from 'react';
import Link from 'next/link';
import type {
  VerifiedReceiptDto,
  PaymentDetailDto,
  PaymentPageDto,
  PaymentExceptionDto,
} from '@maevelle/contracts';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { useAdminContext } from '../admin-capabilities';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
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
  const q = usePaymentQuery<VerifiedReceiptDto>(`/admin/payments/${paymentId}/receipt`),
    detail = usePaymentQuery<PaymentDetailDto>(`/admin/payments/${paymentId}`);
  const actor = useAdminContext(),
    correct = usePaymentPermission('payments.correct'),
    [reverse, setReverse] = useState(false);
  const r = q.data;
  const refundBlocksReversal = Boolean(
    detail.data?.refunds.some((refund) =>
      ['REQUESTED', 'PROCESSING', 'UNKNOWN_EXTERNAL_OUTCOME', 'COMPLETED'].includes(refund.status),
    ),
  );
  return (
    <PagePanel>
      <h3 className="font-semibold">Verified receipt and reconciliation</h3>
      <PaymentQueryState query={q}>
        {r ? (
          <>
            {detail.data ? (
              <p className="break-all text-sm font-mono tabular-nums">
                Independently recorded transfer: {detail.data.externalReference}
              </p>
            ) : null}
            <StatusBadge status={r.reversed ? 'REVERSED' : r.disposition} />
            <div className="my-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <PaymentMoney value={r.received} label="Actual received" />
              <PaymentMoney value={r.allocated} label="Original allocation" />
              <PaymentMoney value={r.unallocated} label="Original unallocated" />
              <PaymentMoney value={r.remainingUnallocated} label="Current remaining liability" />
            </div>
            {detail.data ? (
              <PaymentMoney
                value={detail.data.order.outstanding}
                currency={detail.data.currency}
                label="Current Order outstanding"
              />
            ) : null}
            {r.disposition === 'LATE_RECEIPT_LIABILITY' ? (
              <PaymentNotice>
                Late funds were retained for reconciliation. This did not reopen the Order or
                allocate stock.
              </PaymentNotice>
            ) : null}
            <Link href={`/orders/${r.orderId}`} className="text-sm text-primary">
              View originating Order
            </Link>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.data ? (
                <CreateRefundAction
                  payment={detail.data}
                  onRefresh={() => {
                    detail.refresh();
                    q.refresh();
                  }}
                />
              ) : null}
              {correct && !r.reversed ? (
                <Button
                  variant="destructive"
                  disabled={r.verifiedBy === actor.actorId || !detail.data || refundBlocksReversal}
                  onClick={() => setReverse(true)}
                >
                  Record evidenced receipt reversal
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  q.refresh();
                  detail.refresh();
                }}
              >
                Refresh reconciliation
              </Button>
            </div>
            {refundBlocksReversal ? (
              <PaymentNotice>
                Existing refund obligations block reversal. Reconcile their financial history before
                any correction.
              </PaymentNotice>
            ) : null}
            {r.verifiedBy === actor.actorId ? (
              <p className="mt-2 text-sm text-muted-foreground">
                A different authorized operator must correct this receipt.
              </p>
            ) : null}
          </>
        ) : null}
      </PaymentQueryState>
      {detail.data?.refunds.map((refund) => (
        <div key={refund.id} className="mt-4 grid gap-3 border-t border-border pt-4">
          <span className="font-mono tabular-nums">{refund.refundNumber}</span>
          <PaymentMoney value={refund.amount} />
          <StatusBadge status={refund.status} />
          <RefundOperations
            refund={refund}
            onRefresh={() => {
              q.refresh();
              detail.refresh();
            }}
          />
        </div>
      ))}
      {reverse ? (
        <PaymentCommand
          title="Record independent receipt reversal"
          path={`/admin/payments/${paymentId}/reversal`}
          consequence="This records a compensating Finance adjustment. It never deletes transfer history, reverses stock or reopens an Order. Pending or completed refunds block reversal until reconciled."
          onClose={() => setReverse(false)}
          onSuccess={() => {
            setReverse(false);
            q.refresh();
            detail.refresh();
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
      ) : null}
    </PagePanel>
  );
}
export function ReceiptExceptions() {
  const allowed = usePaymentPermission('payments.review'),
    view = usePaymentPermission('payments.view');
  const [page, setPage] = useState(1),
    [selected, select] = useState<string>();
  const q = usePaymentQuery<PaymentPageDto<PaymentExceptionDto>>(
    allowed ? `/admin/payments/receipt-exceptions?page=${page}` : null,
  );
  if (!allowed) return <PaymentNotice>Payment review permission is required.</PaymentNotice>;
  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">Financial exceptions</h2>
      <PaymentNotice>
        These are historical excess, late and reversed receipts. Open reconciliation for the current
        liability after refunds; original excess is not necessarily still owed.
      </PaymentNotice>
      <Button variant="outline" className="w-fit" onClick={q.refresh}>
        Refresh exceptions
      </Button>
      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          q.data.items.map((r) => (
            <PagePanel key={r.paymentId}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{paymentLabel(r.disposition)}</span>
                <PaymentMoney value={r.received} label="Received" />
                <PaymentMoney value={r.unallocated} label="Original unallocated" />
                <StatusBadge status={r.status} />
                <Button variant="outline" disabled={!view} onClick={() => select(r.paymentId)}>
                  Open reconciliation
                </Button>
              </div>
            </PagePanel>
          ))
        ) : (
          <EmptyState title="No receipt exceptions" />
        )}
        {q.data ? (
          <PaymentPager page={page} total={q.data.pagination.totalItems} onPage={setPage} />
        ) : null}
      </PaymentQueryState>
      {selected ? <ReceiptWorkspace key={selected} paymentId={selected} /> : null}
    </div>
  );
}
