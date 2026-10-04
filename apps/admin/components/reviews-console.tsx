'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Star, MessageSquare, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

import { Stats, StatsCard, StatsTitle, StatsValue } from '@/components/ui/stats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  OperationalFeedback,
  OperationalPageHeader,
} from './operational-worklist';
import { StatusBadge } from './status-badge';
import type { ApiEnvelope } from '@maevelle/contracts';

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
  readonly purchased_variant_label?: string | null;
  readonly order_number?: string | null;
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
      const response = await request<any>('/admin/reviews');
      const rows: readonly Review[] = Array.isArray(response.data)
        ? response.data
        : (response.data?.items ?? response.data?.reviews ?? []);
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
    <main className="space-y-6">
      <OperationalPageHeader
        eyebrow="Customer experience / Moderation"
        title="Reviews"
        description="Publish useful customer feedback while preserving policy-based moderation history."
      />

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
        <OperationalFeedback tone="success">{message}</OperationalFeedback>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-center justify-between gap-4" role="alert">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : null}

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Worklist Column */}
        <div className="lg:col-span-7 rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 border-b border-border bg-muted/20">
            <div className="w-full sm:w-48 shrink-0">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Queue</label>
              <NativeSelect value={queue} onChange={(event) => setQueue(event.target.value)}>
                <option value="PENDING">Pending</option>
                <option value="VISIBLE">Visible</option>
                <option value="REJECTED">Rejected</option>
                <option value="HIDDEN">Hidden</option>
                <option value="NEEDS_RESPONSE">Needs response</option>
                <option value="MEDIA">With media</option>
                <option value="ALL">All</option>
              </NativeSelect>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Product, customer, or review text"
                  className="pl-8"
                />
              </div>
            </div>
          </div>
          <div className="px-4 py-2 bg-muted/10 border-b border-border text-xs text-muted-foreground">
            {visible.length} matching review{visible.length === 1 ? '' : 's'}
          </div>

          {loading ? (
            <div className="p-8 text-center space-y-3" aria-label="Loading reviews">
              <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">Loading reviews…</p>
            </div>
          ) : null}

          {!loading && visible.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">No reviews in this queue</p>
              <p className="text-xs text-muted-foreground">Choose another queue or clear the search query.</p>
            </div>
          ) : null}

          <div className="divide-y divide-border">
            {visible.map((review) => {
              const isSelected = selected?.id === review.id;
              return (
                <button
                  type="button"
                  key={review.id}
                  onClick={() => setSelectedId(review.id)}
                  className={`w-full text-left p-4 transition-colors flex items-center justify-between gap-4 cursor-pointer ${
                    isSelected
                      ? 'bg-primary/5 border-l-4 border-l-primary'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <strong className="block text-sm font-medium text-foreground truncate">{review.product_title}</strong>
                    <p className="text-xs text-muted-foreground">
                      {review.public_display_name} · revision {review.revision_number}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-amber-500 text-xs tracking-tight" aria-label={`${review.rating} out of 5 stars`}>
                      {'★'.repeat(review.rating)}
                      <span className="text-muted-foreground/30">{'☆'.repeat(5 - review.rating)}</span>
                    </span>
                    <StatusBadge status={review.moderation_status} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail Panel */}
        <aside className="lg:col-span-5 rounded-lg border border-border bg-card p-5 space-y-5 sticky top-20" aria-label="Selected review">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {selected.verified_purchase ? 'Verified purchase' : 'Customer review'}
                  </p>
                  <h2 className="text-lg font-semibold text-foreground mt-0.5">{selected.title ?? 'Untitled review'}</h2>
                </div>
                <StatusBadge status={selected.visibility_status} />
              </div>

              <div className="text-amber-500 text-sm tracking-wide" aria-label={`${selected.rating} out of 5 stars`}>
                {'★'.repeat(selected.rating)}
                <span className="text-muted-foreground/30">{'☆'.repeat(5 - selected.rating)}</span>
              </div>

              <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                {selected.body ?? 'No written feedback.'}
              </p>

              <dl className="grid grid-cols-2 gap-3 text-xs bg-muted/20 rounded-md p-3 border border-border/60">
                <div>
                  <dt className="text-muted-foreground">Product</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    <Link href={`/products/${selected.product_id}`} className="hover:underline text-primary">
                      {selected.product_title}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {new Date(selected.submitted_at).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Media</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {selected.media_count} attachment{selected.media_count === 1 ? '' : 's'}
                  </dd>
                </div>
                {selected.purchased_variant_label ? (
                  <div>
                    <dt className="text-muted-foreground">Purchased Variant</dt>
                    <dd className="font-medium text-foreground mt-0.5">
                      {selected.purchased_variant_label}
                    </dd>
                  </div>
                ) : null}
                {selected.order_number ? (
                  <div>
                    <dt className="text-muted-foreground">Order</dt>
                    <dd className="font-medium text-foreground mt-0.5 font-mono">
                      #{selected.order_number}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">Moderation</dt>
                  <dd className="font-medium text-foreground mt-0.5">
                    {selected.moderation_status.replaceAll('_', ' ')}
                    {selected.moderation_reason
                      ? ` · ${selected.moderation_reason.replaceAll('_', ' ')}`
                      : ''}
                  </dd>
                </div>
              </dl>

              {selected.moderation_status === 'PENDING' ? (
                <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Moderation decision</h3>
                  <Button
                    disabled={busy}
                    type="button"
                    className="w-full"
                    onClick={() => void moderate(selected, 'APPROVE')}
                  >
                    Approve and publish
                  </Button>
                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs text-muted-foreground block">
                      Policy rejection reason
                    </label>
                    <NativeSelect id="review-rejection-reason" defaultValue="SPAM">
                      {rejectionReasons.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <Button
                    disabled={busy}
                    variant="destructive"
                    className="w-full"
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
                  </Button>
                </div>
              ) : null}

              {selected.moderation_status === 'APPROVED' ? (
                <Button
                  disabled={busy}
                  variant="outline"
                  className="w-full"
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
                </Button>
              ) : null}

              <form
                className="p-4 rounded-lg border border-border bg-muted/30 space-y-3"
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
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Merchant response</h3>
                <div className="space-y-1.5">
                  <label htmlFor="merchant-response" className="text-xs text-muted-foreground block">Public response</label>
                  <Textarea
                    id="merchant-response"
                    name="body"
                    maxLength={3000}
                    defaultValue={selected.merchant_response ?? ''}
                    required
                    rows={3}
                  />
                </div>
                <Button disabled={busy} type="submit" variant="secondary" className="w-full">
                  {selected.merchant_response ? 'Update response' : 'Publish response'}
                </Button>
              </form>
            </>
          ) : (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">Select a review</p>
              <p className="text-xs text-muted-foreground">Review content and take the next safe action.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
