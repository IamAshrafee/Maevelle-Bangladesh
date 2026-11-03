'use client';

import Link from 'next/link';
import { ShoppingBagIcon } from '@/components/ui/icons';
import { CartClearAction } from './cart-clear-action';
import { CartLine } from './cart-line';
import { CartSummary } from './cart-summary';
import { cartIsBusy, confirmedCartCount } from '../types';
import { useEffect } from 'react';
import { cartStore } from '../browser-runtime';
import { useCartSnapshot } from '../use-cart';

export function CartPageView() {
  const snapshot = useCartSnapshot();
  useEffect(() => {
    void cartStore.refresh().catch(() => undefined);
  }, []);
  const cart = snapshot.confirmed;
  const busy = cartIsBusy(snapshot);
  const loading = snapshot.mode === 'loading' || snapshot.mode === 'idle';
  const empty = !cart?.lines.length && !cart?.appliedCoupons.length;

  return (
    <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-on-surface">
            {snapshot.owner === 'account' ? 'Your account bag' : 'Your shopping bag'}
          </h1>
          {cart && (
            <p className="mt-1 text-sm text-on-surface-variant">
              Items in bag · {confirmedCartCount(snapshot)}
            </p>
          )}
        </div>
        {!empty && <CartClearAction />}
      </header>

      {snapshot.owner === 'account' && (
        <aside className="mb-6 flex flex-wrap items-center justify-between gap-x-4 rounded-2xl border border-border-subtle px-4 py-2 sm:px-6">
          <p className="text-sm text-on-surface-variant">
            Your selections are saved to this account.
          </p>
          <Link
            href="/cart/merge"
            className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
          >
            Review guest bags
          </Link>
        </aside>
      )}

      {empty ? (
        <section className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border-subtle bg-surface-container-lowest p-6 text-center sm:p-10">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <ShoppingBagIcon size={26} />
          </span>
          <p className="text-on-surface-variant" role={loading ? 'status' : undefined}>
            {loading
              ? 'Loading your bag…'
              : cart || snapshot.mode === 'empty'
                ? 'Your bag is empty.'
                : 'Review the bag message above to continue.'}
          </p>
          {!loading && (
            <Link
              className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
              href="/categories"
            >
              Continue shopping
            </Link>
          )}
        </section>
      ) : (
        cart && (
          <div
            className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
            key={cart.ownerContext}
          >
            <section
              aria-label="Bag items"
              className="min-w-0 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-container-lowest px-4 sm:px-6"
            >
              <h2 className="sr-only">Bag items</h2>
              {cart.lines.length ? (
                cart.lines.map((line) => (
                  <CartLine key={line.id} cart={cart} line={line} busy={busy} surface="page" />
                ))
              ) : (
                <p className="py-4 text-sm text-on-surface-variant">
                  Your bag has coupons but no items.
                </p>
              )}
            </section>
            <CartSummary cart={cart} busy={busy} />
          </div>
        )
      )}
    </main>
  );
}
