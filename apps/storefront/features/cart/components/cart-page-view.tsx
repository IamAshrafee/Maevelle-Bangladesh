'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { CartClearAction } from './cart-clear-action';
import { QuantityStepper } from '@/components/commerce/quantity-stepper';
import { cartStore } from '@/features/cart/browser-runtime';
import { cartIsBusy } from '../types';
import { useCartSnapshot } from '@/features/cart/use-cart';
import { formatMoney, wholeQuantity } from '@/lib/format/money';
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

const availabilityMessage: Record<string, string> = {
  UNAVAILABLE: 'This item is currently out of stock.',
  INSUFFICIENT_CURRENT_STOCK: 'Only part of this requested quantity is currently available.',
  UNPRICED: 'The price for this selection is no longer available.',
};

export function CartPageView() {
  const snapshot = useCartSnapshot();
  const cart = snapshot.confirmed ?? undefined;
  const command = snapshot.pending?.command;
  const busyLine =
    command && (command.kind === 'set' || command.kind === 'remove') ? command.lineId : undefined;
  const waiting = cartIsBusy(snapshot);
  const update = (lineId: string, next: string) => {
    void cartStore.setQuantity(lineId, next).catch(() => undefined);
  };
  const remove = (lineId: string) => {
    void cartStore.removeItem(lineId).catch(() => undefined);
  };
  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('couponCode') ?? '').trim();
    if (!code) return;
    try {
      await cartStore.applyCoupon(code);
      if (form.isConnected) form.reset();
    } catch {
      /* Shared recovery remains visible. */
    }
  }
  const removeCoupon = (code: string) => {
    void cartStore.removeCoupon(code).catch(() => undefined);
  };
  // 1. Loading State
  if (!cart && (snapshot.mode === 'loading' || snapshot.mode === 'idle')) {
    return (
      <main className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
        <p className="font-sans text-xs sm:text-sm text-on-surface-variant font-medium">
          Loading your curated bag…
        </p>
      </main>
    );
  }

  if (!cart && snapshot.mode !== 'empty')
    return (
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="font-serif text-3xl text-on-surface">Your shopping bag</h1>
        <p className="mt-4 text-on-surface-variant">
          Review the bag message above to continue. Your saved items have not been erased.
        </p>
        <Link
          className="mt-6 inline-flex min-h-12 items-center text-primary underline"
          href="/categories"
        >
          Continue shopping
        </Link>
      </main>
    );

  // 2. Empty Cart State
  if (!cart || (cart.lines.length === 0 && cart.appliedCoupons.length === 0)) {
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
            Explore our curated vault of handcrafted heirloom jewelry, silk scarves, and
            accessories, then return here to complete your order.
          </p>

          <Link
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-sans text-xs font-semibold text-on-primary shadow-sm transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] sm:text-sm"
            href="/categories"
          >
            <StorefrontIcon size={18} />
            <span>Explore Collection</span>
          </Link>
        </div>
      </main>
    );
  }

  const canCheckout =
    !waiting &&
    snapshot.contexts.length < 2 &&
    cart.lines.every((line) => line.availability === 'AVAILABLE');

  // 3. Active Cart
  return (
    <main className="min-h-screen bg-surface py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* Breadcrumb & Header */}
        <div className="flex flex-col gap-2">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs text-on-surface-variant font-medium"
          >
            <Link className="hover:text-primary transition-colors" href="/">
              Home
            </Link>
            <span>/</span>
            <span className="text-on-surface font-semibold">Bag</span>
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
            <div>
              <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-secondary block">
                Curated Selection
              </span>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-on-surface">
                Your Bag
              </h1>
            </div>

            <span className="font-sans text-xs sm:text-sm text-on-surface-variant">
              {cart.lines.length} {cart.lines.length === 1 ? 'item' : 'items'}
            </span>
            <CartClearAction />
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Line Items List */}
          <div className="min-w-0 lg:col-span-7 flex flex-col gap-4">
            <div className="rounded-2xl bg-surface-container-lowest p-4 sm:p-6 shadow-sm border border-border-subtle flex flex-col divide-y divide-border-subtle">
              {cart.lines.map((line) => {
                const isBusy = waiting || busyLine === line.id;
                const isUnavailable = line.availability !== 'AVAILABLE';
                const quantity = wholeQuantity(line.quantity);

                return (
                  <article className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3" key={line.id}>
                    <div className="flex flex-wrap items-start gap-4">
                      {/* Media Thumbnail */}
                      <Link
                        className="relative size-20 sm:size-24 rounded-xl overflow-hidden bg-surface-container shrink-0 border border-border-subtle flex items-center justify-center hover:opacity-90 transition-opacity"
                        href={`/products/${line.productHandle}`}
                      >
                        {line.mediaAssetId ? (
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
                      <div className="flex-1 basis-48 min-w-0 flex flex-col justify-between self-stretch">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h2 className="font-serif text-sm sm:text-base font-semibold text-on-surface hover:text-primary transition-colors break-words">
                              <Link href={`/products/${line.productHandle}`}>
                                {line.productTitle}
                              </Link>
                            </h2>

                            <button
                              aria-label={`Remove ${line.productTitle} from bag`}
                              className="flex min-h-12 min-w-12 items-center justify-center text-on-surface-variant transition-[color,transform] duration-150 hover:text-error active:scale-95"
                              disabled={isBusy}
                              onClick={() => void remove(line.id)}
                              title="Remove item"
                              type="button"
                            >
                              <CloseIcon size={16} />
                            </button>
                          </div>

                          {line.options.length ? (
                            <p className="font-sans text-xs text-on-surface-variant mt-0.5 break-words">
                              {line.options
                                .map((option) => `${option.name}: ${option.value}`)
                                .join(' · ')}
                            </p>
                          ) : (
                            <p className="font-mono text-[11px] text-on-surface-variant mt-0.5 break-all">
                              SKU {line.sku}
                            </p>
                          )}
                        </div>

                        {/* Pricing & Quantity Actions */}
                        <div className="flex flex-wrap items-end justify-between gap-3 mt-3 pt-2 border-t border-border-subtle/50">
                          {/* Stepper */}
                          <div className="flex items-center gap-1">
                            <QuantityStepper
                              label={`Quantity for ${line.productTitle}`}
                              disabled={isBusy}
                              onChange={(next) => void update(line.id, String(next))}
                              size="touch"
                              value={quantity}
                            />
                          </div>

                          {/* Line Price */}
                          <div className="text-right">
                            {line.compareAtUnitPrice && (
                              <del className="font-mono text-[11px] text-on-surface-variant tabular-nums block">
                                {formatMoney(line.compareAtUnitPrice, cart.currency)}
                              </del>
                            )}
                            <span className="font-mono text-sm sm:text-base font-bold text-on-surface tabular-nums">
                              {formatMoney(line.net, cart.currency)}
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
            className="min-w-0 lg:col-span-5 lg:sticky top-24 rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-border-subtle flex flex-col gap-4"
          >
            <h2 className="font-serif text-lg sm:text-xl font-bold text-on-surface pb-3 border-b border-border-subtle">
              Order Summary
            </h2>

            {/* Breakdown */}
            <div className="flex flex-col gap-2.5 text-xs text-on-surface-variant">
              <div className="flex justify-between items-center">
                <span>Merchandise Subtotal</span>
                <span className="font-mono font-semibold text-on-surface tabular-nums">
                  {formatMoney(cart.merchandiseGross, cart.currency)}
                </span>
              </div>

              {Number(cart.discountTotal) > 0 ? (
                <div className="flex justify-between items-center text-primary font-medium">
                  <span>Applied Discounts</span>
                  <span className="font-mono font-semibold tabular-nums">
                    −{formatMoney(cart.discountTotal, cart.currency)}
                  </span>
                </div>
              ) : null}

              <div className="flex justify-between items-center">
                <span>Estimated Delivery</span>
                <span className="font-sans text-[11px] text-on-surface-variant">
                  Calculated at checkout
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
                    {formatMoney(cart.merchandiseNet, cart.currency)}
                  </span>
                  <p className="font-sans text-[10px] text-on-surface-variant">Merchandise only</p>
                </div>
              </div>
            </div>

            {/* Coupon Application Form */}
            <form
              className="flex flex-col gap-2 pt-2 border-t border-border-subtle"
              onSubmit={applyCoupon}
            >
              <label
                className="font-sans text-xs font-semibold text-on-surface"
                htmlFor="cart-coupon-input"
              >
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
                    disabled={waiting}
                    name="couponCode"
                    placeholder="MAEVELLEFIRST"
                  />
                </div>
                <button
                  className="h-10 shrink-0 cursor-pointer rounded-xl border border-border-subtle bg-surface-container-high px-4 font-sans text-xs font-semibold text-on-surface transition-[background-color,transform] duration-150 hover:bg-surface-container-highest active:scale-95"
                  disabled={waiting}
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
                      disabled={waiting}
                      className="flex min-h-12 min-w-12 items-center justify-center hover:text-primary-hover active:scale-90 transition-transform"
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
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-sm font-semibold text-on-primary shadow-sm transition-[background-color,opacity,transform] duration-150 ${
                  canCheckout
                    ? 'hover:bg-primary-hover active:scale-[0.98] cursor-pointer'
                    : 'opacity-50 pointer-events-none cursor-not-allowed'
                }`}
                href="/checkout"
                tabIndex={canCheckout ? 0 : -1}
                onClick={(event) => {
                  if (!canCheckout) event.preventDefault();
                }}
              >
                <span>Proceed to Checkout</span>
                <ArrowRightIcon size={16} />
              </Link>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-on-surface-variant pt-1">
                <LockIcon className="text-secondary" size={13} />
                <span>Adding items does not reserve stock.</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
