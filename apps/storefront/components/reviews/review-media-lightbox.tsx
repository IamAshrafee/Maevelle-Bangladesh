'use client';

import { useEffect, useCallback } from 'react';
import type { PublicReviewDto } from '@maevelle/contracts';
import { StarRating } from './star-rating';

export interface ReviewMediaLightboxProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly activeIndex: number;
  readonly onIndexChange: (newIndex: number) => void;
  readonly review: PublicReviewDto | null;
}

export function ReviewMediaLightbox({
  isOpen,
  onClose,
  activeIndex,
  onIndexChange,
  review,
}: ReviewMediaLightboxProps) {
  const mediaList = review?.media ?? [];
  const currentItem = mediaList[activeIndex];
  const hasMultiple = mediaList.length > 1;

  const handlePrev = useCallback(() => {
    if (mediaList.length === 0) return;
    onIndexChange((activeIndex - 1 + mediaList.length) % mediaList.length);
  }, [activeIndex, mediaList.length, onIndexChange]);

  const handleNext = useCallback(() => {
    if (mediaList.length === 0) return;
    onIndexChange((activeIndex + 1) % mediaList.length);
  }, [activeIndex, mediaList.length, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        handlePrev();
      } else if (event.key === 'ArrowRight') {
        handleNext();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !currentItem || !review) return null;

  return (
    <div
      className="review-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Customer review media lightbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="review-lightbox-modal">
        {/* Close Button */}
        <button
          type="button"
          className="lightbox-close-btn"
          onClick={onClose}
          aria-label="Close media viewer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Media Viewer Area */}
        <div className="lightbox-media-viewport">
          {currentItem.mediaType === 'VIDEO' ? (
            <video
              src={currentItem.url}
              poster={currentItem.thumbnailUrl}
              controls
              autoPlay
              className="lightbox-video-player"
            />
          ) : (
            <img
              src={`${currentItem.url}?rendition=zoom`}
              alt="Customer review photo enlarged"
              className="lightbox-image-main"
            />
          )}

          {hasMultiple ? (
            <>
              <button
                type="button"
                className="lightbox-nav-btn prev"
                onClick={handlePrev}
                aria-label="Previous photo"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                className="lightbox-nav-btn next"
                onClick={handleNext}
                aria-label="Next photo"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <div className="lightbox-counter-pill">
                {activeIndex + 1} / {mediaList.length}
              </div>
            </>
          ) : null}
        </div>

        {/* Connected Review Context Panel */}
        <aside className="lightbox-review-context">
          <div className="lightbox-context-header">
            <StarRating value={review.rating} size="sm" />
            {review.verifiedPurchase ? (
              <span className="context-verified-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified
              </span>
            ) : null}
          </div>

          {review.title ? (
            <h4 className="lightbox-review-title">{review.title}</h4>
          ) : null}

          {review.purchasedVariant?.label ? (
            <p className="lightbox-variant-meta">
              Purchased: <strong>{review.purchasedVariant.label}</strong>
            </p>
          ) : null}

          {review.body ? (
            <p className="lightbox-review-body">{review.body}</p>
          ) : null}

          <div className="lightbox-author-meta">
            <span>{review.publicDisplayName}</span>
            <span>·</span>
            <time>{new Date(review.submittedAt).toLocaleDateString()}</time>
          </div>

          {/* Thumbnail navigation row */}
          {hasMultiple ? (
            <div className="lightbox-thumbnail-row" aria-label="Media thumbnails">
              {mediaList.map((m, idx) => (
                <button
                  type="button"
                  key={m.assetId}
                  className={`lightbox-thumb-btn ${idx === activeIndex ? 'is-active' : ''}`}
                  onClick={() => onIndexChange(idx)}
                  aria-label={`Jump to item ${idx + 1}`}
                >
                  <img src={m.thumbnailUrl ?? m.url} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
