'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { reviewActions, useReviewSnapshot } from '../foundation-runtime';
import { DeliveryPanel } from './delivery-panel';
import { ReviewItems } from './review-items';
import { QuotePanel } from './quote-panel';
import { useReviewCatalog } from '../use-review-catalog';
import { PlacementPanel } from './placement-panel';
import { PlacementConfirmation } from './placement-confirmation';
import { placementBusy } from '../placement-types';

const noCatalogReferences = {};

export function CheckoutReview() {
  const state = useReviewSnapshot(),
    router = useRouter();
  const orderStage = Boolean(
    state.placement.pending ||
    state.placement.receipt ||
    state.placement.committedConflict ||
    state.draft?.status === 'COMMITTED',
  );
  const products = useReviewCatalog(orderStage ? noCatalogReferences : state.handles);
  const [clock, setClock] = useState(Date.now),
    [actionError, setActionError] = useState('');
  useEffect(() => {
    void reviewActions.refresh().catch(() => undefined);
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const pendingPlacement = Boolean(state.placement.pending);
  useEffect(() => {
    if (!pendingPlacement) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [pendingPlacement]);
  const draft = state.draft,
    busy =
      ['checking', 'pending'].includes(state.phase) ||
      placementBusy(state.placement) ||
      ['loading', 'saving'].includes(state.delivery.phase) ||
      ['loading', 'saving'].includes(state.quote.phase),
    pending = Boolean(state.pending);
  const privatePending = Boolean(state.delivery.pending || state.quote.pending);
  const references = state.partition ? reviewActions.references().filter((ref) => ref.id) : [];
  const expired =
    draft?.status === 'EXPIRED' || Boolean(draft && Date.parse(draft.expiresAt) <= clock);
  async function action(run: () => unknown) {
    setActionError('');
    try {
      await run();
    } catch {
      setActionError('The action could not be confirmed. Check the review before continuing.');
    }
  }
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-[60vh] max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Development preview
        </p>
        <h1 className="font-serif text-3xl font-semibold">Your checkout</h1>
        <p className="text-on-surface-variant">
          {orderStage
            ? 'Check the order connected to this checkout.'
            : 'Add your delivery details and review your selection.'}
        </p>
      </header>
      <nav
        className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold text-primary"
        aria-label="Review navigation"
      >
        <Link
          className="inline-flex min-h-11 items-center underline underline-offset-4"
          href="/cart"
        >
          Return to your bag
        </Link>
        <Link
          className="inline-flex min-h-11 items-center underline underline-offset-4"
          href="/account"
        >
          Your account
        </Link>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={
              busy ||
              Boolean(state.placement.pending && !state.suspended) ||
              (privatePending && !state.suspended) ||
              clock < (state.issue?.retryAt ?? 0) ||
              Boolean(pending && state.issue && !state.issue.retryable)
            }
            onClick={() =>
              void action(
                state.suspended
                  ? reviewActions.resume
                  : pending
                    ? reviewActions.retry
                    : () => reviewActions.refresh(),
              )
            }
          >
            {state.suspended
              ? 'Check current session'
              : pending
                ? 'Retry same request'
                : 'Restore review'}
          </Button>
          {pending && state.issue && !state.issue.retryable && (
            <Button variant="ghost" onClick={reviewActions.stopRecovering}>
              Dismiss rejected request
            </Button>
          )}
        </div>
      </nav>
      <div
        aria-live="polite"
        role="status"
        className={busy ? 'text-sm text-on-surface-variant' : 'sr-only'}
      >
        {busy
          ? state.phase === 'checking'
            ? 'Checking your current shopper session…'
            : 'Checking your review…'
          : ''}
      </div>
      {!state.persisted && (
        <Notice variant="warning">
          Browser storage is unavailable. Keep this tab open to recover a pending review.
        </Notice>
      )}
      {state.issue && (
        <Notice variant="warning" title="Review needs attention">
          {state.issue.message}
        </Notice>
      )}
      {actionError && (
        <p role="alert" className="text-error">
          {actionError}
        </p>
      )}
      {pending && (
        <Notice variant="info" title="Request awaiting confirmation">
          Retry the same request to find out whether the review was saved. No order was placed.
        </Notice>
      )}
      {references.length > 1 && !pending && !privatePending && !state.placement.pending && (
        <nav aria-label="Saved reviews" className="flex flex-wrap gap-3">
          {references.map((ref, index) => (
            <Button
              key={ref.id}
              variant="outline"
              disabled={busy || ref.id === draft?.id}
              aria-current={ref.id === draft?.id ? 'true' : undefined}
              onClick={() => void action(() => reviewActions.refresh(ref.id))}
            >
              Review {references.length - index}
            </Button>
          ))}
        </nav>
      )}
      {state.partition !== 'guest' &&
        state.guestCandidate &&
        !pending &&
        !privatePending &&
        !orderStage && (
          <Notice variant="neutral" title="You have a guest review">
            <p>
              Bring that review into your account only if you want to keep it. Your guest and
              account bags will remain separate.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              disabled={busy}
              onClick={() => void action(reviewActions.adopt)}
            >
              Keep guest review in my account
            </Button>
          </Notice>
        )}
      {draft && !state.suspended && orderStage && (
        <PlacementConfirmation
          key={`${state.partition}:${draft.id}`}
          review={state}
          clock={clock}
        />
      )}
      {draft && !orderStage && (
        <div
          hidden={state.suspended}
          className={
            state.suspended
              ? 'hidden'
              : 'grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)]'
          }
        >
          <DeliveryPanel key={`${state.partition}:${draft.id}`} review={state} clock={clock} />
          <div className="min-w-0 space-y-5 lg:order-2">
            <section
              aria-label="Current review"
              className="rounded-2xl border border-border-subtle bg-surface-container-lowest p-4 sm:p-6"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <h2 className="font-serif text-xl font-semibold">
                  {draft.source.kind === 'BUY_NOW' ? 'Buy now selection' : 'Complete bag selection'}
                </h2>
                <p className="text-sm font-semibold">
                  {expired
                    ? 'Expired'
                    : draft.status === 'ABANDONED'
                      ? 'Abandoned'
                      : 'Active review'}
                </p>
              </div>
              <ReviewItems draft={draft} handles={state.handles} products={products} />
              <p className="text-sm text-on-surface-variant">
                Review expires{' '}
                <time dateTime={draft.expiresAt}>{new Date(draft.expiresAt).toLocaleString()}</time>
                .
              </p>
              {draft.sourceReviewRequired && (
                <Notice className="mt-4" variant="warning" title="Review your account bag">
                  This selection came from a guest bag. Choose your current account bag explicitly,
                  or return to the product to start a separate review.
                </Notice>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                {draft.source.kind === 'CART' && (
                  <Button
                    variant="outline"
                    disabled={
                      busy || pending || privatePending || expired || draft.status !== 'ACTIVE'
                    }
                    onClick={() => void action(reviewActions.refreshCart)}
                  >
                    {draft.sourceReviewRequired
                      ? 'Use my current account bag'
                      : 'Review current bag'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={
                    busy || pending || privatePending || expired || draft.status !== 'ACTIVE'
                  }
                  onClick={() => void action(reviewActions.abandon)}
                >
                  Abandon review
                </Button>
              </div>
            </section>
            <QuotePanel
              key={`${state.partition}:${draft.id}`}
              review={state}
              clock={clock}
              products={products}
            />
            <PlacementPanel key={`${state.partition}:${draft.id}`} review={state} clock={clock} />
          </div>
        </div>
      )}
      {!draft && !busy && !pending && !state.guestCandidate && (
        <p className="rounded-2xl border border-border-subtle p-6">
          No review is open for this shopper. Start with a product or your bag.
        </p>
      )}
      {state.partition === 'guest' && !orderStage && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="ghost"
            disabled={busy || pending || privatePending}
            onClick={() =>
              void action(async () => {
                await reviewActions.revoke();
                router.push('/cart');
              })
            }
          >
            End guest review session
          </Button>
          <Button
            variant="ghost"
            disabled={busy || pending || privatePending}
            onClick={() => {
              reviewActions.freshGuest();
              router.push('/cart');
            }}
          >
            Start fresh from my bag
          </Button>
        </div>
      )}
    </main>
  );
}
