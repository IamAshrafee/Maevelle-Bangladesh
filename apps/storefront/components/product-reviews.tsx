'use client';

import { useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

type PublicReview = {
  readonly id: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string | null;
  readonly public_display_name: string;
  readonly submitted_at: string;
  readonly verified_purchase?: boolean;
  readonly purchased_variant_label?: string | null;
  readonly media_asset_ids: readonly string[];
  readonly media?: readonly {
    readonly assetId: string;
    readonly mediaType: 'IMAGE' | 'VIDEO';
    readonly url: string;
    readonly thumbnailUrl?: string;
  }[];
  readonly merchant_response: string | null;
};

type Summary = {
  readonly rating_count: number;
  readonly average_rating: string | null;
  readonly rating_1_count: number;
  readonly rating_2_count: number;
  readonly rating_3_count: number;
  readonly rating_4_count: number;
  readonly rating_5_count: number;
  readonly verified_review_count?: number;
};

export function ProductReviews({
  productId,
  organizationId,
}: {
  productId: string;
  organizationId: string;
}) {
  const [reviews, setReviews] = useState<readonly PublicReview[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const query = new URLSearchParams({ organizationId });
    void fetch(`/api/products/${encodeURIComponent(productId)}/reviews?${query}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Review data unavailable.');
        const result = (await response.json()) as ApiEnvelope<{
          reviews: readonly PublicReview[];
          summary: Summary | undefined;
        }>;
        setReviews(result.data.reviews);
        setSummary(result.data.summary);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [organizationId, productId]);

  return (
    <section className="reviews-section" aria-labelledby="reviews-heading">
      <div className="review-section-heading">
        <div>
          <p className="eyebrow">Real customer experience</p>
          <h2 id="reviews-heading">Verified reviews</h2>
        </div>
        {state === 'ready' && summary?.rating_count ? (
          <div className="review-score">
            <strong>{Number(summary.average_rating).toFixed(1)}</strong>
            <span aria-label={`${Number(summary.average_rating).toFixed(1)} out of 5 stars`}>
              ★★★★★
            </span>
            <small>
              {summary.rating_count} review{summary.rating_count === 1 ? '' : 's'}
              {summary.verified_review_count
                ? ` · ${summary.verified_review_count} verified`
                : ''}
            </small>
          </div>
        ) : null}
      </div>
      {state === 'loading' ? <p>Loading reviews…</p> : null}
      {state === 'error' ? <p>Reviews are unavailable right now.</p> : null}
      {state === 'ready' && reviews.length === 0 ? (
        <div className="catalog-message">
          <h3>No reviews yet</h3>
          <p>Verified customers can review this product through their secure order link.</p>
        </div>
      ) : null}
      <div className="review-list">
        {reviews.map((review) => (
          <article className="review-card" key={review.id}>
            <div className="review-card-header">
              <p aria-label={`${review.rating} out of 5 stars`}>
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}
              </p>
              {review.verified_purchase ? (
                <span className="badge badge-verified" title="Verified Purchase">
                  ✓ Verified Purchase
                </span>
              ) : null}
            </div>
            <h3>{review.title ?? 'Customer review'}</h3>
            {review.purchased_variant_label ? (
              <p className="review-variant-meta">
                <small>Purchased: {review.purchased_variant_label}</small>
              </p>
            ) : null}
            {review.body ? <p>{review.body}</p> : null}
            <p className="review-author-meta">
              {review.public_display_name} · {new Date(review.submitted_at).toLocaleDateString()}
            </p>
            {review.media && review.media.length > 0 ? (
              <div className="review-media-gallery">
                {review.media.map((item) =>
                  item.mediaType === 'VIDEO' ? (
                    <video
                      key={item.assetId}
                      src={item.url}
                      poster={item.thumbnailUrl}
                      controls
                      preload="metadata"
                      width="320"
                      height="320"
                      className="review-video-item"
                    />
                  ) : (
                    <img
                      key={item.assetId}
                      src={item.thumbnailUrl ?? item.url}
                      alt="Customer review media"
                      width="320"
                      height="320"
                      loading="lazy"
                    />
                  ),
                )}
              </div>
            ) : (
              review.media_asset_ids.map((assetId) => (
                <img
                  key={assetId}
                  src={`/api/media/public/${assetId}?rendition=card`}
                  alt="Customer review media"
                  width="320"
                  height="320"
                  loading="lazy"
                />
              ))
            )}
            {review.merchant_response ? (
              <aside className="merchant-response">
                <strong>Maevelle response</strong>
                <p>{review.merchant_response}</p>
              </aside>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
