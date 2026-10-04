'use client';

import type { ProductRatingSummaryDto } from '@maevelle/contracts';
import { StarRating } from './star-rating';

export interface ProductRatingSummaryProps {
  readonly summary?: ProductRatingSummaryDto | null | undefined;
  readonly selectedRating?: number | null | undefined;
  readonly onSelectRating?: ((rating: number | null) => void) | undefined;
}

export function ProductRatingSummary({
  summary,
  selectedRating,
  onSelectRating,
}: ProductRatingSummaryProps) {
  if (!summary || summary.ratingCount === 0) {
    return (
      <div className="product-rating-summary-empty">
        <div className="empty-rating-content">
          <StarRating value={0} size="md" />
          <p className="empty-rating-title">No reviews yet</p>
          <p className="empty-rating-subtitle">
            Be the first verified buyer to share your feedback about this product.
          </p>
        </div>
      </div>
    );
  }

  const average = Number(summary.formattedAverage ?? summary.averageRating ?? 0);
  const total = summary.ratingCount;
  const verifiedCount = summary.verifiedReviewCount ?? 0;

  const starTiers: readonly {
    tier: number;
    count: number;
    percentage: number;
  }[] = [
    {
      tier: 5,
      count: summary.rating5Count,
      percentage: summary.distributionPercentages?.star5 ?? Math.round((summary.rating5Count / total) * 100),
    },
    {
      tier: 4,
      count: summary.rating4Count,
      percentage: summary.distributionPercentages?.star4 ?? Math.round((summary.rating4Count / total) * 100),
    },
    {
      tier: 3,
      count: summary.rating3Count,
      percentage: summary.distributionPercentages?.star3 ?? Math.round((summary.rating3Count / total) * 100),
    },
    {
      tier: 2,
      count: summary.rating2Count,
      percentage: summary.distributionPercentages?.star2 ?? Math.round((summary.rating2Count / total) * 100),
    },
    {
      tier: 1,
      count: summary.rating1Count,
      percentage: summary.distributionPercentages?.star1 ?? Math.round((summary.rating1Count / total) * 100),
    },
  ];

  return (
    <div className="product-rating-summary-container">
      {/* Primary Score Column */}
      <div className="rating-overview-card">
        <div className="rating-big-score" aria-label={`Average rating ${average.toFixed(1)} out of 5 stars`}>
          <span className="score-num">{average.toFixed(1)}</span>
          <span className="score-max">/ 5</span>
        </div>

        <div className="rating-overview-stars">
          <StarRating value={average} size="lg" />
        </div>

        <p className="rating-counts-meta">
          Based on <strong>{total}</strong> {total === 1 ? 'review' : 'reviews'}
          {verifiedCount > 0 ? (
            <span className="verified-badge-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {verifiedCount} verified
            </span>
          ) : null}
        </p>

        {summary.mediaReviewCount > 0 ? (
          <p className="rating-sub-stats">
            Includes <strong>{summary.mediaReviewCount}</strong> with customer photos
          </p>
        ) : null}
      </div>

      {/* Star Distribution Breakdown Column */}
      <div className="rating-distribution-breakdown" aria-label="Rating distribution breakdown">
        <div className="distribution-header">
          <span className="distribution-title">Rating distribution</span>
          {selectedRating ? (
            <button
              type="button"
              className="clear-star-filter-btn"
              onClick={() => onSelectRating?.(null)}
            >
              Clear filter ({selectedRating}★)
            </button>
          ) : (
            <span className="distribution-hint">Click a bar to filter reviews</span>
          )}
        </div>

        <div className="distribution-bars-list">
          {starTiers.map(({ tier, count, percentage }) => {
            const isSelected = selectedRating === tier;
            const isSelectable = onSelectRating && count > 0;

            return (
              <button
                type="button"
                key={tier}
                disabled={!isSelectable}
                onClick={() => onSelectRating?.(isSelected ? null : tier)}
                className={`distribution-row ${isSelected ? 'is-active' : ''} ${isSelectable ? 'is-clickable' : ''}`}
                aria-pressed={isSelected}
                aria-label={`Filter by ${tier} stars: ${count} reviews (${percentage}%)`}
              >
                <span className="tier-label">
                  <span>{tier}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#eab308" stroke="#ca8a04" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>

                <div className="distribution-bar-track">
                  <div
                    className="distribution-bar-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <span className="tier-count tabular-nums">
                  {count} <span className="tier-pct">({percentage}%)</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
