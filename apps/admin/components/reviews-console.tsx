'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { ApiEnvelope } from '@maevelle/contracts';

type Review = {
  readonly id: string;
  readonly product_id: string;
  readonly revision_id: string;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string | null;
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
  if (!response.ok) throw new Error('The review command was rejected.');
  return response.json() as Promise<T>;
}

export function ReviewsConsole() {
  const [reviews, setReviews] = useState<readonly Review[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      setReviews((await request<ApiEnvelope<readonly Review[]>>('/admin/reviews')).data);
      setMessage('');
    } catch {
      setMessage('Unable to load reviews. Sign in with Review moderation permission.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const moderate = async (
    review: Review,
    decision: 'APPROVE' | 'REJECT',
    reason?: (typeof rejectionReasons)[number],
  ) => {
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
        decision === 'APPROVE' ? 'Review published.' : 'Review rejected with a policy reason.',
      );
      await reload();
    } catch {
      setMessage('Moderation was rejected. Negative sentiment alone is never a rejection reason.');
    }
  };

  const respond = async (review: Review, form: HTMLFormElement) => {
    const body = String(new FormData(form).get('body') ?? '');
    try {
      await request(`/admin/reviews/${review.id}/response`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      form.reset();
      setMessage('Merchant response saved.');
    } catch {
      setMessage('Merchant response was rejected.');
    }
  };

  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Customer experience</p>
        <h1>Reviews</h1>
        <p>
          Review text and rating are customer-submitted. Publish or reject only for a documented
          policy reason—never because a review is negative.
        </p>
        <nav aria-label="Review operations navigation">
          <Link href="/reviews">Review queue</Link> · <Link href="/catalog">Catalog</Link> ·{' '}
          <Link href="/orders">Orders</Link>
        </nav>
        {message ? <p role="status">{message}</p> : null}
        {loading ? <p>Loading moderation queue…</p> : null}
        {!loading && reviews.length === 0 ? <p>No Reviews are awaiting moderation.</p> : null}
        {reviews.map((review) => (
          <article key={review.id}>
            <h2>{review.title ?? 'Untitled review'}</h2>
            <p aria-label={`${review.rating} out of 5 stars`}>
              {'★'.repeat(review.rating)}
              {'☆'.repeat(5 - review.rating)}
            </p>
            {review.body ? <p>{review.body}</p> : <p>No written feedback.</p>}
            <p>Submitted {new Date(review.submitted_at).toLocaleString()}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void moderate(review, 'APPROVE')}>
                Approve and publish
              </button>
              <label>
                Rejection reason
                <select id={`reason-${review.id}`} defaultValue="SPAM">
                  {rejectionReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  const field = document.getElementById(`reason-${review.id}`) as HTMLSelectElement;
                  void moderate(review, 'REJECT', field.value as (typeof rejectionReasons)[number]);
                }}
              >
                Reject for policy reason
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void respond(review, event.currentTarget);
              }}
            >
              <label>
                Merchant response <textarea name="body" maxLength={3000} required />
              </label>
              <button type="submit">Save response</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}
