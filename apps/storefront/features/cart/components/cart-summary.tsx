'use client';

import { useId, type FormEvent } from 'react';
import type { CartView } from '../types';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format/money';
import { cartStore } from '../browser-runtime';

export function CartSummary({ cart, busy }: { cart: CartView; busy: boolean }) {
  const input = useId();
  const selected = cart.commerceReview?.coupons;
  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('couponCode') ?? '').trim();
    if (!code || busy) return;
    try {
      await cartStore.applyCoupon(code);
      if (form.isConnected) form.reset();
    } catch {
      // The shared controller retains feedback and recovery.
    }
  }

  return (
    <aside
      className="min-w-0 space-y-4 rounded-2xl border border-border-subtle bg-surface-container-lowest p-4 sm:p-6"
      aria-label="Merchandise summary"
    >
      <h2 className="font-serif text-xl font-semibold">Merchandise summary</h2>
      <dl className="space-y-2 text-sm tabular-nums">
        <div className="flex flex-wrap justify-between gap-x-3">
          <dt>Subtotal</dt>
          <dd>{formatMoney(cart.merchandiseGross, cart.currency)}</dd>
        </div>
        {Number(cart.discountTotal) > 0 && (
          <div className="flex flex-wrap justify-between gap-x-3 text-primary">
            <dt>Current discounts</dt>
            <dd>−{formatMoney(cart.discountTotal, cart.currency)}</dd>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-x-3 border-t border-border-subtle pt-3 font-semibold">
          <dt>Merchandise total</dt>
          <dd>{formatMoney(cart.merchandiseNet, cart.currency)}</dd>
        </div>
      </dl>
      <form className="space-y-2 border-t border-border-subtle pt-4" onSubmit={applyCoupon}>
        <label className="block text-sm font-semibold" htmlFor={input}>
          Coupon code
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={input}
            name="couponCode"
            className="min-h-12 min-w-0 flex-1 basis-32 rounded-xl border border-border bg-surface px-3"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            minLength={2}
            maxLength={64}
            pattern="[A-Za-z0-9_\-]+"
            required
            disabled={busy}
          />
          <Button variant="outline" type="submit" disabled={busy}>
            Apply
          </Button>
        </div>
      </form>
      {cart.appliedCoupons.length > 0 && (
        <ul aria-label="Selected coupons" className="divide-y divide-border-subtle">
          {cart.appliedCoupons.map((code) => {
            const benefit = selected?.find((coupon) => coupon.code === code);
            return (
              <li className="flex flex-wrap items-center justify-between gap-x-3 py-1" key={code}>
                <div className="min-w-0 break-all text-sm">
                  <p className="font-semibold">{code}</p>
                  <p className="text-on-surface-variant">
                    {benefit?.status === 'EFFECTIVE'
                      ? `${formatMoney(benefit.discount, cart.currency)} current discount`
                      : benefit
                        ? 'Selected · No current discount'
                        : 'Selected'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  aria-label={`Remove coupon ${code}`}
                  disabled={busy}
                  onClick={() => void cartStore.removeCoupon(code).catch(() => undefined)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="space-y-1 border-t border-border-subtle pt-3 text-sm text-on-surface-variant">
        <p>Stock can change while items are in your bag. Delivery has yet to be checked.</p>
        <p>Online checkout is currently unavailable.</p>
      </div>
    </aside>
  );
}
