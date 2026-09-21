'use client';

import { CheckCircle2, Landmark, RotateCcw } from 'lucide-react';
import Link from 'next/link';

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
  if (!payments.length)
    return (
      <OperationalEmptyState
        title="No collected payments"
        description="No Payment records match the current filters."
      />
    );

  return (
    <section className="panel worklist-panel">
      <div className="data-table-shell">
        <table>
          <thead>
            <tr>
              <th>Payment</th>
              <th>Order</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Refunded</th>
              <th>Net</th>
              <th>Received into</th>
              <th>Reference</th>
              <th>Received</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>
                  <Link
                    className="font-semibold text-primary hover:underline"
                    href={`/payments/${payment.id}`}
                  >
                    {payment.paymentNumber}
                  </Link>
                </td>
                <td>
                  <Link
                    className="text-primary hover:underline"
                    href={`/orders/${payment.orderId}`}
                  >
                    {payment.orderNumber}
                  </Link>
                </td>
                <td>{humanizeFinanceCode(payment.method)}</td>
                <td className="numeric">{formatMoney(payment.amount, payment.currency)}</td>
                <td className="numeric">{formatMoney(payment.refunded, payment.currency)}</td>
                <td className="numeric">
                  <strong>{formatMoney(payment.net, payment.currency)}</strong>
                </td>
                <td>
                  {payment.financePosting ? (
                    <span>
                      {payment.financePosting.accountName}
                      <span className="cell-secondary">
                        {payment.financePosting.transactionNumber}
                      </span>
                    </span>
                  ) : (
                    <StatusBadge status="NOT_POSTED" />
                  )}
                </td>
                <td>{payment.externalReference}</td>
                <td>
                  <time dateTime={payment.confirmedAt}>
                    {formatFinanceDate(payment.confirmedAt)}
                  </time>
                </td>
                <td>
                  <div className="row-actions">
                    <Link href={`/payments/${payment.id}`}>View details</Link>
                    {!payment.financePosting && canPostFinance ? (
                      <button
                        disabled={busy || !hasAccounts}
                        onClick={() => onPost(payment)}
                        type="button"
                      >
                        <Landmark aria-hidden="true" /> Receive into account
                      </button>
                    ) : null}
                    <button
                      disabled={busy || Number(payment.net) <= 0}
                      onClick={() => onRefund(payment)}
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" /> Refund
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
  if (!refunds.length)
    return (
      <OperationalEmptyState
        title="No refunds"
        description="No Refund records match the current filters."
      />
    );

  return (
    <section className="panel worklist-panel">
      <div className="data-table-shell">
        <table>
          <thead>
            <tr>
              <th>Refund</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Order / payment</th>
              <th>Paid from</th>
              <th>Reason</th>
              <th>Reference</th>
              <th>Requested</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((refund) => (
              <tr key={refund.id}>
                <td>
                  <strong>{refund.refundNumber}</strong>
                  <span className="cell-secondary">Payment {refund.paymentNumber}</span>
                </td>
                <td className="numeric">{formatMoney(refund.amount, refund.currency)}</td>
                <td>
                  <StatusBadge status={refund.status} />
                </td>
                <td>
                  <Link className="text-primary hover:underline" href={`/orders/${refund.orderId}`}>
                    {refund.orderNumber}
                  </Link>
                  <span className="cell-secondary">{refund.paymentNumber}</span>
                </td>
                <td>
                  {refund.financePosting ? (
                    <span>
                      {refund.financePosting.accountName}
                      <span className="cell-secondary">
                        {refund.financePosting.transactionNumber}
                      </span>
                    </span>
                  ) : refund.status === 'COMPLETED' ? (
                    <StatusBadge status="NOT_POSTED" />
                  ) : (
                    '—'
                  )}
                </td>
                <td>{humanizeFinanceCode(refund.reasonCode)}</td>
                <td>{refund.externalReference ?? 'Awaiting completion'}</td>
                <td>
                  <time dateTime={refund.requestedAt}>{formatFinanceDate(refund.requestedAt)}</time>
                </td>
                <td>
                  {['REQUESTED', 'PROCESSING'].includes(refund.status) ? (
                    <button disabled={busy} onClick={() => onComplete(refund)} type="button">
                      <CheckCircle2 aria-hidden="true" /> Complete refund
                    </button>
                  ) : refund.status === 'COMPLETED' && !refund.financePosting && canPostFinance ? (
                    <button
                      disabled={busy || !hasAccounts}
                      onClick={() => onPost(refund)}
                      type="button"
                    >
                      <Landmark aria-hidden="true" /> Record account
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
