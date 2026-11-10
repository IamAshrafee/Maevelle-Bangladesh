'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { RefreshCwIcon } from '@/components/ui/icons';
import { reviewActions } from '../foundation-runtime';
import type { ReviewSnapshot } from '../foundation-types';
import { orderPaymentBusy } from '../order-payment-types';
import { CodPaymentSummary } from './cod-payment-summary';
import { OrderPaymentSummary } from './order-payment-summary';
import { WalletInstructionsCard } from './wallet-instructions-card';
import { ManualClaimForm } from './manual-claim-form';
import { ClaimReviewTracker } from './claim-review-tracker';

export function OrderPaymentPanel({ review, clock }: { review: ReviewSnapshot; clock: number }) {
  const op = review.orderPayment;
  const p = review.placement;
  const committed =
    review.draft?.status === 'COMMITTED' ||
    Boolean(p.receipt) ||
    Boolean(p.status) ||
    p.committedConflict;

  const shouldFetch =
    !review.suspended && review.phase === 'ready' && op.phase === 'idle' && !op.data && committed;

  useEffect(() => {
    if (shouldFetch) {
      void reviewActions
        .orderPayment()
        .read()
        .catch(() => undefined);
    }
  }, [shouldFetch]);

  const busy = orderPaymentBusy(op);
  const payment = op.data;
  const issue = op.issue;
  const cooldown = clock < (issue?.retryAt ?? 0);

  function handleRefresh() {
    void reviewActions
      .orderPayment()
      .read()
      .catch(() => undefined);
  }

  return (
    <section
      aria-labelledby="checkout-payment-details-heading"
      className="space-y-5 rounded-2xl border border-border bg-surface-container-lowest p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id="checkout-payment-details-heading"
          className="font-serif text-xl font-semibold text-on-surface"
        >
          Payment & Instructions
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || cooldown}
          onClick={handleRefresh}
          className="min-h-9 text-xs"
        >
          <RefreshCwIcon className={`mr-1.5 ${busy ? 'animate-spin' : ''}`} size={14} />
          <span>{busy ? 'Checking…' : 'Refresh payment status'}</span>
        </Button>
      </div>

      <div role="status" aria-live="polite" className="text-xs text-on-surface-variant">
        {op.phase === 'loading'
          ? 'Loading payment details…'
          : op.phase === 'submitting'
            ? 'Submitting transaction reference…'
            : op.phase === 'recovering'
              ? 'Checking submitted claim…'
              : ''}
      </div>

      {issue && op.phase === 'error' && (
        <Notice
          variant={issue.code === 'ORDER_GRANT_EXPIRED' ? 'neutral' : 'warning'}
          title="Payment notice"
        >
          {issue.message}
          {issue.retryable && (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || cooldown}
                onClick={handleRefresh}
              >
                Try again
              </Button>
            </div>
          )}
        </Notice>
      )}

      {payment && payment.method === 'COD' && <CodPaymentSummary payment={payment} />}

      {payment && payment.method !== 'COD' && (
        <div className="space-y-5">
          <OrderPaymentSummary payment={payment} />
          <WalletInstructionsCard payment={payment} />
          {payment.claimAvailability === 'AVAILABLE' && (
            <ManualClaimForm payment={payment} projection={op} />
          )}
          <ClaimReviewTracker payment={payment} />
        </div>
      )}

      {!payment && op.phase === 'idle' && !issue && (
        <p className="text-xs text-on-surface-variant">
          Payment details will appear once your order status is loaded.
        </p>
      )}
    </section>
  );
}
