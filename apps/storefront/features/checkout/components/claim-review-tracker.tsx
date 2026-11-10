'use client';

import type { CheckoutOrderPaymentDto, CheckoutPaymentClaimDto } from '@maevelle/contracts';
import { Notice } from '@/components/ui/notice';
import {
  claimReviewStateLabel,
  claimStatusLabel,
  formatDhakaDateTime,
} from '../order-payment-labels';

function ClaimCard({ claim }: { claim: CheckoutPaymentClaimDto }) {
  const isVerified = claim.status === 'VERIFIED';
  const isRejected = claim.status === 'REJECTED';

  const statusVariantClass = isVerified
    ? 'bg-success/10 text-success border-success/30'
    : isRejected
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : 'bg-warning/10 text-warning border-warning/30';

  const reviewStateVariantClass =
    claim.reviewState === 'CORRECTION_REQUESTED'
      ? 'bg-destructive/10 text-destructive'
      : claim.reviewState === 'UNDER_REVIEW' || claim.reviewState === 'ESCALATED'
        ? 'bg-primary/10 text-primary'
        : claim.reviewState === 'RESOLVED'
          ? 'bg-success/10 text-success'
          : 'bg-surface-container text-on-surface-variant';

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-container p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Claim Reference
          </span>
          <p className="font-mono text-sm font-semibold text-on-surface">
            {claim.id.slice(0, 8)}…{claim.id.slice(-4)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusVariantClass}`}
          >
            {claimStatusLabel[claim.status]}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${reviewStateVariantClass}`}
          >
            {claimReviewStateLabel[claim.reviewState]}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-on-surface-variant">
        <span>
          Submitted: <strong>{formatDhakaDateTime(claim.submittedAt)}</strong> (BD Time)
        </span>
      </div>

      {claim.reviewState === 'CORRECTION_REQUESTED' && (
        <Notice variant="warning">
          <strong>Correction requested:</strong> Our management team was unable to verify this
          transaction. Please verify the transaction reference on your SMS receipt and submit a
          corrected Transaction ID or contact support.
        </Notice>
      )}

      {claim.reviewState === 'UNDER_REVIEW' && (
        <p className="text-xs text-on-surface-variant">
          Our finance team is currently reviewing provider statements for this transfer.
        </p>
      )}

      {claim.reviewState === 'ESCALATED' && (
        <p className="text-xs text-on-surface-variant">
          This payment claim is under senior staff review for reconciliation.
        </p>
      )}
    </div>
  );
}

export function ClaimReviewTracker({ payment }: { payment: CheckoutOrderPaymentDto }) {
  const claims =
    payment.openClaims.length > 0
      ? payment.openClaims
      : payment.latestClaim
        ? [payment.latestClaim]
        : [];

  if (claims.length === 0) return null;

  const reviewDeadline = formatDhakaDateTime(payment.reviewDeadline);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-container-low p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-on-surface">
            Submitted Payment Claims
          </h3>
          <p className="text-xs text-on-surface-variant">
            Tracking your submitted transaction references.
          </p>
        </div>
        {reviewDeadline && (
          <span className="text-xs text-on-surface-variant">
            Review expected by: <strong className="text-on-surface">{reviewDeadline}</strong>
          </span>
        )}
      </div>

      <div className="space-y-3">
        {claims.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </div>

      <p className="text-xs text-on-surface-variant">
        You do not need to keep this page open while your claim is under review. You can check your
        order status anytime with your authorized session.
      </p>
    </div>
  );
}
