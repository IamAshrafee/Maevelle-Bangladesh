'use client';

import { useState } from 'react';
import type { PublicReviewDto, ReviewMediaItemDto } from '@maevelle/contracts';
import { StarRating } from './star-rating';

export interface ReviewCardProps {
  readonly review: PublicReviewDto;
  readonly onOpenMedia?: (mediaIndex: number, review: PublicReviewDto) => void;
}

export function ReviewCard({ review, onOpenMedia }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyText = review.body ?? '';
  const isLong = bodyText.length > 280;
  const displayText = isLong && !expanded ? `${bodyText.slice(0, 280)}…` : bodyText;

  const formattedDate = new Intl.DateTimeFormat('en-BD', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(review.submittedAt));

  return (
    <article className="storefront-review-card" aria-label={`Review by ${review.publicDisplayName}`}>
      {/* Header: Rating & Verified Purchase */}
      <div className="review-card-top-row">
        <div className="review-rating-block">
          <StarRating value={review.rating} size="sm" />
          <span className="rating-verbal-score">{review.rating} out of 5</span>
        </div>

        {review.verifiedPurchase ? (
          <span className="verified-purchase-badge" title="Verified buyer who purchased this product">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Verified Purchase
          </span>
        ) : null}
      </div>

      {/* Review Title */}
      {review.title ? (
        <h3 className="review-card-title">{review.title}</h3>
      ) : null}

      {/* Purchased Variant Context */}
      {review.purchasedVariant?.label ? (
        <p className="review-variant-context">
          <span className="variant-label-prefix">Purchased:</span>{' '}
          <strong className="variant-label-value">{review.purchasedVariant.label}</strong>
        </p>
      ) : null}

      {/* Written Feedback */}
      {bodyText ? (
        <div className="review-card-body">
          <p>{displayText}</p>
          {isLong ? (
            <button
              type="button"
              className="review-expand-btn"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Attached Customer Photos & Videos */}
      {review.media && review.media.length > 0 ? (
        <div className="review-media-strip" aria-label="Customer attached photos and videos">
          {review.media.map((mediaItem: ReviewMediaItemDto, index: number) => {
            const isVideo = mediaItem.mediaType === 'VIDEO';
            return (
              <button
                type="button"
                key={mediaItem.assetId}
                className="review-media-thumbnail-btn"
                onClick={() => onOpenMedia?.(index, review)}
                aria-label={`View customer ${isVideo ? 'video' : 'photo'} ${index + 1} of ${review.media.length}`}
              >
                <img
                  src={mediaItem.thumbnailUrl ?? mediaItem.url}
                  alt="Customer review media thumbnail"
                  loading="lazy"
                  width="120"
                  height="120"
                  className="review-media-img"
                />
                {isVideo ? (
                  <span className="video-play-indicator" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Author and Date Meta */}
      <footer className="review-card-footer">
        <span className="review-author-name">{review.publicDisplayName}</span>
        <span className="review-meta-dot">·</span>
        <time dateTime={review.submittedAt} className="review-date-text">
          {formattedDate}
        </time>
      </footer>

      {/* Distinct Maevelle Merchant Response */}
      {review.merchantResponse && review.merchantResponse.status === 'VISIBLE' ? (
        <aside className="merchant-response-card" aria-label="Response from Maevelle">
          <div className="merchant-response-header">
            <span className="merchant-badge">Response from Maevelle</span>
            {review.merchantResponse.createdAt ? (
              <time className="merchant-date-text">
                {new Intl.DateTimeFormat('en-BD', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }).format(new Date(review.merchantResponse.createdAt))}
              </time>
            ) : null}
          </div>
          <p className="merchant-response-body">{review.merchantResponse.body}</p>
        </aside>
      ) : null}
    </article>
  );
}
