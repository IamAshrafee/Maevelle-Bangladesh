'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { notifyCartChanged } from '@/features/cart/cart-events';
import {
  ShoppingBagIcon,
  CloseIcon,
  LockIcon,
  ArrowRightIcon,
  VerifiedIcon,
  TruckIcon,
  TagIcon,
  StorefrontIcon,
} from '@/components/ui/icons';

interface CartView {
  currency: string;
  version: number;
  merchandiseGross: string;
  discountTotal: string;
  merchandiseNet: string;
  appliedCoupons: readonly string[];
  lines: readonly {
    id: string;
    productTitle: string;
    productHandle: string;
    mediaAssetId: string | null;
    options: readonly { name: string; value: string }[];
    sku: string;
    quantity: string;
    unitPrice: string | null;
    compareAtUnitPrice: string | null;
    gross: string;
    discount: string;
    net: string;
    availability: string;
  }[];
}

function money(value: string, currency: string) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

const availabilityMessage: Record<string, string> = {
  UNAVAILABLE: 'This item is currently out of stock.',
  INSUFFICIENT_CURRENT_STOCK: 'Only part of this requested quantity is currently available.',
  UNPRICED: 'The price for this selection is no longer available.',
};

export default function CartPage() {
  const [cart, setCart] = useState<CartView>();
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [message, setMessage] = useState('');
  const [busyLine, setBusyLine] = useState<string>();

  const reload = async () => {
    try {
      const response = await fetch('/api/storefront/v1/carts/current', { credentials: 'include' });
      if (response.ok) setCart(((await response.json()) as ApiEnvelope<CartView>).data);
    } catch {
      // Ignore network errors on initial mount
    } finally {
      setState('ready');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  async function mutate(path: string, init: RequestInit) {
    if (!cart) return;
    const response = await fetch(`/api/storefront/v1/carts/current${path}`, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    if (!response.ok)
      throw new Error(
        'Your bag changed or this item is no longer available. Review the latest details and try again.',
      );
    setCart(((await response.json()) as ApiEnvelope<CartView>).data);
    notifyCartChanged();
  }

  async function update(lineId: string, next: string) {
    setBusyLine(lineId);
    setMessage('');
    try {
      await mutate(`/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: next, version: cart?.version }),
      });
      setMessage('Quantity updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update your bag.');
    } finally {
      setBusyLine(undefined);
    }
  }

  async function remove(lineId: string) {
    setBusyLine(lineId);
    setMessage('');
    try {
      await mutate(`/lines/${lineId}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: cart?.version }),
      });
      setMessage('Item removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove the item.');
    } finally {
      setBusyLine(undefined);
    }
  }

  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('couponCode') ?? '').trim();
    if (!code) return;
    setMessage('');
    try {
      await mutate('/coupons', {
        method: 'POST',
        body: JSON.stringify({ couponCode: code, version: cart?.version }),
      });
      form.reset();
      setMessage('Promotion applied.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That promotion could not be applied.');
    }
  }

  async function removeCoupon(code: string) {
    try {
      await mutate(`/coupons/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: cart?.version }),
      });
      setMessage('Promotion removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promotion could not be removed.');
    }
  }

  // 1. Loading State
  if (state === 'loading') {
    return (
      <main className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
        <p className="font-sans text-xs sm:text-sm text-on-surface-variant font-medium">
          Loading your curated bag…
        </p>
      </main>
    );
  }

  // 2. Empty Cart State
  if (!cart || cart.lines.length === 0) {
    return (
      <main className="min-h-screen bg-surface py-12 px-4 sm:px-6">
        <div className="max-w-xl mx-auto rounded-2xl bg-surface-container-lowest p-8 sm:p-12 shadow-sm border border-border-subtle flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <ShoppingBagIcon size={28} />
          </div>

          <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-secondary mb-1">
            Your Bag is Empty
          </span>

          <h1 className="font-serif text-2xl sm:text-3xl font-medium text-on-surface mb-2">
            Find something you will love
          </h1>

          <p className="font-sans text-xs sm:text-sm text-on-surface-variant max-w-md leading-relaxed mb-6">
            Explore our curated vault of handcrafted heirloom jewelry, silk scarves, and accessories, then return here to complete your order.
          </p>

          <Link
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-primary text-on-primary font-sans text-xs sm:text-sm font-semibold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-sm"
            href="/categories"
          >
            <StorefrontIcon size={18} />
            <span>Explore Collection</span>
          </Link>
        </div>
      </main>
    );
  }

  const canCheckout = cart.lines.every((line) => line.availability === 'AVAILABLE');

  // 3. Active Cart
  return (
    <main className="min-h-screen bg-surface py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* Breadcrumb & Header */}
        <div className="flex flex-col gap-2">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-on-surface-variant font-medium">
            <Link className="hover:text-primary transition-colors" href="/">
              Home
            </Link>
            <span>/</span>
            <span className="text-on-surface font-semibold">Bag</span>
          </nav>

          <div className="flex items-baseline justify-between border-b border-border-subtle pb-4">
            <div>
              <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-secondary block">
                Atelier Selection
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-on-surface">
                Your Bag
              </h1>
            </div>

            <span className="font-sans text-xs sm:text-sm text-on-surface-variant">
              {cart.lines.length} {cart.lines.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>

        {/* Transient Status Message */}
        {message ? (
          <div
            className="p-3.5 rounded-xl bg-primary-fixed/30 border border-primary-fixed-dim text-primary text-xs font-medium flex items-center justify-between animate-in fade-in"
            role="status"
          >
            <span>{message}</span>
            <button
              aria-label="Dismiss message"
              className="text-primary hover:opacity-75"
              onClick={() => setMessage('')}
              type="button"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ) : null}

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Line Items List */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="rounded-2xl bg-surface-container-lowest p-4 sm:p-6 shadow-sm border border-border-subtle flex flex-col divide-y divide-border-subtle">
              {cart.lines.map((line) => {
                const isBusy = busyLine === line.id;
                const isUnavailable = line.availability !== 'AVAILABLE';

                return (
                  <article className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3" key={line.id}>
                    <div className="flex items-start gap-4">
                      {/* Media Thumbnail */}
                      <Link
                        className="relative size-20 sm:size-24 rounded-xl overflow-hidden bg-surface-container shrink-0 border border-border-subtle flex items-center justify-center hover:opacity-90 transition-opacity"
                        href={`/products/${line.productHandle}`}
                      >
                        {line.mediaAssetId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={line.productTitle}
                            className="size-full object-cover"
                            height="240"
                            src={`/api/media/public/${line.mediaAssetId}?rendition=thumbnail`}
                            width="180"
                          />
                        ) : (
                          <div className="size-full flex items-center justify-center text-outline">
                            <ShoppingBagIcon size={24} />
                          </div>
                        )}
                      </Link>

                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h2 className="font-serif text-sm sm:text-base font-semibold text-on-surface hover:text-primary transition-colors truncate">
                              <Link href={`/products/${line.productHandle}`}>
                                {line.productTitle}
                              </Link>
                            </h2>

                            <button
                              aria-label={`Remove ${line.productTitle} from bag`}
                              className="text-on-surface-variant hover:text-error active:scale-95 transition-all p-1 -mr-1"
                              disabled={isBusy}
                              onClick={() => void remove(line.id)}
                              title="Remove item"
                              type="button"
                            >
                              <CloseIcon size={16} />
                            </button>
                          </div>

                          {line.options.length ? (
                            <p className="font-sans text-xs text-on-surface-variant mt-0.5 truncate">
                              {line.options.map((option) => `${option.name}: ${option.value}`).join(' · ')}
                            </p>
                          ) : (
                            <p className="font-mono text-[11px] text-on-surface-variant mt-0.5">
                              SKU {line.sku}
                            </p>
                          )}
                        </div>

                        {/* Pricing & Quantity Actions */}
                        <div className="flex items-end justify-between gap-3 mt-3 pt-2 border-t border-border-subtle/50">
                          {/* Stepper */}
                          <div className="flex items-center gap-1">
                            <label className="sr-only" htmlFor={`qty-${line.id}`}>
                              Quantity
                            </label>
                            <div className="flex items-center h-8 rounded-lg bg-surface-container-low border border-border-subtle">
                              <button
                                aria-label="Decrease quantity"
                                className="size-8 flex items-center justify-center text-on-surface hover:text-primary disabled:opacity-30 transition-colors"
                                disabled={isBusy || Number(line.quantity) <= 1}
                                onClick={() => void update(line.id, String(Math.max(1, Number(line.quantity) - 1)))}
                                type="button"
                              >
                                −
                              </button>
                              <span className="w-8 text-center font-mono text-xs font-semibold tabular-nums text-on-surface">
                                {line.quantity}
                              </span>
                              <button
                                aria-label="Increase quantity"
                                className="size-8 flex items-center justify-center text-on-surface hover:text-primary disabled:opacity-30 transition-colors"
                                disabled={isBusy}
                                onClick={() => void update(line.id, String(Number(line.quantity) + 1))}
                                type="button"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Line Price */}
                          <div className="text-right">
                            {line.compareAtUnitPrice && (
                              <del className="font-mono text-[11px] text-on-surface-variant tabular-nums block">
                                {money(line.compareAtUnitPrice, cart.currency)}
                              </del>
                            )}
                            <span className="font-mono text-sm sm:text-base font-bold text-on-surface tabular-nums">
                              {money(line.net, cart.currency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Availability Alert Callout */}
                    {isUnavailable ? (
                      <div className="p-2.5 rounded-lg bg-warning-subtle text-warning-foreground border border-warning/20 text-xs font-medium">
                        {availabilityMessage[line.availability] ?? 'Item is currently unavailable.'}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {/* Reassurance Banner */}
            <div className="p-4 rounded-2xl bg-surface-container-lowest border border-border-subtle flex items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <TruckIcon size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="font-sans text-xs font-semibold text-on-surface">
                    Doorstep Inspection Supported
                  </span>
                  <span className="font-sans text-[11px] text-on-surface-variant">
                    Inspect your velvet jewelry box upon rider arrival before sharing OTP.
                  </span>
                </div>
              </div>
              <VerifiedIcon className="text-secondary shrink-0" size={18} />
            </div>
          </div>

          {/* Right Column (5 cols, sticky): Order Summary */}
          <aside
            aria-label="Order summary sidebar"
            className="lg:col-span-5 sticky top-24 rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-border-subtle flex flex-col gap-4"
          >
            <h2 className="font-serif text-lg sm:text-xl font-bold text-on-surface pb-3 border-b border-border-subtle">
              Order Summary
            </h2>

            {/* Breakdown */}
            <div className="flex flex-col gap-2.5 text-xs text-on-surface-variant">
              <div className="flex justify-between items-center">
                <span>Merchandise Subtotal</span>
                <span className="font-mono font-semibold text-on-surface tabular-nums">
                  {money(cart.merchandiseGross, cart.currency)}
                </span>
              </div>

              {Number(cart.discountTotal) > 0 ? (
                <div className="flex justify-between items-center text-primary font-medium">
                  <span>Applied Discounts</span>
                  <span className="font-mono font-semibold tabular-nums">
                    −{money(cart.discountTotal, cart.currency)}
                  </span>
                </div>
              ) : null}

              <div className="flex justify-between items-center">
                <span>Estimated Delivery</span>
                <span className="font-sans text-[11px] text-on-surface-variant">
                  Calculated at checkout (from ৳70)
                </span>
              </div>

              {/* Total Line */}
              <div className="my-1 h-px w-full bg-border-subtle" />

              <div className="flex justify-between items-baseline pt-1">
                <span className="font-serif text-base font-semibold text-on-surface">
                  Estimated Total
                </span>
                <div className="text-right">
                  <span className="font-mono text-xl sm:text-2xl font-bold text-primary tabular-nums">
                    {money(cart.merchandiseNet, cart.currency)}
                  </span>
                  <p className="font-sans text-[10px] text-on-surface-variant">VAT inclusive</p>
                </div>
              </div>
            </div>

            {/* Coupon Application Form */}
            <form className="flex flex-col gap-2 pt-2 border-t border-border-subtle" onSubmit={applyCoupon}>
              <label className="font-sans text-xs font-semibold text-on-surface" htmlFor="cart-coupon-input">
                Voucher / Promotion Code
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="absolute left-3 top-2.5 text-on-surface-variant pointer-events-none">
                    <TagIcon size={14} />
                  </div>
                  <input
                    className="w-full h-10 pl-8 pr-3 rounded-xl bg-surface-container-low text-xs font-mono uppercase text-on-surface placeholder:text-outline border border-border-subtle focus:outline-none focus:border-primary"
                    id="cart-coupon-input"
                    name="couponCode"
                    placeholder="MAEVELLEFIRST"
                  />
                </div>
                <button
                  className="h-10 px-4 rounded-xl bg-surface-container-high text-on-surface font-sans text-xs font-semibold hover:bg-surface-container-highest active:scale-95 transition-all border border-border-subtle cursor-pointer shrink-0"
                  type="submit"
                >
                  Apply
                </button>
              </div>
            </form>

            {/* Applied Coupons List */}
            {cart.appliedCoupons.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {cart.appliedCoupons.map((coupon) => (
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-fixed text-primary font-mono text-xs font-bold"
                    key={coupon}
                  >
                    <span>{coupon}</span>
                    <button
                      aria-label={`Remove coupon ${coupon}`}
                      className="hover:text-primary-hover active:scale-90 transition-transform"
                      onClick={() => void removeCoupon(coupon)}
                      type="button"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Proceed to Checkout CTA Button */}
            <div className="pt-2 flex flex-col gap-2">
              <Link
                aria-disabled={!canCheckout}
                className={`w-full h-12 rounded-xl bg-primary text-on-primary font-sans text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-150 ${
                  canCheckout
                    ? 'hover:bg-primary-hover active:scale-[0.98] cursor-pointer'
                    : 'opacity-50 pointer-events-none cursor-not-allowed'
                }`}
                href="/checkout"
              >
                <span>Proceed to Checkout</span>
                <ArrowRightIcon size={16} />
              </Link>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-on-surface-variant pt-1">
                <LockIcon className="text-secondary" size={13} />
                <span>256-Bit Encrypted Guest Checkout</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
