'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export interface ReviewEligibilityCtaProps {
  readonly productId: string;
  readonly organizationId: string;
}

export function ReviewEligibilityCta({
  organizationId,
}: ReviewEligibilityCtaProps) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  return (
    <aside className="review-eligibility-banner" aria-label="Review authenticity information">
      <div className="eligibility-copy">
        <div className="eligibility-badge-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        </div>
        <div className="eligibility-text">
          <strong className="eligibility-heading">Authentic Verified Reviews</strong>
          <p className="eligibility-description">
            Maevelle reviews are collected exclusively from customers with verified purchases. When your order is delivered, you receive a secure link to share your experience.
          </p>
        </div>
      </div>

      {token ? (
        <div className="eligibility-action-slot">
          <Link
            href={`/reviews/submit?token=${encodeURIComponent(token)}&organizationId=${encodeURIComponent(organizationId)}`}
            className="write-review-cta-btn"
          >
            Write a Review
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
