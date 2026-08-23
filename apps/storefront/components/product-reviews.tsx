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
  readonly media_asset_ids: readonly string[];
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
    <section aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Verified customer reviews</h2>
      {state === 'loading' ? <p>Loading reviews…</p> : null}
      {state === 'error' ? <p>Reviews are unavailable right now.</p> : null}
      {state === 'ready' && summary?.rating_count ? (
        <p>
          {Number(summary.average_rating).toFixed(1)} out of 5 from {summary.rating_count} verified
          customer review{summary.rating_count === 1 ? '' : 's'}.
        </p>
      ) : null}
      {state === 'ready' && reviews.length === 0 ? <p>No reviews yet.</p> : null}
      {reviews.map((review) => (
        <article key={review.id}>
          <p aria-label={`${review.rating} out of 5 stars`}>
            {'★'.repeat(review.rating)}
            {'☆'.repeat(5 - review.rating)}
          </p>
          <h3>{review.title ?? 'Verified customer review'}</h3>
          {review.body ? <p>{review.body}</p> : null}
          <p>
            {review.public_display_name} · {new Date(review.submitted_at).toLocaleDateString()}
          </p>
          {review.media_asset_ids.map((assetId) => (
            <img key={assetId} src={`/api/media/public/${assetId}`} alt="Customer review media" />
          ))}
          {review.merchant_response ? (
            <aside>
              <strong>Maevelle response</strong>
              <p>{review.merchant_response}</p>
            </aside>
          ) : null}
        </article>
      ))}
    </section>
  );
}
