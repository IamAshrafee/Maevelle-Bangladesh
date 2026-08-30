'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Stats, StatsCard, StatsTitle, StatsValue } from '@/components/ui/stats';

import type { ApiEnvelope } from '@maevelle/contracts';

import { StatusBadge } from './status-badge';

type Review = {
  readonly id: string;
  readonly product_id: string;
  readonly product_title: string;
  readonly revision_id: string;
  readonly revision_number: number;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string | null;
  readonly public_display_name: string;
  readonly moderation_status: string;
  readonly moderation_reason: string | null;
  readonly visibility_status: string;
  readonly verified_purchase: boolean;
  readonly media_count: number;
  readonly merchant_response: string | null;
  readonly submitted_at: string;
};

const rejectionReasons = [
  'SPAM',
  'DUPLICATE',
  'IRRELEVANT',
  'ABUSIVE_OR_THREATENING',
  'PERSONAL_INFORMATION',
  'UNSAFE_MEDIA',
  'FRAUD_SUSPECTED',
  'PROHIBITED_CONTENT',
  'OTHER',
] as const;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => undefined)) as
    { error?: { message?: string } | string } | undefined;
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(
      typeof error === 'object' && error?.message
        ? error.message
        : 'The review operation could not be completed.',
    );
  }
  return payload as T;
}

export function ReviewsConsole() {
  const [reviews, setReviews] = useState<readonly Review[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [queue, setQueue] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await request<ApiEnvelope<readonly Review[]>>('/admin/reviews')).data;
      setReviews(rows);
      setSelectedId((current) => current ?? rows[0]?.id);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load reviews.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return reviews.filter((review) => {
      const matchesQueue =
        queue === 'ALL' ||
        (queue === 'VISIBLE'
          ? review.visibility_status === 'VISIBLE'
          : queue === 'HIDDEN'
            ? review.visibility_status === 'HIDDEN' && review.moderation_status !== 'PENDING'
            : queue === 'NEEDS_RESPONSE'
              ? review.moderation_status === 'APPROVED' && !review.merchant_response
              : queue === 'MEDIA'
                ? review.media_count > 0
                : review.moderation_status === queue);
      return (
        matchesQueue &&
        (!term ||
          [review.product_title, review.title, review.body, review.public_display_name]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(term)))
      );
    });
  }, [queue, reviews, search]);
  const selected = reviews.find((review) => review.id === selectedId) ?? visible[0];

  const moderate = async (
    review: Review,
    decision: 'APPROVE' | 'REJECT' | 'HIDE' | 'RESTORE',
    reason?: (typeof rejectionReasons)[number],
  ) => {
    const consequence =
      decision === 'REJECT'
        ? 'Reject this revision for the selected policy reason? Negative sentiment is not a valid reason.'
        : decision === 'HIDE'
          ? 'Hide this published review from the Storefront? Its history will be preserved.'
          : undefined;
    if (consequence && !window.confirm(consequence)) return;
    setBusy(true);
    try {
      await request(`/admin/reviews/${review.id}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          revisionId: review.revision_id,
          decision,
          ...(reason ? { reason } : {}),
        }),
      });
      setMessage(
        decision === 'APPROVE'
          ? 'Review approved and published.'
          : decision === 'REJECT'
            ? 'Revision rejected with a policy reason.'
            : decision === 'HIDE'
              ? 'Review hidden; history preserved.'
              : 'Review restored to the Storefront.',
      );
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Moderation was rejected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Customer experience / Moderation</p>
          <h1>Reviews</h1>
          <p>Publish useful customer feedback while preserving policy-based moderation history.</p>
        </div>
        <nav aria-label="Review operations">
          <Link href="/products">Products</Link> · <Link href="/orders">Orders</Link>
        </nav>
      </header>

      <Stats aria-label="Review queue summary">
        <StatsCard>
          <StatsTitle>Awaiting decision</StatsTitle>
          <StatsValue>{reviews.filter((item) => item.moderation_status === 'PENDING').length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Visible</StatsTitle>
          <StatsValue>{reviews.filter((item) => item.visibility_status === 'VISIBLE').length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Needs response</StatsTitle>
          <StatsValue>
            {
              reviews.filter(
                (item) => item.moderation_status === 'APPROVED' && !item.merchant_response,
              ).length
            }
          </StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>With media</StatsTitle>
          <StatsValue>{reviews.filter((item) => item.media_count > 0).length}</StatsValue>
        </StatsCard>
      </Stats>

      {message ? (
        <p className="success-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="error-panel" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}

      <section className="review-layout">
        <div className="worklist-panel">
          <div className="worklist-toolbar">
            <label>
              Queue
              <select value={queue} onChange={(event) => setQueue(event.target.value)}>
                <option value="PENDING">Pending</option>
                <option value="VISIBLE">Visible</option>
                <option value="REJECTED">Rejected</option>
                <option value="HIDDEN">Hidden</option>
                <option value="NEEDS_RESPONSE">Needs response</option>
                <option value="MEDIA">With media</option>
                <option value="ALL">All</option>
              </select>
            </label>
            <label>
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Product, customer, or review text"
              />
            </label>
          </div>
          <p className="muted">
            {visible.length} matching review{visible.length === 1 ? '' : 's'}
          </p>
          {loading ? (
            <div className="loading-stack" aria-label="Loading reviews">
              <span />
              <span />
              <span />
            </div>
          ) : null}
          {!loading && visible.length === 0 ? (
            <div className="empty-state">
              <h2>No reviews in this queue</h2>
              <p>Choose another queue or clear the search.</p>
            </div>
          ) : null}
          <div className="review-list">
            {visible.map((review) => (
              <button
                type="button"
                className={selected?.id === review.id ? 'review-row active' : 'review-row'}
                key={review.id}
                onClick={() => setSelectedId(review.id)}
              >
                <span>
                  <strong>{review.product_title}</strong>
                  <small>
                    {review.public_display_name} · revision {review.revision_number}
                  </small>
                </span>
                <span>
                  <span aria-label={`${review.rating} out of 5 stars`}>
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                  </span>
                  <StatusBadge status={review.moderation_status} />
                </span>
              </button>
            ))}
          </div>
        </div>

        <aside className="detail-panel" aria-label="Selected review">
          {selected ? (
            <>
              <div className="detail-panel-header">
                <div>
                  <p className="eyebrow">
                    {selected.verified_purchase ? 'Verified purchase' : 'Customer review'}
                  </p>
                  <h2>{selected.title ?? 'Untitled review'}</h2>
                </div>
                <StatusBadge status={selected.visibility_status} />
              </div>
              <p className="review-stars" aria-label={`${selected.rating} out of 5 stars`}>
                {'★'.repeat(selected.rating)}
                {'☆'.repeat(5 - selected.rating)}
              </p>
              <p>{selected.body ?? 'No written feedback.'}</p>
              <dl className="detail-list">
                <div>
                  <dt>Product</dt>
                  <dd>
                    <Link href={`/products?product=${selected.product_id}`}>
                      {selected.product_title}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{new Date(selected.submitted_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Media</dt>
                  <dd>
                    {selected.media_count} attachment{selected.media_count === 1 ? '' : 's'}
                  </dd>
                </div>
                <div>
                  <dt>Moderation</dt>
                  <dd>
                    {selected.moderation_status.replaceAll('_', ' ')}
                    {selected.moderation_reason
                      ? ` · ${selected.moderation_reason.replaceAll('_', ' ')}`
                      : ''}
                  </dd>
                </div>
              </dl>
              {selected.moderation_status === 'PENDING' ? (
                <div className="command-panel">
                  <h3>Moderation decision</h3>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => void moderate(selected, 'APPROVE')}
                  >
                    Approve and publish
                  </button>
                  <label>
                    Policy reason
                    <select id="review-rejection-reason" defaultValue="SPAM">
                      {rejectionReasons.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={busy}
                    className="danger-button"
                    type="button"
                    onClick={() => {
                      const field = document.getElementById(
                        'review-rejection-reason',
                      ) as HTMLSelectElement;
                      void moderate(
                        selected,
                        'REJECT',
                        field.value as (typeof rejectionReasons)[number],
                      );
                    }}
                  >
                    Reject revision
                  </button>
                </div>
              ) : null}
              {selected.moderation_status === 'APPROVED' ? (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void moderate(
                      selected,
                      selected.visibility_status === 'VISIBLE' ? 'HIDE' : 'RESTORE',
                    )
                  }
                >
                  {selected.visibility_status === 'VISIBLE'
                    ? 'Hide from Storefront'
                    : 'Restore to Storefront'}
                </button>
              ) : null}
              <form
                className="command-panel"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  try {
                    const body = String(new FormData(event.currentTarget).get('body') ?? '');
                    await request(`/admin/reviews/${selected.id}/response`, {
                      method: 'POST',
                      body: JSON.stringify({ body }),
                    });
                    setMessage('Merchant response saved.');
                    await reload();
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : 'Response could not be saved.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3>Merchant response</h3>
                <label htmlFor="merchant-response">Public response</label>
                <textarea
                  id="merchant-response"
                  name="body"
                  maxLength={3000}
                  defaultValue={selected.merchant_response ?? ''}
                  required
                />
                <button disabled={busy} type="submit">
                  {selected.merchant_response ? 'Update response' : 'Publish response'}
                </button>
              </form>
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a review</h2>
              <p>Review content and take the next safe action.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
