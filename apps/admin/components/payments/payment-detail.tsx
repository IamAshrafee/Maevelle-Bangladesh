'use client';
import Link from 'next/link';
import type { PaymentDetailDto } from '@maevelle/contracts';
import { AdminPage, PageHeader, PagePanel } from '@/components/ui/page-shell';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import { PaymentMoney, PaymentNotice, PaymentQueryState } from './payment-ui';
import { ReceiptWorkspace } from './receipt-workspace';
import { CreateRefundAction, RefundOperations } from './refund-operations';
import { LegacyPosting } from './record-panels';
export function PaymentDetail({ paymentId }: { readonly paymentId: string }) {
  const allowed = usePaymentPermission('payments.view');
  const q = usePaymentQuery<PaymentDetailDto>(
    allowed ? `/admin/payments/${encodeURIComponent(paymentId)}` : null,
  );
  if (!allowed)
    return (
      <AdminPage>
        <PaymentNotice>Payment viewing permission is required.</PaymentNotice>
      </AdminPage>
    );
  const p = q.data;
  return (
    <AdminPage>
      <Link href="/payments?tab=payments" className="text-primary">
        Back to payments
      </Link>
      <PageHeader
        title="Payment record"
        description="Confirmed receipt, Order allocation, refunds and Finance postings remain separate facts."
      />
      <PaymentQueryState query={q}>
        {p ? (
          <>
            <PagePanel>
              <h2 className="font-mono tabular-nums">{p.paymentNumber}</h2>
              <Link href={`/orders/${p.orderId}`} className="text-primary font-mono tabular-nums">
                {p.orderNumber}
              </Link>
              <div className="my-4 grid gap-4 sm:grid-cols-3">
                <PaymentMoney value={p.amount} currency={p.currency} label="Originally received" />
                <PaymentMoney
                  value={p.order.outstanding}
                  currency={p.currency}
                  label="Order outstanding"
                />
                <PaymentMoney value={p.refunded} currency={p.currency} label="Completed refunds" />
              </div>
              <p className="break-all text-sm font-mono tabular-nums">
                Verified transaction reference: {p.externalReference}
              </p>
              <p>
                {p.method} · {p.status}
              </p>
              {p.financePosting ? (
                <p className="my-3 text-sm">
                  Finance posting already recorded in {p.financePosting.accountName}. Do not post
                  again.
                </p>
              ) : (
                <LegacyPosting
                  kind="payments"
                  id={p.id}
                  currency={p.currency}
                  onRefresh={q.refresh}
                />
              )}
              <CreateRefundAction payment={p} onRefresh={q.refresh} />
            </PagePanel>
            {p.method === 'COD' ? (
              <PaymentNotice>
                COD collection is distinct from courier remittance. Review custody and settlement in{' '}
                <Link href="/finance/cod-settlements" className="text-primary">
                  Finance COD settlements
                </Link>
                .
              </PaymentNotice>
            ) : (
              <ReceiptWorkspace paymentId={p.id} />
            )}
            {p.method === 'COD' ? (
              <PagePanel>
                <h3 className="font-semibold">Refund history</h3>
                {p.refunds.length ? (
                  p.refunds.map((r) => (
                    <div key={r.id} className="my-3 grid gap-2 border-t border-border pt-3">
                      <span className="font-mono tabular-nums">
                        {r.refundNumber} · {r.status}
                      </span>
                      <PaymentMoney value={r.amount} currency={r.currency} />
                      <RefundOperations refund={r} onRefresh={q.refresh} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No refund obligations.</p>
                )}
              </PagePanel>
            ) : null}
          </>
        ) : null}
      </PaymentQueryState>
    </AdminPage>
  );
}
