'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiEnvelope,
  ProductRatingSummaryDto,
  PublicProductReviewsResponseDto,
  PublicReviewDto,
} from '@maevelle/contracts';
import { ProductRatingSummary } from './reviews/product-rating-summary';
import { ReviewFilters } from './reviews/review-filters';
import { ReviewCard } from './reviews/review-card';
import { ReviewMediaLightbox } from './reviews/review-media-lightbox';
import { ReviewEligibilityCta } from './reviews/review-eligibility-cta';

export interface ProductReviewsProps {
  readonly productId: string;
  readonly organizationId: string;
  readonly initialReviews?: readonly PublicReviewDto[] | undefined;
  readonly initialSummary?: ProductRatingSummaryDto | null | undefined;
}

export function ProductReviews({
  productId,
  organizationId,
  initialReviews,
  initialSummary,
}: ProductReviewsProps) {
  const [reviews, setReviews] = useState<readonly PublicReviewDto[]>(initialReviews ?? []);
  const [summary, setSummary] = useState<ProductRatingSummaryDto | null | undefined>(initialSummary);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [withMedia, setWithMedia] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS'>('NEWEST');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(initialReviews?.length ?? 0);
  const [loading, setLoading] = useState(!initialReviews);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightbox state
  const [lightbox, setLightbox] = useState<{
    readonly index: number;
    readonly review: PublicReviewDto;
  } | null>(null);

  const isFirstMount = useRef(true);

  const fetchReviews = useCallback(
    async (
      targetPage: number,
      append: boolean = false,
      ratingFilter: number | null = selectedRating,
      mediaFilter: boolean = withMedia,
      verifiedFilter: boolean = verifiedOnly,
      sortOption: 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS' = sort,
    ) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const query = new URLSearchParams({
          organizationId,
          page: String(targetPage),
          pageSize: '10',
          sort: sortOption,
        });

        if (ratingFilter) query.set('rating', String(ratingFilter));
        if (mediaFilter) query.set('withMedia', 'true');
        if (verifiedFilter) query.set('verifiedOnly', 'true');

        const response = await fetch(
          `/api/products/${encodeURIComponent(productId)}/reviews?${query}`,
          { credentials: 'include' },
        );

        if (!response.ok) {
          throw new Error('Reviews could not be loaded at this time.');
        }

        const result = (await response.json()) as ApiEnvelope<PublicProductReviewsResponseDto>;
        const data = result.data;

        if (append) {
          setReviews((prev) => [...prev, ...data.reviews]);
        } else {
          setReviews(data.reviews);
        }

        if (data.summary) {
          setSummary(data.summary);
        }

        setPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.totalItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load reviews.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [organizationId, productId, selectedRating, withMedia, verifiedOnly, sort],
  );

  // Effect to re-fetch when filters or sort change
  useEffect(() => {
    // If we have initialReviews and this is the initial mount with default filters, skip re-fetching
    if (
      isFirstMount.current &&
      initialReviews &&
      selectedRating === null &&
      !withMedia &&
      !verifiedOnly &&
      sort === 'NEWEST'
    ) {
      isFirstMount.current = false;
      return;
    }
    isFirstMount.current = false;

    void fetchReviews(1, false, selectedRating, withMedia, verifiedOnly, sort);
  }, [selectedRating, withMedia, verifiedOnly, sort, fetchReviews, initialReviews]);

  function handleResetFilters() {
    setSelectedRating(null);
    setWithMedia(false);
    setVerifiedOnly(false);
    setSort('NEWEST');
  }

  function handleOpenMedia(index: number, review: PublicReviewDto) {
    setLightbox({ index, review });
  }

  const hasFilterActive = Boolean(selectedRating || withMedia || verifiedOnly);

  return (
    <section className="product-reviews-section" aria-labelledby="product-reviews-heading">
      <div className="reviews-section-header">
        <div className="section-title-wrap">
          <p className="section-eyebrow">Real Customer Feedback</p>
          <h2 id="product-reviews-heading" className="section-heading">
            Verified Reviews & Ratings
          </h2>
        </div>
      </div>

      {/* Trust & Eligibility Policy CTA */}
      <ReviewEligibilityCta productId={productId} organizationId={organizationId} />

      {/* Rating Summary & Star Distribution */}
      <ProductRatingSummary
        summary={summary}
        selectedRating={selectedRating}
        onSelectRating={(r) => setSelectedRating(r)}
      />

      {/* Filter and Sorting Bar */}
      {summary && summary.ratingCount > 0 ? (
        <ReviewFilters
          selectedRating={selectedRating}
          onSelectRating={(r) => setSelectedRating(r)}
          withMedia={withMedia}
          onToggleWithMedia={(m) => setWithMedia(m)}
          verifiedOnly={verifiedOnly}
          onToggleVerifiedOnly={(v) => setVerifiedOnly(v)}
          sort={sort}
          onSelectSort={(s) => setSort(s)}
          totalMatching={totalItems}
          onResetFilters={handleResetFilters}
        />
      ) : null}

      {/* Error Notice */}
      {error ? (
        <div className="reviews-error-notice" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="reviews-retry-btn"
            onClick={() => void fetchReviews(page, false)}
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* Loading Skeletons */}
      {loading && !loadingMore ? (
        <div className="reviews-skeleton-list" aria-label="Loading reviews">
          {[1, 2, 3].map((n) => (
            <div key={n} className="review-card-skeleton">
              <div className="skeleton-line skeleton-stars" />
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-body" />
              <div className="skeleton-line skeleton-meta" />
            </div>
          ))}
        </div>
      ) : null}

      {/* Reviews List */}
      {!loading && reviews.length > 0 ? (
        <div className="reviews-cards-stream">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onOpenMedia={handleOpenMedia}
            />
          ))}
        </div>
      ) : null}

      {/* Empty State when no reviews exist overall */}
      {!loading && reviews.length === 0 && !hasFilterActive ? (
        <div className="reviews-zero-state">
          <div className="zero-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 className="zero-state-title">No reviews yet</h3>
          <p className="zero-state-description">
            Be the first verified buyer to share your thoughts on this piece. Once your order arrives, use your secure delivery link to review.
          </p>
        </div>
      ) : null}

      {/* Empty State when filters yield 0 results */}
      {!loading && reviews.length === 0 && hasFilterActive ? (
        <div className="reviews-filtered-empty">
          <p className="filtered-empty-message">
            No reviews match the selected filter criteria.
          </p>
          <button
            type="button"
            className="clear-filters-action-btn"
            onClick={handleResetFilters}
          >
            Clear all filters
          </button>
        </div>
      ) : null}

      {/* Load More Pagination */}
      {!loading && page < totalPages ? (
        <div className="reviews-pagination-footer">
          <button
            type="button"
            disabled={loadingMore}
            className="load-more-reviews-btn"
            onClick={() => void fetchReviews(page + 1, true)}
          >
            {loadingMore ? 'Loading more reviews…' : `Load more reviews (${reviews.length} of ${totalItems})`}
          </button>
        </div>
      ) : null}

      {/* Media Lightbox */}
      <ReviewMediaLightbox
        isOpen={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        activeIndex={lightbox?.index ?? 0}
        onIndexChange={(newIdx) => {
          if (lightbox) {
            setLightbox({ index: newIdx, review: lightbox.review });
          }
        }}
        review={lightbox?.review ?? null}
      />
    </section>
  );
}
