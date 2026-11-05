'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { StorefrontProductDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { reviewActions } from '../foundation-runtime';
import type { ReviewSnapshot } from '../foundation-types';
import { quoteIssueMessages } from '../quote-workflow';
import { QuoteLines } from './quote-lines';
import { QuoteBreakdown } from './quote-breakdown';
import { QuoteComparison } from './quote-comparison';
import { QuoteCouponForm } from './quote-coupon-form';

export function QuotePanel({
  review,
  clock,
  products,
}: {
  review: ReviewSnapshot;
  clock: number;
  products: Readonly<Record<string, StorefrontProductDto>>;
}) {
  const actions = reviewActions.quote(),
    s = review.quote,
    q = s.current,
    draft = review.draft!;
  const [couponEditing, setCouponEditing] = useState(false),
    [actionIssue, setActionIssue] = useState('');
  const heading = useRef<HTMLHeadingElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    loaded = useRef('');
  const busy =
    review.suspended ||
    ['checking', 'pending'].includes(review.phase) ||
    ['loading', 'saving'].includes(s.phase) ||
    ['loading', 'saving'].includes(review.delivery.phase);
  const pending = Boolean(s.pending || review.pending || review.delivery.pending);
  const expired = draft.status !== 'ACTIVE' || Date.parse(draft.expiresAt) <= clock;
  const inputNeedsReview =
    review.deliveryEditing ||
    draft.sourceReviewRequired ||
    review.delivery.confirmed?.reviewRequired !== false ||
    review.delivery.phase !== 'ready';
  const localExpiry = Boolean(q && Date.parse(q.expiresAt) <= clock);
  const checked =
    !!q && s.observedRevision === draft.revision && q.draftRevision === draft.revision;
  const eligible =
    checked && q?.status === 'CURRENT' && !localExpiry && !inputNeedsReview && !expired;
  const locked =
    busy || pending || expired || s.phase === 'conflict' || clock < (s.issue?.retryAt ?? 0);
  useEffect(
    () => () => {
      loaded.current = '';
    },
    [],
  );
  useEffect(() => {
    if (
      busy ||
      pending ||
      review.suspended ||
      review.delivery.phase === 'idle' ||
      s.phase === 'error' ||
      s.phase === 'conflict'
    )
      return;
    const token = `${draft.id}:${draft.revision}`;
    if (s.observedRevision === draft.revision) {
      loaded.current = token;
      return;
    }
    if (loaded.current === token) return;
    loaded.current = token;
    void actions.refresh().catch(() => undefined);
  }, [
    actions,
    busy,
    pending,
    review.suspended,
    review.delivery.phase,
    draft.id,
    draft.revision,
    s.phase,
    s.observedRevision,
  ]);
  async function action(run: () => Promise<unknown>, focus = false) {
    setActionIssue('');
    try {
      await run();
      if (focus) {
        setCouponEditing(false);
        requestAnimationFrame(() => heading.current?.focus());
      }
    } catch {
      setActionIssue(
        'This action could not be confirmed. Check the current session, delivery details and evaluation before continuing.',
      );
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  return (
    <section
      aria-labelledby="quote-heading"
      className="min-w-0 space-y-5 rounded-2xl border border-border-subtle bg-surface-container-lowest p-4 sm:p-6"
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Your evaluated selection
        </p>
        <h2
          ref={heading}
          tabIndex={-1}
          id="quote-heading"
          className="font-serif text-2xl font-semibold"
        >
          Amounts to review
        </h2>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          Review merchandise, discounts and delivery together. This is not a purchase or a final
          payable amount.
        </p>
      </header>
      <div ref={feedback} tabIndex={-1} className="space-y-3" aria-live="polite" aria-atomic="true">
        {s.phase === 'loading' && (
          <p role="status" className="text-sm text-on-surface-variant">
            Checking the latest evaluation…
          </p>
        )}
        {s.phase === 'saving' && (
          <p role="status" className="text-sm text-on-surface-variant">
            {s.pending?.kind === 'acknowledge'
              ? 'Recording your review…'
              : 'Evaluating your selection…'}
          </p>
        )}
        {s.notice && (
          <p role="status" className="text-sm text-primary">
            {s.notice}
          </p>
        )}
        {actionIssue && !s.issue && (
          <p role="alert" className="text-sm text-error">
            {actionIssue}
          </p>
        )}
        {s.issue && (
          <Notice
            variant="warning"
            title={
              s.phase === 'unknown'
                ? 'Evaluation awaiting confirmation'
                : 'Evaluation needs attention'
            }
          >
            {s.issue.message}
          </Notice>
        )}
        {s.pending && s.phase === 'unknown' && (
          <div className="space-y-3">
            <p className="text-sm">
              The result is uncertain. Retry the exact same request before making changes. Retry
              details stay only in this page’s memory.
            </p>
            <Button
              variant="outline"
              disabled={busy || clock < (s.issue?.retryAt ?? 0)}
              onClick={() => void action(actions.retry, true)}
            >
              Retry same evaluation request
            </Button>
          </div>
        )}
        {s.phase === 'conflict' && (
          <div className="space-y-3">
            <p className="text-sm">
              Review the latest saved checkout. Your coupon entries have not been applied again.
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void action(
                  s.conflictReady ? async () => actions.reviewConflict() : actions.refresh,
                )
              }
            >
              {s.conflictReady ? 'I checked the latest details' : 'Check latest evaluation'}
            </Button>
          </div>
        )}
      </div>
      {q && (
        <>
          <div className="space-y-2 rounded-xl bg-surface-container-low p-3 text-sm">
            <p className="font-semibold">
              {eligible
                ? q.acknowledged
                  ? 'Evaluated components reviewed'
                  : 'Current evaluation'
                : q.status === 'SUPERSEDED'
                  ? 'A newer evaluation is available'
                  : q.status === 'EXPIRED' || localExpiry
                    ? 'Evaluation needs refreshing'
                    : 'Previous evaluation — check before continuing'}
            </p>
            <p className="text-xs text-on-surface-variant">
              Evaluated{' '}
              <time dateTime={q.evaluatedAt}>
                {new Intl.DateTimeFormat('en-BD', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(q.evaluatedAt))}
              </time>
              . Validity is checked again by Maevelle.
            </p>
            {(q.status !== 'CURRENT' || !checked || localExpiry) && (
              <p>
                This evaluation cannot be acknowledged as current. Check the latest conditions or
                request a fresh evaluation after reviewing your inputs.
              </p>
            )}
            {q.issues.length > 0 && (
              <ul className="list-inside list-disc space-y-1">
                {q.issues.map((issue) => (
                  <li key={issue}>{quoteIssueMessages[issue]}</li>
                ))}
              </ul>
            )}
          </div>
          <QuoteLines quote={q} products={products} handles={review.handles} />
          {q.facts.coupons.length > 0 && (
            <div className="space-y-2 border-t border-border-subtle pt-4">
              <h3 className="text-sm font-semibold">Coupon results</h3>
              <ul className="space-y-2 text-sm">
                {q.facts.coupons.map((c) => (
                  <li key={c.code} className="break-words">
                    <span translate="no" className="font-mono">
                      {c.code}
                    </span>
                    <span className="ml-2 text-on-surface-variant">
                      {c.status === 'EFFECTIVE'
                        ? 'Effective in this evaluation'
                        : 'No current benefit'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-on-surface-variant">
                Coupon eligibility can change. Review does not redeem or reserve a promotion.
              </p>
            </div>
          )}
          {q.facts.discounts.length > 0 && (
            <p className="text-xs text-on-surface-variant">
              {q.facts.discounts.length} eligible{' '}
              {q.facts.discounts.length === 1 ? 'promotion is' : 'promotions are'} included in the
              line discounts above.
            </p>
          )}
          <QuoteBreakdown facts={q.facts} />
          {q.previousQuoteId && (
            <div className="space-y-3">
              {s.previous ? (
                <QuoteComparison current={q} previous={s.previous} />
              ) : (
                <Button
                  variant="ghost"
                  disabled={busy || pending}
                  onClick={() => void action(actions.previous)}
                >
                  Compare with previous evaluation
                </Button>
              )}
            </div>
          )}
          {eligible && q.reviewRequired && (
            <div className="space-y-3 border-t border-border-subtle pt-4">
              {couponEditing && (
                <p className="text-sm text-on-surface-variant">
                  Evaluate your changed coupon entries before acknowledging these amounts.
                </p>
              )}
              <Button
                fullWidth
                disabled={locked || couponEditing}
                onClick={() => void action(actions.acknowledge, true)}
              >
                I’ve reviewed these amounts
              </Button>
            </div>
          )}
        </>
      )}
      {!q && s.phase !== 'loading' && (
        <p className="text-sm text-on-surface-variant">
          {s.phase === 'idle'
            ? 'Check for a saved evaluation, or save your delivery details and evaluate this selection.'
            : 'No evaluation is saved yet. Save your delivery details, then evaluate this selection.'}
        </p>
      )}
      {inputNeedsReview && (
        <Notice variant="neutral">
          {review.deliveryEditing
            ? 'Save or discard your unsaved delivery edits before evaluating.'
            : 'Review and save the current source and delivery details first.'}
        </Notice>
      )}
      {expired && (
        <Notice variant="warning" title="Checkout expired">
          Return to the product or your bag to start a fresh review.
        </Notice>
      )}
      <div className="space-y-3 border-t border-border-subtle pt-5">
        {draft.source.kind === 'BUY_NOW' ? (
          <QuoteCouponForm
            key={q?.id ?? 'new'}
            initialCodes={q?.facts.coupons.map((c) => c.code) ?? []}
            disabled={locked || inputNeedsReview}
            loading={s.phase === 'saving' && s.pending?.kind === 'create'}
            onEditing={setCouponEditing}
            onEvaluate={(codes) => action(() => actions.create(codes), true)}
          />
        ) : (
          <>
            <p className="text-sm text-on-surface-variant">
              Bag coupons are managed in your bag. After a change, return here and explicitly review
              your current bag before evaluating again.
            </p>
            <Button
              fullWidth
              disabled={locked || inputNeedsReview}
              loading={s.phase === 'saving' && s.pending?.kind === 'create'}
              loadingLabel="Evaluating amounts"
              onClick={() => void action(() => actions.create(), true)}
            >
              {q ? 'Evaluate current bag again' : 'Evaluate current bag'}
            </Button>
          </>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="ghost"
            disabled={busy || pending || clock < (s.issue?.retryAt ?? 0)}
            onClick={() => void action(actions.refresh)}
          >
            Check latest evaluation
          </Button>
          <Link
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
            href="/cart"
          >
            Review your bag
          </Link>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-on-surface-variant">
        Reviewing these components does not place an order, guarantee prices or hold stock. Courier
        compatibility is not confirmed. Purchasing remains unavailable.
      </p>
    </section>
  );
}
