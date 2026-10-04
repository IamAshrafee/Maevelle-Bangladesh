'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { ApiEnvelope, ReviewEligibilityDto } from '@maevelle/contracts';
import { ReviewForm } from '@/components/reviews/review-form';

export default function SubmitReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="review-submit-page">
          <div className="review-loading-shell">
            <div className="mini-spinner" />
            <p>Loading secure review details…</p>
          </div>
        </main>
      }
    >
      <ReviewSubmitContent />
    </Suspense>
  );
}

function ReviewSubmitContent() {
  const searchParams = useSearchParams();
  const organizationId = searchParams.get('organizationId');
  const token = searchParams.get('token');

  const [eligibility, setEligibility] = useState<ReviewEligibilityDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!organizationId || !token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function checkEligibility() {
      try {
        setLoading(true);
        setErrorReason(null);

        const query = new URLSearchParams({
          organizationId: organizationId!,
          accessToken: token!,
        });

        const res = await fetch(`/api/reviews/eligibility?${query}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const errPayload = await res.json().catch(() => undefined);
          setErrorReason(errPayload?.error?.code ?? 'INVALID_TOKEN');
          return;
        }

        const json = (await res.json()) as ApiEnvelope<ReviewEligibilityDto>;
        setEligibility(json.data);

        if (!json.data.eligible) {
          setErrorReason(json.data.reason ?? 'NOT_ELIGIBLE');
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setErrorReason('NETWORK_ERROR');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void checkEligibility();
    return () => controller.abort();
  }, [organizationId, token]);

  // Case 1: Missing URL parameters
  if (!organizationId || !token) {
    return (
      <main className="review-submit-page">
        <div className="review-state-card error-card">
          <div className="state-card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1>Review link unavailable</h1>
          <p>
            This review invitation link is incomplete or missing its secure access token.
            Please verify the link sent in your delivery notification email or SMS.
          </p>
          <div className="state-card-actions">
            <Link href="/" className="state-action-btn primary">
              Return to Storefront
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Case 2: Loading eligibility verification
  if (loading) {
    return (
      <main className="review-submit-page">
        <div className="review-loading-shell">
          <div className="mini-spinner" />
          <p>Verifying review authorization…</p>
        </div>
      </main>
    );
  }

  // Case 3: Customer already reviewed this product
  if (errorReason === 'ALREADY_REVIEWED' || eligibility?.reason === 'ALREADY_REVIEWED') {
    return (
      <main className="review-submit-page">
        {!editMode ? (
          <div className="review-state-card info-card">
            <div className="state-card-icon success">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="state-eyebrow">Verified Purchase</span>
            <h1>You have already reviewed this product</h1>
            <p>
              Thank you for sharing your experience! We have your active review on record for{' '}
              <strong>{eligibility?.productTitle ?? 'this item'}</strong>.
            </p>
            {eligibility?.variantLabel ? (
              <p className="state-variant-note">
                Purchased: <strong>{eligibility.variantLabel}</strong>
              </p>
            ) : null}
            <div className="state-card-actions">
              <button
                type="button"
                className="state-action-btn primary"
                onClick={() => setEditMode(true)}
              >
                Edit Your Review
              </button>
              <Link href="/" className="state-action-btn secondary">
                Continue Shopping
              </Link>
            </div>
          </div>
        ) : (
          <div className="review-form-wrapper">
            <div className="edit-mode-topbar">
              <button
                type="button"
                className="back-to-status-btn"
                onClick={() => setEditMode(false)}
              >
                ← Back
              </button>
            </div>
            <ReviewForm
              organizationId={organizationId}
              accessToken={token}
              eligibility={eligibility!}
              mode="edit"
              existingReviewId={eligibility?.existingReviewId}
              onSuccess={() => setEditMode(false)}
              onWithdrawn={() => {
                setEligibility(null);
                setErrorReason('WITHDRAWN');
                setEditMode(false);
              }}
            />
          </div>
        )}
      </main>
    );
  }

  // Case 4: Other eligibility failures (Expired, Revoked, Not Delivered, etc.)
  if (errorReason) {
    const errorMap: Record<string, { title: string; description: string }> = {
      EXPIRED_TOKEN: {
        title: 'Review link expired',
        description:
          'This post-delivery review invitation has expired. Review invitations remain valid for 30 days after delivery.',
      },
      REVOKED_TOKEN: {
        title: 'Review link revoked',
        description:
          'This review invitation is no longer active. If you need assistance, please contact Maevelle customer support.',
      },
      NOT_DELIVERED: {
        title: 'Order is awaiting delivery',
        description:
          'Reviews can be submitted once your order has been successfully delivered by our courier partner.',
      },
      ORDER_CANCELLED: {
        title: 'Order was cancelled',
        description:
          'This order was cancelled before fulfillment, so it is not eligible for a product review.',
      },
      WITHDRAWN: {
        title: 'Review removed',
        description: 'Your review has been successfully removed.',
      },
      INVALID_TOKEN: {
        title: 'Invalid review link',
        description:
          'We could not verify this review invitation link. Please check your notification message for the correct link.',
      },
      NETWORK_ERROR: {
        title: 'Connection error',
        description:
          'Could not reach the Maevelle verification service. Please check your internet connection and try again.',
      },
    };

    const info = errorMap[errorReason] ?? {
      title: 'Review not available',
      description: 'You are not currently eligible to submit a review for this purchase.',
    };

    return (
      <main className="review-submit-page">
        <div className="review-state-card error-card">
          <div className="state-card-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1>{info.title}</h1>
          <p>{info.description}</p>
          <div className="state-card-actions">
            <Link href="/" className="state-action-btn primary">
              Browse Maevelle
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Case 5: Eligible customer review form
  if (!eligibility || !eligibility.eligible) {
    return null;
  }

  return (
    <main className="review-submit-page">
      <div className="review-form-wrapper">
        <ReviewForm
          organizationId={organizationId}
          accessToken={token}
          eligibility={eligibility}
          mode="create"
        />
      </div>
    </main>
  );
}
