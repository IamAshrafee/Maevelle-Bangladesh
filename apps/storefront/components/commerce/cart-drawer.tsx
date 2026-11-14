'use client';

import { CheckoutEntry } from '@/features/checkout/components/checkout-entry';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { CartLine } from '@/features/cart/components/cart-line';
import { cartIsBusy, confirmedCartCount } from '@/features/cart/types';
import { useCartObservation } from '@/features/cart/use-cart-observation';
import { useCartSnapshot } from '@/features/cart/use-cart';
import { formatMoney } from '@/lib/format/money';

export function CartDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [isMounted, setIsMounted] = useState(false);
  const [dataState, setDataState] = useState<'closed' | 'open'>('closed');

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const frame = requestAnimationFrame(() => {
        setDataState('open');
      });
      return () => cancelAnimationFrame(frame);
    }

    setDataState('closed');
    const timer = window.setTimeout(() => {
      setIsMounted(false);
    }, 320); // 280ms duration + 40ms safety margin

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!isMounted || typeof document === 'undefined') {
    return null;
  }

  return (
    <OpenCartDrawer
      dataState={dataState}
      isOpen={isOpen}
      onAnimationEnd={() => !isOpen && setIsMounted(false)}
      onClose={onClose}
    />
  );
}

function OpenCartDrawer({
  dataState,
  isOpen,
  onAnimationEnd,
  onClose,
}: {
  dataState: 'closed' | 'open';
  isOpen: boolean;
  onAnimationEnd: () => void;
  onClose: () => void;
}) {
  const snapshot = useCartSnapshot();
  useCartObservation(snapshot.owner, 'DRAWER', true);
  const cart = snapshot.confirmed;
  const title = useId();
  const surfaceRef = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLElement>) => {
    if (
      e.target === surfaceRef.current &&
      (e.propertyName === 'transform' || e.propertyName === 'opacity') &&
      !isOpen
    ) {
      onAnimationEnd();
    }
  };

  const message = snapshot.issue?.message ?? snapshot.notice;
  const loading = snapshot.mode === 'idle' || snapshot.mode === 'loading';

  return createPortal(
    <div
      aria-labelledby={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-none"
      onKeyDown={handleKeyDown}
      role="dialog"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-auto fixed inset-0 bg-scrim bottom-sheet-backdrop"
        data-state={dataState}
        onClick={onClose}
      />

      {/* Surface */}
      <section
        className="pointer-events-auto relative z-10 mx-auto flex max-h-[90dvh] w-full min-h-0 flex-col rounded-t-2xl bg-surface-container-lowest shadow-modal bottom-sheet-surface sm:inset-y-0 sm:start-auto sm:w-full sm:max-w-md sm:max-h-none sm:rounded-none sm:translate-y-0 sm:data-[state=closed]:translate-x-full sm:data-[state=open]:translate-x-0"
        data-state={dataState}
        onTransitionEnd={handleTransitionEnd}
        ref={surfaceRef}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold" id={title}>
              Shopping bag
            </h2>
            {cart && (
              <p className="text-sm text-on-surface-variant">
                Items in bag · {confirmedCartCount(snapshot)}
              </p>
            )}
          </div>
          <Button aria-label="Close shopping bag" onClick={onClose} ref={close} variant="ghost">
            Close
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
          <div className="break-words text-sm text-on-surface-variant" role="status">
            {(message || loading || snapshot.pending) && (
              <p className="py-3">
                {message ?? (loading ? 'Loading your bag…' : 'Saving your bag action…')}
              </p>
            )}
          </div>
          {cart?.lines.length ? (
            <div className="divide-y divide-border-subtle" key={cart.ownerContext}>
              {cart.lines.map((line) => (
                <CartLine
                  busy={cartIsBusy(snapshot)}
                  cart={cart}
                  key={line.id}
                  line={line}
                  onNavigate={onClose}
                  surface="drawer"
                />
              ))}
            </div>
          ) : (
            (cart || snapshot.mode === 'empty') && (
              <div className="space-y-3 py-6 text-center">
                <p className="text-sm text-on-surface-variant">There are no items in your bag.</p>
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border-subtle px-4 text-sm font-semibold text-primary transition-[background-color,transform] duration-150 hover:bg-surface-container active:scale-98"
                  href="/categories"
                  onClick={onClose}
                >
                  Continue shopping
                </Link>
              </div>
            )
          )}
        </div>

        <footer className="shrink-0 space-y-2 border-t border-border-subtle px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          {cart && (
            <p className="flex flex-wrap justify-between gap-x-3 text-sm font-semibold tabular-nums">
              <span>Merchandise total</span>
              <span>{formatMoney(cart.merchandiseNet, cart.currency)}</span>
            </p>
          )}
          <Link
            className="flex min-h-12 items-center justify-center rounded-xl border border-border px-4 font-semibold text-on-surface transition-colors duration-150 hover:bg-surface-container-low"
            href="/cart"
            onClick={onClose}
          >
            View bag
          </Link>
          {cart && cart.lines.length > 0 && (
            <CheckoutEntry
              disabled={cartIsBusy(snapshot) || !cart.commerceReview?.merchandiseReady}
              handles={Object.fromEntries(
                cart.lines
                  .filter((line) => line.productHandle)
                  .map((line) => [line.variantId, line.productHandle]),
              )}
              label="Checkout"
              onContinue={onClose}
              source={{ kind: 'CART', cartId: cart.id, cartRevision: cart.intentRevision }}
            />
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
