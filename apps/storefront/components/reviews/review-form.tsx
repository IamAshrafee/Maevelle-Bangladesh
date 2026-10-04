'use client';

import { useState } from 'react';
import type { ReviewEligibilityDto } from '@maevelle/contracts';
import { StarRating } from './star-rating';
import { ReviewMediaUploader, type UploadedMediaItem } from './review-media-uploader';

export interface ReviewFormProps {
  readonly organizationId: string;
  readonly accessToken: string;
  readonly eligibility: ReviewEligibilityDto;
  readonly mode?: 'create' | 'edit' | undefined;
  readonly initialRating?: number | undefined;
  readonly initialTitle?: string | undefined;
  readonly initialBody?: string | undefined;
  readonly initialDisplayName?: string | undefined;
  readonly existingReviewId?: string | undefined;
  readonly onSuccess?: (() => void) | undefined;
  readonly onWithdrawn?: (() => void) | undefined;
}

export function ReviewForm({
  organizationId,
  accessToken,
  eligibility,
  mode = 'create',
  initialRating = 5,
  initialTitle = '',
  initialBody = '',
  initialDisplayName = '',
  existingReviewId,
  onSuccess,
  onWithdrawn,
}: ReviewFormProps) {
  const [rating, setRating] = useState<number>(initialRating);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [mediaItems, setMediaItems] = useState<readonly UploadedMediaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isEditing = mode === 'edit';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage('');

    if (!rating || rating < 1 || rating > 5) {
      setErrorMessage('Please select a star rating between 1 and 5.');
      return;
    }

    const stillUploading = mediaItems.some(
      (m) => m.status === 'uploading' || m.status === 'processing',
    );
    if (stillUploading) {
      setErrorMessage('Please wait for photos to finish uploading before submitting.');
      return;
    }

    const failedUploads = mediaItems.some((m) => m.status === 'error');
    if (failedUploads) {
      setErrorMessage('Please remove or retry any failed photo uploads before submitting.');
      return;
    }

    const readyAssetIds = mediaItems
      .filter((m) => m.status === 'ready' && Boolean(m.assetId))
      .map((m) => m.assetId!);

    setSubmitting(true);

    try {
      if (isEditing) {
        // Revision flow
        const response = await fetch('/api/reviews/revisions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            accessToken,
            rating,
            title: title.trim() || undefined,
            body: body.trim() || undefined,
            publicDisplayName: displayName.trim() || undefined,
            mediaAssetIds: readyAssetIds.length > 0 ? readyAssetIds : undefined,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => undefined);
          throw new Error(
            payload?.error?.message ?? 'Your revised review could not be submitted.',
          );
        }

        setSuccessMessage(
          'Thank you! Your updated review has been submitted for moderation. Your previous review will remain visible until the changes are approved.',
        );
      } else {
        // Create flow
        const idempotencyKey = crypto.randomUUID();
        const response = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            accessToken,
            rating,
            title: title.trim() || undefined,
            body: body.trim() || undefined,
            publicDisplayName: displayName.trim() || undefined,
            mediaAssetIds: readyAssetIds.length > 0 ? readyAssetIds : undefined,
            idempotencyKey,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => undefined);
          throw new Error(
            payload?.error?.message ?? 'Your review could not be submitted.',
          );
        }

        setSuccessMessage(
          'Thank you for your feedback! Your review has been submitted and is currently awaiting moderation before appearing publicly on Maevelle.',
        );
      }

      onSuccess?.();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!existingReviewId && !eligibility.existingReviewId) return;
    const reviewId = existingReviewId || eligibility.existingReviewId;
    if (!reviewId) return;

    const confirmed = window.confirm(
      'Are you sure you want to remove your review? It will no longer appear on the Storefront and will stop contributing to the product rating.',
    );
    if (!confirmed) return;

    setWithdrawing(true);
    setErrorMessage('');

    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/withdraw`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          accessToken,
          reason: 'Customer requested removal',
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => undefined);
        throw new Error(payload?.error?.message ?? 'Review could not be removed.');
      }

      setSuccessMessage('Your review has been successfully removed.');
      onWithdrawn?.();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to remove your review.',
      );
    } finally {
      setWithdrawing(false);
    }
  }

  if (successMessage) {
    return (
      <div className="review-form-success-card" role="status">
        <div className="success-icon-badge">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="success-title">
          {isEditing ? 'Changes Submitted' : 'Review Submitted'}
        </h3>
        <p className="success-message">{successMessage}</p>
        <p className="success-hint">
          Maevelle values authentic customer feedback. All submitted reviews are reviewed according to our honest community standards.
        </p>
      </div>
    );
  }

  return (
    <form className="storefront-review-form" onSubmit={handleSubmit} noValidate>
      {/* Product & Variant Context Banner */}
      <div className="review-context-banner">
        <div className="context-copy">
          <span className="context-eyebrow">Verified purchase review</span>
          <h2 className="context-product-title">
            {eligibility.productTitle ?? 'Product Review'}
          </h2>
          {eligibility.variantLabel ? (
            <p className="context-variant-pill">
              Purchased: <strong>{eligibility.variantLabel}</strong>
            </p>
          ) : null}
          {eligibility.orderNumber ? (
            <span className="context-order-meta font-mono">
              Order #{eligibility.orderNumber}
            </span>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <div className="review-notice-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p>
            You are editing your existing review. Your changes will be reviewed by moderation before replacing your current published feedback.
          </p>
        </div>
      ) : null}

      {/* Error Alert */}
      {errorMessage ? (
        <div className="form-error-alert" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {/* Step 1: Overall Rating */}
      <div className="form-field-group">
        <label className="field-label required">
          Overall rating
        </label>
        <div className="rating-selector-container">
          <StarRating
            value={rating}
            size="xl"
            interactive
            onRate={(r) => setRating(r)}
            showValueText
            ariaLabel="Select overall rating from 1 to 5 stars"
          />
        </div>
      </div>

      {/* Step 2: Headline / Title */}
      <div className="form-field-group">
        <label htmlFor="review-title-input" className="field-label">
          Review headline <span className="field-optional">(Optional)</span>
        </label>
        <input
          id="review-title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Beautiful fabric and perfect fit"
          maxLength={160}
          disabled={submitting}
          className="form-input"
        />
      </div>

      {/* Step 3: Written Review */}
      <div className="form-field-group">
        <div className="field-label-row">
          <label htmlFor="review-body-input" className="field-label">
            Your review <span className="field-optional">(Optional)</span>
          </label>
          <span className="char-count tabular-nums">
            {body.length} / 5000
          </span>
        </div>
        <textarea
          id="review-body-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you like or dislike about this product? How did the size and material feel in real life?"
          maxLength={5000}
          rows={5}
          disabled={submitting}
          className="form-textarea"
        />
      </div>

      {/* Step 4: Photo Attachments */}
      <div className="form-field-group">
        <ReviewMediaUploader
          organizationId={organizationId}
          accessToken={accessToken}
          mediaItems={mediaItems}
          onMediaItemsChange={setMediaItems}
          maxItems={5}
          disabled={submitting}
        />
      </div>

      {/* Step 5: Public Display Name */}
      <div className="form-field-group">
        <label htmlFor="review-author-input" className="field-label">
          Public author name <span className="field-optional">(Optional)</span>
        </label>
        <input
          id="review-author-input"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Nusrat J."
          maxLength={50}
          disabled={submitting}
          className="form-input"
        />
        <p className="field-help-text">
          To protect your privacy, we suggest using your first name and last initial. We never display your phone number, email, or address.
        </p>
      </div>

      {/* Actions */}
      <div className="form-actions-row">
        <button
          type="submit"
          disabled={submitting || withdrawing}
          className="review-submit-primary-btn"
        >
          {submitting
            ? 'Submitting review…'
            : isEditing
              ? 'Update review'
              : 'Submit review'}
        </button>

        {isEditing && (existingReviewId || eligibility.existingReviewId) ? (
          <button
            type="button"
            disabled={submitting || withdrawing}
            onClick={handleWithdraw}
            className="review-withdraw-btn"
          >
            {withdrawing ? 'Removing…' : 'Remove review'}
          </button>
        ) : null}
      </div>
    </form>
  );
}
