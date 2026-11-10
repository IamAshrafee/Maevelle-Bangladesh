'use client';

import { useState } from 'react';
import type { CheckoutOrderPaymentDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { reviewActions } from '../foundation-runtime';
import type { OrderPaymentProjection } from '../order-payment-types';

export function ManualClaimForm({
  projection,
}: {
  payment: CheckoutOrderPaymentDto;
  projection: OrderPaymentProjection;
}) {
  const [transactionId, setTransactionId] = useState('');
  const [sendingMobile, setSendingMobile] = useState('');
  const [validationError, setValidationError] = useState('');

  const isSubmitting = projection.phase === 'submitting';
  const pendingIntent = projection.pendingClaim;
  const issue = projection.issue;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError('');

    const trimmedTrx = transactionId.trim();
    if (!trimmedTrx) {
      setValidationError('Please enter your Transaction ID.');
      return;
    }

    if (!/^[A-Za-z0-9-]{4,128}$/.test(trimmedTrx)) {
      setValidationError(
        'Transaction ID must be 4 to 128 characters and contain only letters, numbers, and hyphens.',
      );
      return;
    }

    const trimmedMobile = sendingMobile.trim();
    if (trimmedMobile && !/^01[3-9][0-9]{8}$/.test(trimmedMobile)) {
      setValidationError(
        'Sending mobile number must be an 11-digit Bangladesh mobile number (e.g. 01712345678).',
      );
      return;
    }

    void reviewActions
      .orderPayment()
      .submit({
        transactionId: trimmedTrx,
        ...(trimmedMobile ? { sendingMobile: trimmedMobile } : {}),
      })
      .catch(() => undefined);
  }

  function handleRetry() {
    setValidationError('');
    void reviewActions
      .orderPayment()
      .retry()
      .catch(() => undefined);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-surface-container-low p-4 sm:p-5"
      aria-labelledby="manual-claim-heading"
    >
      <div>
        <h3 id="manual-claim-heading" className="font-serif text-lg font-semibold text-on-surface">
          Submit Transaction Reference
        </h3>
        <p className="text-xs text-on-surface-variant">
          Enter the transaction reference from your bKash or Nagad confirmation SMS.
        </p>
      </div>

      <div role="status" aria-live="polite" className="text-xs text-on-surface-variant">
        {isSubmitting ? 'Submitting payment claim for management review…' : ''}
      </div>

      {issue && (
        <Notice variant={issue.retryable ? 'warning' : 'danger'} title="Submission notice">
          {issue.message}
        </Notice>
      )}

      {validationError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {validationError}
        </p>
      )}

      {pendingIntent && issue?.retryable && (
        <div className="space-y-2 rounded-lg bg-surface-container p-3">
          <p className="text-xs text-on-surface-variant">
            A submission attempt was made with key{' '}
            <span className="font-mono text-on-surface">{pendingIntent.key.slice(0, 8)}…</span> but
            the outcome could not be verified. You can retry the same submission without creating a
            duplicate claim.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSubmitting}
            onClick={handleRetry}
          >
            Retry same submission
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label
            htmlFor="checkout-claim-txid"
            className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1"
          >
            Transaction ID (TrxID) <span className="text-destructive">*</span>
          </label>
          <Input
            id="checkout-claim-txid"
            name="transactionId"
            type="text"
            required
            disabled={isSubmitting}
            placeholder="e.g. BL9A2K9Z81"
            value={transactionId}
            onChange={(e) => {
              setTransactionId(e.target.value);
              if (validationError) setValidationError('');
            }}
            className="font-mono text-base"
            aria-describedby="checkout-claim-txid-hint"
          />
          <p id="checkout-claim-txid-hint" className="mt-1 text-xs text-on-surface-variant">
            Exact Transaction ID from your provider SMS or app receipt (case is preserved).
          </p>
        </div>

        <div>
          <label
            htmlFor="checkout-claim-mobile"
            className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1"
          >
            Sending Mobile Number{' '}
            <span className="text-xs font-normal text-on-surface-variant">(optional)</span>
          </label>
          <Input
            id="checkout-claim-mobile"
            name="sendingMobile"
            type="tel"
            inputMode="numeric"
            disabled={isSubmitting}
            placeholder="e.g. 01712345678"
            value={sendingMobile}
            onChange={(e) => {
              setSendingMobile(e.target.value);
              if (validationError) setValidationError('');
            }}
            className="font-mono text-base"
            aria-describedby="checkout-claim-mobile-hint"
          />
          <p id="checkout-claim-mobile-hint" className="mt-1 text-xs text-on-surface-variant">
            The mobile number used to send the payment (11 digits, starting with 01).
          </p>
        </div>
      </div>

      <Notice variant="neutral">
        Submitting this form requests management verification. Money is verified only after our team
        confirms receipt against provider records. Maevelle will never request your PIN or OTP.
      </Notice>

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || !transactionId.trim()}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? (
          <>
            <Spinner className="mr-2" size="sm" />
            <span>Submitting…</span>
          </>
        ) : (
          'Submit Transaction ID'
        )}
      </Button>
    </form>
  );
}
