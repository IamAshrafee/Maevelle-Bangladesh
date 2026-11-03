'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { cartStore } from '../browser-runtime';
import { CartRecoveryActions } from './cart-recovery-actions';
import { useCartSnapshot } from '../use-cart';

/** Small shared recovery surface, not the Phase02 drawer or page redesign. */
export function CartFeedback() {
  const state = useCartSnapshot();
  const status = useRef<HTMLDivElement>(null);
  const [acting, setActing] = useState(false);
  async function act(task: () => Promise<unknown>) {
    setActing(true);
    try {
      await task();
    } catch {
      /* The controller retains typed recovery state. */
    } finally {
      setActing(false);
      status.current?.focus();
    }
  }
  const message = state.issue?.message ?? state.notice;
  return (
    <div
      className="mx-auto w-full min-w-0 max-w-7xl break-words px-4 sm:px-6"
      id="cart-feedback"
      ref={status}
      tabIndex={-1}
    >
      {message || ['pending', 'initializing', 'resetting'].includes(state.sync) ? (
        <Notice
          variant={state.issue ? 'warning' : 'info'}
          role="status"
          aria-live="polite"
          title={state.mode === 'ambiguous' ? 'Choose a shopping bag' : 'Shopping bag'}
        >
          <p>
            {message ??
              (state.sync === 'initializing'
                ? 'Establishing your bag session…'
                : 'Saving your bag action…')}
          </p>
          {!state.recoveryPersisted && state.pending ? (
            <p className="mt-2">
              Browser storage is unavailable for this action. Keep this tab open until its result is
              confirmed.
            </p>
          ) : null}
          {state.mode === 'ambiguous' ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Available shopping bags">
              {state.contexts.map((context, index) => (
                <Button
                  key={context}
                  variant="outline"
                  disabled={acting}
                  onClick={() => void act(() => cartStore.selectContext(context))}
                >
                  Review bag {index + 1}
                </Button>
              ))}
            </div>
          ) : null}
          {state.mode === 'ready' && state.contexts.length > 1 ? (
            <Button
              className="mt-3"
              variant="outline"
              disabled={acting || Boolean(state.pending)}
              onClick={() => void act(() => cartStore.reviewContexts())}
            >
              Review other bags
            </Button>
          ) : null}
          <CartRecoveryActions state={state} acting={acting} act={act} />
          {state.issue &&
          !state.pending &&
          state.mode !== 'ambiguous' &&
          state.issue.recovery !== 'wait' ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={acting}
                onClick={() => void act(() => cartStore.reconcile())}
              >
                Check bag again
              </Button>
              {state.issue.recovery === 'sign-in' ? (
                <Link
                  className="inline-flex min-h-12 items-center text-primary underline"
                  href="/account"
                >
                  Go to your account
                </Link>
              ) : null}
              <Link
                className="inline-flex min-h-12 items-center text-primary underline"
                href="/cart"
              >
                Review bag
              </Link>
            </div>
          ) : null}
        </Notice>
      ) : (
        <div role="status" aria-live="polite" />
      )}
    </div>
  );
}
