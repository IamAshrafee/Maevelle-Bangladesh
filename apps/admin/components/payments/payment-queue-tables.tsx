'use client';

import { Banknote, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import { formatFinanceDate, formatMoney } from '@/lib/finance/types';

import type { PaymentAttemptDto, PendingCodCollectionDto } from '@maevelle/contracts';

import { OperationalEmptyState } from '../operational-worklist';

interface VerificationQueueProps {
  readonly attempts: readonly PaymentAttemptDto[];
  readonly busy: boolean;
  readonly onDecision: (attempt: PaymentAttemptDto, mode: 'verify' | 'reject') => void;
}

export function VerificationQueue({ attempts, busy, onDecision }: VerificationQueueProps) {
  if (!attempts.length)
    return (
      <OperationalEmptyState
        title="Verification queue is clear"
        description="No matching manual payment submissions need a decision."
      />
    );

  return (
    <section className="panel worklist-panel">
      <div className="data-table-shell">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Method</th>
              <th>Expected</th>
              <th>Claimed</th>
              <th>Customer reference</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt) => (
              <tr key={attempt.id}>
                <td>
                  <strong>{attempt.orderNumber}</strong>
                </td>
                <td>{attempt.methodName}</td>
                <td className="numeric">{formatMoney(attempt.expectedAmount)}</td>
                <td className="numeric">
                  {attempt.claimedAmount ? formatMoney(attempt.claimedAmount) : '—'}
                </td>
                <td>{attempt.customerReference}</td>
                <td>
                  <time dateTime={attempt.submittedAt}>
                    {formatFinanceDate(attempt.submittedAt, true)}
                  </time>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      disabled={busy}
                      onClick={() => onDecision(attempt, 'verify')}
                      type="button"
                    >
                      <CheckCircle2 aria-hidden="true" /> Verify
                    </button>
                    <button
                      className="danger-action"
                      disabled={busy}
                      onClick={() => onDecision(attempt, 'reject')}
                      type="button"
                    >
                      Reject
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

interface CodCollectionQueueProps {
  readonly collections: readonly PendingCodCollectionDto[];
  readonly busy: boolean;
  readonly onCollect: (collection: PendingCodCollectionDto) => void;
}

export function CodCollectionQueue({ collections, busy, onCollect }: CodCollectionQueueProps) {
  if (!collections.length)
    return (
      <OperationalEmptyState
        title="No delivered COD awaiting collection"
        description="Delivered COD parcels appear here until the collected amount and courier reference are recorded."
      />
    );

  return (
    <section className="panel worklist-panel">
      <div className="data-table-shell">
        <table>
          <thead>
            <tr>
              <th>Delivery</th>
              <th>Order</th>
              <th>Expected here</th>
              <th>Order outstanding</th>
              <th>Courier / tracking</th>
              <th>Delivered</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((item) => (
              <tr key={item.deliveryId}>
                <td>
                  <strong>{item.deliveryNumber}</strong>
                </td>
                <td>
                  <Link className="text-primary hover:underline" href={`/orders/${item.orderId}`}>
                    {item.orderNumber}
                  </Link>
                </td>
                <td className="numeric">
                  <strong>{formatMoney(item.expectedAmount, item.currency)}</strong>
                </td>
                <td className="numeric">{formatMoney(item.outstandingAmount, item.currency)}</td>
                <td>
                  {item.carrierName ?? 'Manual delivery'}
                  <span className="cell-secondary">
                    {item.trackingReference ?? 'No tracking reference'}
                  </span>
                </td>
                <td>
                  <time dateTime={item.deliveredAt}>
                    {formatFinanceDate(item.deliveredAt, true)}
                  </time>
                </td>
                <td>
                  <button disabled={busy} onClick={() => onCollect(item)} type="button">
                    <Banknote aria-hidden="true" /> Record collection
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
