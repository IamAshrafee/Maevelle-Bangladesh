'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CartMergeGuestContextDto, CartMergePreviewDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cartStore } from '../browser-runtime';
import { cartIssue } from '../errors';
import { listMergeGuests, previewMerge } from '../merge-api';
import { cartIsBusy } from '../types';
import { useCartObservation } from '../use-cart-observation';
import { useCartSnapshot } from '../use-cart';
import { CartMergePlan } from './cart-merge-plan';

export function CartMergePage() {
  const state = useCartSnapshot();
  const partition = cartStore.accountPartition();
  const canReview = partition && !['expired', 'error', 'unavailable'].includes(state.mode);
  return (
    <main className="mx-auto min-h-[60vh] max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/cart"
        className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
      >
        Back to your bag
      </Link>
      <header className="space-y-2">
        <h1 className="font-serif text-3xl font-semibold">Review a guest bag</h1>
        <p className="text-on-surface-variant">
          Choose which bag to review. You can keep shopping with your account bag and decide later.
        </p>
      </header>
      {canReview ? (
        <MergeWorkspace key={partition} partition={partition} />
      ) : state.mode === 'loading' || state.mode === 'idle' ? (
        <p role="status">Checking your shopper session…</p>
      ) : state.pending || (partition && state.issue?.recovery !== 'sign-in') ? (
        <p role="status">Check the bag message above to continue.</p>
      ) : (
        <Link href="/account" className="inline-flex min-h-12 items-center text-primary underline">
          Go to your account
        </Link>
      )}
    </main>
  );
}

function MergeWorkspace({ partition }: { partition: string }) {
  const router = useRouter();
  const state = useCartSnapshot();
  const [guests, setGuests] = useState<readonly CartMergeGuestContextDto[] | null>(null);
  const [selected, setSelected] = useState<CartMergeGuestContextDto | null>(null);
  const [review, setReview] = useState<CartMergePreviewDto | null>(null);
  useCartObservation(state.owner, 'MERGE_REVIEW', review !== null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [listRequest, setListRequest] = useState(0);
  const action = useRef<AbortController | null>(null);
  const status = useRef<HTMLDivElement>(null);
  const blockedByGuest = cartStore.guestRecoveryPending();
  const stale =
    review &&
    (state.confirmed?.version !== Number(review.accountRevision) ||
      state.confirmed?.calculationFingerprint !== review.account.calculationFingerprint);
  const locked = busy || cartIsBusy(state) || blockedByGuest;

  useEffect(() => {
    const abort = new AbortController();
    void listMergeGuests(partition, abort.signal)
      .then((items) => {
        if (!abort.signal.aborted && cartStore.accountPartition() === partition) setGuests(items);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted || cartStore.accountPartition() !== partition) return;
        const issue = cartIssue(error, Date.now());
        setNotice(
          issue.recovery === 'sign-in'
            ? 'Your guest or shopper session is unavailable. Check your account or browser cookies.'
            : 'We could not check this browser for guest bags. Try checking again.',
        );
      });
    return () => {
      abort.abort();
      action.current?.abort();
    };
  }, [partition, listRequest]);

  const mergeConfirmed = !state.pending && state.confirmed?.outcome?.operation === 'merge_guest';
  useEffect(() => {
    if (mergeConfirmed) router.replace('/cart');
  }, [mergeConfirmed, router]);

  async function inspect(guest: CartMergeGuestContextDto) {
    const abort = new AbortController();
    action.current?.abort();
    action.current = abort;
    setBusy(true);
    setNotice('');
    setReview(null);
    setSelected(guest);
    try {
      const cart = await cartStore.refresh();
      if (abort.signal.aborted || cartStore.accountPartition() !== partition) return;
      const current = cartStore.getSnapshot().confirmed;
      const account =
        current ??
        (cart === null && cartStore.getSnapshot().mode === 'empty'
          ? await cartStore.initialize()
          : null);
      if (!account || abort.signal.aborted || cartStore.accountPartition() !== partition)
        throw new Error('Your account bag could not be checked.');
      const result = await previewMerge(
        partition,
        {
          ownerContext: account.ownerContext,
          guestCartId: guest.cartId,
          guestOwnerContext: guest.ownerContext,
        },
        abort.signal,
      );
      if (!abort.signal.aborted && cartStore.accountPartition() === partition) setReview(result);
    } catch (error) {
      if (!abort.signal.aborted && cartStore.accountPartition() === partition)
        setNotice(cartIssue(error, Date.now()).message);
    } finally {
      if (!abort.signal.aborted && cartStore.accountPartition() === partition) {
        setBusy(false);
        status.current?.focus();
      }
    }
  }

  async function confirm() {
    if (!review || stale || locked || review.status !== 'READY') return;
    setBusy(true);
    setNotice('');
    try {
      await cartStore.mergeGuest({
        ...review.selection,
        version: Number(review.accountRevision),
        reviewFingerprint: review.reviewFingerprint,
      });
    } catch {
      if (cartStore.accountPartition() !== partition) return;
      if (cartStore.getSnapshot().pending)
        setNotice('Check the earlier merge using the recovery action above.');
      else {
        setReview(null);
        setNotice('This merge could not be confirmed. Review the latest bags before trying again.');
      }
    } finally {
      setBusy(false);
      status.current?.focus();
    }
  }

  return (
    <div className="space-y-5">
      {blockedByGuest && (
        <Notice variant="warning" title="An earlier guest bag change needs review">
          <p>
            Sign out and recover or review that change in the original guest bag before merging. You
            can continue using your account bag.
          </p>
        </Notice>
      )}
      <div ref={status} tabIndex={-1} role="status" aria-live="polite" className="scroll-mt-24">
        {busy
          ? 'Checking your bags…'
          : notice ||
            (stale
              ? 'Your account bag changed. Review an updated proposal before merging.'
              : review
                ? 'Merge review ready.'
                : '')}
      </div>
      {guests === null ? (
        notice ? (
          <Button
            variant="outline"
            onClick={() => {
              setNotice('');
              setListRequest((n) => n + 1);
            }}
          >
            Check for guest bags again
          </Button>
        ) : (
          <p role="status">Looking for guest bags…</p>
        )
      ) : guests.length === 0 ? (
        <Notice variant="info" title="No guest bags found">
          <p>Your account bag is ready for you to use.</p>
        </Notice>
      ) : (
        <section className="space-y-2" aria-labelledby="merge-choices">
          <h2 id="merge-choices" className="font-serif text-xl font-semibold">
            Guest bags on this browser
          </h2>
          {!state.confirmed && state.mode === 'empty' && (
            <p className="text-sm text-on-surface-variant">
              Reviewing will start an empty account bag for you.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {guests.map((guest, index) => (
              <Button
                key={guest.cartId}
                variant={selected?.cartId === guest.cartId ? 'secondary' : 'outline'}
                aria-pressed={selected?.cartId === guest.cartId}
                disabled={locked}
                onClick={() => void inspect(guest)}
                className="min-h-12"
              >
                Review guest bag {index + 1}
              </Button>
            ))}
          </div>
        </section>
      )}
      {review && !state.pending && <CartMergePlan review={review} />}
      {review && !state.pending && review.status === 'READY' && (
        <Button
          className="min-h-12"
          disabled={locked || Boolean(stale)}
          onClick={() => void confirm()}
        >
          Merge into my account bag
        </Button>
      )}
      <Link
        href="/cart"
        className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
      >
        Keep bags separate
      </Link>
    </div>
  );
}
