'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { CartLine } from '@/features/cart/components/cart-line';
import { cartIsBusy, confirmedCartCount } from '@/features/cart/types';
import { useCartSnapshot } from '@/features/cart/use-cart';
import { formatMoney } from '@/lib/format/money';

export function CartDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return isOpen ? <OpenCartDrawer onClose={onClose} /> : null;
}

function OpenCartDrawer({ onClose }: { onClose: () => void }) {
  const snapshot = useCartSnapshot();
  const cart = snapshot.confirmed;
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    close.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  const message = snapshot.issue?.message ?? snapshot.notice;
  const loading = snapshot.mode === 'idle' || snapshot.mode === 'loading';
  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent text-on-surface backdrop:bg-scrim"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] min-h-0 flex-col rounded-t-2xl bg-surface-container-lowest shadow-modal sm:inset-y-0 sm:start-auto sm:w-full sm:max-w-md sm:max-h-none sm:rounded-none">
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
          <Button ref={close} variant="ghost" onClick={onClose} aria-label="Close shopping bag">
            Close
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
          <div role="status" className="break-words text-sm text-on-surface-variant">
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
                  key={line.id}
                  cart={cart}
                  line={line}
                  surface="drawer"
                  busy={cartIsBusy(snapshot)}
                  onNavigate={onClose}
                />
              ))}
            </div>
          ) : (
            (cart || snapshot.mode === 'empty') && (
              <p className="py-5 text-sm text-on-surface-variant">
                There are no items in your bag.
              </p>
            )
          )}
        </div>
        <footer className="shrink-0 space-y-2 border-t border-border-subtle px-4 py-3">
          {cart && (
            <p className="flex flex-wrap justify-between gap-x-3 text-sm font-semibold tabular-nums">
              <span>Merchandise total</span>
              <span>{formatMoney(cart.merchandiseNet, cart.currency)}</span>
            </p>
          )}
          <Link
            className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-hover"
            href="/cart"
            onClick={onClose}
          >
            Review full bag
          </Link>
        </footer>
      </section>
    </dialog>
  );
}
