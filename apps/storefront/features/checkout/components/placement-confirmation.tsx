'use client';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Money } from '@/components/commerce/price';
import { reviewActions } from '../foundation-runtime';
import type { ReviewSnapshot } from '../foundation-types';
import { orderStatusLabel, paymentStatusLabel } from '../placement-labels';
import { placementBusy } from '../placement-types';
import { FinalTermsSummary } from './final-terms-summary';
import { OrderPaymentPanel } from './order-payment-panel';

export function PlacementConfirmation({
  review,
  clock,
}: {
  review: ReviewSnapshot;
  clock: number;
}) {
  const p = review.placement;
  const heading = useRef<HTMLHeadingElement>(null);
  const orderId = p.receipt?.orderId;
  useEffect(() => {
    heading.current?.focus();
  }, [orderId]);
  const actions = reviewActions.placement();
  const shouldRestore =
    !review.suspended &&
    review.phase === 'ready' &&
    p.phase === 'idle' &&
    !p.pending &&
    (review.draft?.status === 'COMMITTED' || p.committedConflict);
  useEffect(() => {
    if (shouldRestore) void actions.status().catch(() => undefined);
  }, [shouldRestore, actions]);
  const busy = placementBusy(p);
  const cooldown = clock < (p.issue?.retryAt ?? 0);
  const status = p.status,
    receipt = p.receipt;
  const codDue =
    status?.receipt.terms.method === 'COD' &&
    status.status !== 'CANCELLED' &&
    (status.payment.status === 'UNPAID' || status.payment.status === 'PARTIALLY_PAID') &&
    status.payment.outstanding !== '0.0000';

  return (
    <section
      aria-labelledby="checkout-order-heading"
      className="mx-auto grid w-full max-w-2xl gap-4 rounded-2xl border border-border bg-surface-container-lowest p-4 sm:p-6"
    >
      <h2
        id="checkout-order-heading"
        ref={heading}
        tabIndex={-1}
        className="scroll-mt-28 font-serif text-2xl font-semibold"
      >
        {receipt ? 'Order placed' : 'Check your order'}
      </h2>
      <div role="status" aria-live="polite" className="text-sm">
        {p.phase === 'placing'
          ? 'Placing your order…'
          : p.phase === 'status'
            ? 'Checking order status…'
            : (p.issue?.message ?? '')}
      </div>
      {p.pending && p.phase !== 'placing' && (
        <Notice variant="warning">
          Your order may already have been placed. Keep this tab open to retry the original request.
          Do not start another order for this selection while its status is uncertain.
        </Notice>
      )}
      {!receipt && !p.pending && p.committedConflict && (
        <p className="text-sm text-on-surface-variant">
          This tab cannot resend the original request. You can check for an order with your current
          session. Guests need the original session and its order access cookie.
        </p>
      )}
      {receipt && (
        <>
          <p className="break-words font-semibold" translate="no">
            Order {receipt.orderNumber}
          </p>
          <FinalTermsSummary terms={receipt.terms} committed />
          {status ? (
            <dl
              className="grid min-w-0 grid-cols-2 gap-3 border-t border-border-subtle pt-4 text-sm"
              aria-live="polite"
            >
              <dt>Order status</dt>
              <dd className="text-right font-semibold">{orderStatusLabel[status.status]}</dd>
              <dt>Payment status</dt>
              <dd className="text-right font-semibold">
                {paymentStatusLabel(status.payment.status)}
              </dd>
              {status.payment.collected !== undefined && (
                <>
                  <dt>Actual funds received</dt>
                  <dd className="text-right">
                    <Money amount={status.payment.collected} />
                  </dd>
                </>
              )}
              {status.payment.authorizedWaiver !== undefined && (
                <>
                  <dt>Authorized cash adjustment</dt>
                  <dd className="text-right">
                    <Money amount={status.payment.authorizedWaiver} />
                  </dd>
                </>
              )}
              {status.payment.settlementStatus && (
                <>
                  <dt>Settlement</dt>
                  <dd className="text-right">
                    {status.payment.settlementStatus === 'SETTLED_WITH_ADJUSTMENT'
                      ? 'Settled with adjustment'
                      : status.payment.settlementStatus === 'SETTLED_BY_RECEIPTS'
                        ? 'Settled by receipts'
                        : 'Open balance'}
                  </dd>
                </>
              )}
              <dt>{codDue ? 'Due on delivery' : 'Reported outstanding balance'}</dt>
              <dd className="min-w-0 break-all text-right font-semibold">
                <Money amount={status.payment.outstanding} />
              </dd>
            </dl>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Current payment status is not available yet.
            </p>
          )}
          <OrderPaymentPanel review={review} clock={clock} />
        </>
      )}
      <div className="flex flex-wrap gap-3">
        {p.pending && (
          <Button
            size="lg"
            disabled={busy || cooldown}
            onClick={() => void actions.retry().catch(() => undefined)}
          >
            Retry original request
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          disabled={busy || cooldown}
          onClick={() => void actions.status().catch(() => undefined)}
        >
          Check order status
        </Button>
      </div>
    </section>
  );
}
