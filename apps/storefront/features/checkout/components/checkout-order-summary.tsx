'use client';

import { useState } from 'react';

import {
  ChevronDownIcon,
  CloseIcon,
  LockIcon,
  ShoppingBagIcon,
  TagIcon,
  VerifiedIcon,
} from '@/components/ui/icons';
import type { UseCheckoutReturn } from '../use-checkout';

export interface CheckoutOrderSummaryProps {
  readonly checkout: UseCheckoutReturn;
  readonly isDesktop?: boolean;
}

export function CheckoutOrderSummary({
  checkout,
  isDesktop = false,
}: CheckoutOrderSummaryProps) {
  const {
    items,
    address,
    voucher,
    voucherInput,
    setVoucherInput,
    voucherError,
    subtotal,
    discount,
    shippingFee,
    formattedTotal,
    ctaLabel,
    isSummaryExpanded,
    toggleOrderSummary,
    handleApplyVoucher,
    handleRemoveVoucher,
    handlePrimaryAction,
    isSubmitting,
  } = checkout;

  const [isApplyingVoucher, setIsApplyingVoucher] = useState(false);

  const itemCount = items.reduce((acc, it) => acc + it.quantity, 0);

  const shippingLabel =
    address.zone === 'dhaka'
      ? 'Shipping (Inside Dhaka Express)'
      : 'Shipping (Nationwide Steadfast)';

  // RENDER DESKTOP CARD
  if (isDesktop) {
    return (
      <aside
        aria-label="Order summary sidebar"
        className="sticky top-24 rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-border-subtle"
      >
        {/* Card Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-secondary-fixed text-primary">
              <ShoppingBagIcon size={20} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold text-on-surface">Order Summary</h2>
              <p className="text-xs text-on-surface-variant">Review your bespoke parcel items</p>
            </div>
          </div>
          <span className="rounded-full bg-secondary-fixed px-2.5 py-0.5 text-xs font-semibold text-primary">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>

        {/* Line Items List */}
        <div className="divide-y divide-border-subtle/70 py-3 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => (
            <div className="flex items-center gap-3.5 py-3" key={item.id}>
              {/* Product Thumbnail */}
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-container border border-border-subtle">
                <img
                  alt={item.imageAlt}
                  className="h-full w-full object-cover"
                  src={item.imageUrl}
                />
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary shadow-xs">
                  {item.quantity}
                </span>
              </div>

              {/* Title & Pricing */}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-sans text-sm font-semibold text-on-surface">
                  {item.productTitle}
                </h3>
                <p className="truncate text-xs text-on-surface-variant">
                  {item.variantDescription}
                </p>
                <div className="mt-1 flex items-baseline gap-1.5 font-mono text-sm font-bold text-on-surface tabular-nums">
                  <span>৳{item.net.toLocaleString('en-BD')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Voucher Section */}
        <div className="pt-3 pb-4 border-t border-border-subtle">
          {voucher?.isApplied ? (
            <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3 border border-secondary-fixed">
              <div className="flex items-center gap-2">
                <TagIcon className="text-primary shrink-0" size={16} />
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-bold text-primary tracking-wider">
                    {voucher.code}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">{voucher.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary tabular-nums">
                  -৳{voucher.discount.toLocaleString('en-BD')}
                </span>
                <button
                  aria-label="Remove coupon"
                  className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                  onClick={handleRemoveVoucher}
                  type="button"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyVoucher();
              }}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <TagIcon
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-outline"
                    size={15}
                  />
                  <input
                    className="h-10 w-full rounded-lg bg-surface-container-low pl-9 pr-3 text-xs uppercase font-mono tracking-wider text-on-surface placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20 border border-border-subtle transition-colors duration-150"
                    placeholder="ENTER VOUCHER CODE"
                    type="text"
                    value={voucherInput}
                    onChange={(e) => setVoucherInput(e.target.value)}
                  />
                </div>
                <button
                  className="h-10 px-4 rounded-lg bg-secondary-fixed text-primary text-xs font-semibold hover:bg-secondary-container hover:text-on-secondary-container active:scale-95 transition-colors duration-150 transition-transform"
                  type="submit"
                >
                  Apply
                </button>
              </div>
              {voucherError ? (
                <p className="text-[11px] text-error font-medium">{voucherError}</p>
              ) : null}
            </form>
          )}
        </div>

        {/* Subtotal Calculation Breakdown */}
        <div className="flex flex-col gap-2 pt-3 border-t border-border-subtle text-xs text-on-surface-variant">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono font-semibold text-on-surface tabular-nums">
              ৳{subtotal.toLocaleString('en-BD')}
            </span>
          </div>

          {discount > 0 ? (
            <div className="flex justify-between text-primary">
              <span>First Order Voucher</span>
              <span className="font-mono font-semibold tabular-nums">
                -৳{discount.toLocaleString('en-BD')}
              </span>
            </div>
          ) : null}

          <div className="flex justify-between">
            <span>{shippingLabel}</span>
            <span className="font-mono font-semibold text-on-surface tabular-nums">
              ৳{shippingFee.toLocaleString('en-BD')}
            </span>
          </div>

          <div className="my-1.5 h-px w-full bg-border-subtle" />

          {/* Final Payable Total */}
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-serif text-base font-semibold text-on-surface">Total BDT</span>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-primary tabular-nums">
                {formattedTotal}
              </span>
              <span className="text-[11px] text-on-surface-variant">(VAT incl.)</span>
            </div>
          </div>
        </div>

        {/* Primary Desktop Action Button */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-on-primary font-sans text-sm font-semibold shadow-md hover:bg-primary-hover active:scale-[0.98] transition-colors duration-150 transition-transform disabled:opacity-50"
            disabled={isSubmitting}
            id="desktopPlaceOrderBtn"
            onClick={handlePrimaryAction}
            type="button"
          >
            {isSubmitting ? (
              <>
                <span className="size-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                <span>Processing Order...</span>
              </>
            ) : (
              <>
                <span>{ctaLabel}</span>
                <VerifiedIcon size={18} />
              </>
            )}
          </button>

          {/* Security & Guarantee Trust Seals */}
          <div className="flex items-center justify-center gap-2 text-center text-[11px] text-on-surface-variant">
            <LockIcon className="text-primary shrink-0" size={13} />
            <span>Encrypted checkout. Doorstep open-box inspection available.</span>
          </div>
        </div>
      </aside>
    );
  }

  // RENDER MOBILE ACCORDION
  return (
    <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm border border-border-subtle">
      {/* Accordion Toggle Header */}
      <button
        aria-controls="orderSummaryContent"
        aria-expanded={isSummaryExpanded}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-surface-container-low/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        id="summaryToggleBtn"
        onClick={toggleOrderSummary}
        type="button"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-secondary-fixed text-primary">
            <ShoppingBagIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-serif text-base font-semibold text-on-surface">
                Order Summary
              </span>
              <span className="rounded-full bg-secondary-fixed px-2 py-0.5 text-[11px] font-semibold text-primary">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              {voucher?.isApplied
                ? `Includes voucher ${voucher.code}`
                : 'Tap to view items & voucher'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold text-primary tabular-nums">
            {formattedTotal}
          </span>
          <ChevronDownIcon
            className={`text-primary transition-transform duration-200 ${
              isSummaryExpanded ? 'rotate-180' : ''
            }`}
            size={18}
          />
        </div>
      </button>

      {/* Collapsible Content */}
      {isSummaryExpanded ? (
        <div
          className="flex flex-col gap-3 px-4 pb-4 pt-1 border-t border-border-subtle animate-in fade-in slide-in-from-top-2 duration-150"
          id="orderSummaryContent"
        >
          {/* Items */}
          <div className="divide-y divide-border-subtle/70">
            {items.map((item) => (
              <div className="flex items-center gap-3 py-2.5" key={item.id}>
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-container border border-border-subtle">
                  <img
                    alt={item.imageAlt}
                    className="h-full w-full object-cover"
                    src={item.imageUrl}
                  />
                  <span className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
                    {item.quantity}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-sans text-sm font-semibold text-on-surface">
                    {item.productTitle}
                  </h4>
                  <p className="truncate text-xs text-on-surface-variant">
                    {item.variantDescription}
                  </p>
                  <span className="font-mono text-xs font-bold text-on-surface tabular-nums">
                    ৳{item.net.toLocaleString('en-BD')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Voucher Display / Form */}
          {voucher?.isApplied ? (
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-2.5 border border-secondary-fixed">
              <div className="flex items-center gap-2">
                <TagIcon className="text-primary shrink-0" size={16} />
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-bold text-primary tracking-wider">
                    {voucher.code}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">{voucher.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary tabular-nums">
                  -৳{voucher.discount.toLocaleString('en-BD')}
                </span>
                <button
                  aria-label="Remove coupon"
                  className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                  onClick={handleRemoveVoucher}
                  type="button"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex gap-2">
              <input
                className="h-9 flex-1 rounded-lg bg-surface-container-low px-3 font-mono text-xs uppercase tracking-wider text-on-surface placeholder:text-outline border border-border-subtle focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="ENTER PROMO CODE"
                type="text"
                value={voucherInput}
                onChange={(e) => setVoucherInput(e.target.value)}
              />
              <button
                className="h-9 px-3 rounded-lg bg-secondary-fixed text-primary text-xs font-semibold hover:bg-secondary-container active:scale-95 transition-colors duration-150 transition-transform"
                onClick={() => handleApplyVoucher()}
                type="button"
              >
                Apply
              </button>
            </div>
          )}
          {voucherError ? (
            <p className="text-[11px] text-error font-medium">{voucherError}</p>
          ) : null}

          {/* Subtotal Calculation Breakdown */}
          <div className="flex flex-col gap-1.5 pt-1 text-xs text-on-surface-variant">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono font-semibold text-on-surface tabular-nums">
                ৳{subtotal.toLocaleString('en-BD')}
              </span>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between text-primary">
                <span>First Order Voucher</span>
                <span className="font-mono font-semibold tabular-nums">
                  -৳{discount.toLocaleString('en-BD')}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>{shippingLabel}</span>
              <span className="font-mono font-semibold text-on-surface tabular-nums">
                ৳{shippingFee.toLocaleString('en-BD')}
              </span>
            </div>
            <div className="my-1 h-px w-full bg-border-subtle" />
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="font-serif text-sm font-semibold text-on-surface">Total BDT</span>
              <span className="font-mono text-lg font-bold text-primary tabular-nums">
                {formattedTotal}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
