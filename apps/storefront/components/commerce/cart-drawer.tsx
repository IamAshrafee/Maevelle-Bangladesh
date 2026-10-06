'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRightIcon,
  CloseIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  TrashIcon,
  TruckIcon,
} from '@/components/ui/icons';
import { QuantityStepper } from '@/components/commerce/quantity-stepper';

export type CartItem = {
  id: string;
  imageUrl: string;
  price: number;
  quantity: number;
  subtitle: string;
  title: string;
};

export type CartDrawerProps = {
  freeShippingThreshold?: number;
  initialItems?: CartItem[];
  isOpen: boolean;
  onCheckout?: () => void;
  onClose: () => void;
  onViewCart?: () => void;
};

const defaultItems: CartItem[] = [
  {
    id: 'item-1',
    title: 'Aurelia Freshwater Pearl Drop Earrings',
    subtitle: '18K Gold Plated • Natural Ivory',
    price: 1650,
    quantity: 1,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAU8kN5Vdd-XFeUvL46CjxHeMIuqVlvOhzkxBeqEZbQrpiAvJAiT-7KIfOiRtN8aHnlzi4hl7xu93DUKF1LuLzY7_QV3v_7C9HV326W7qStkQMjNbSV9416GdaPdUvNT05egHsMOPWx_l2v_-w_bwM1u73AHYoiOqof4dI9HA21x3AGn1cFuS-IR6lPC7KsnlSwjexBjU1nzxRYx9mekEi6tr1w1Gj7NRsuBBgaH2bJjAiRGixv7mxx',
  },
  {
    id: 'item-2',
    title: 'Plush Velvet Hair Ribbon',
    subtitle: 'Deep Berry Silk Velvet',
    price: 850,
    quantity: 1,
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC57r3CLXUvSZDBeSKxpeW7zHa4TrFki3NN8CLIcNCvq3b0x3BgofZM0zdNua_l8jL5nikW5IvXlgQEapXPagGkR7P3N-42uqSvANLP4zOsySIjt0LqFD-QyzC9kv_zUS_Q1kLJx_KqQ1Vtma1HqZVoxE8BNuFF2WBZDzQWGDBYsYv26QNi8khn29i6w-Me5_-376wN8A3ehSUNcdGYyVnQWNxyLKrloWk_OQw1kcZz0XKVo9NZhIXn',
  },
];

export function CartDrawer({
  freeShippingThreshold = 3000,
  initialItems = defaultItems,
  isOpen,
  onCheckout,
  onClose,
  onViewCart,
}: CartDrawerProps) {
  const [items, setItems] = useState<CartItem[]>(initialItems);

  // Synchronize initialItems if changed
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const updateItemQty = (id: string, newQty: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: newQty } : item)),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const shippingProgress = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));
  const deliveryFee = subtotal >= freeShippingThreshold ? 0 : 70;
  const estimatedTotal = subtotal + deliveryFee;

  if (!isOpen) return null;

  return (
    <div
      aria-label="Your Shopping Bag"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end pointer-events-auto"
      id="cartDrawerModal"
      role="dialog"
    >
      {/* Scrim Backdrop */}
      <div
        className="fixed inset-0 bg-[#1E1B19]/50 backdrop-blur-xs transition-opacity duration-300"
        id="cartBackdrop"
        onClick={onClose}
      />

      {/* Drawer Content Sheet */}
      <div
        className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-container-lowest shadow-2xl transition-transform duration-300 ease-out sm:mx-auto sm:max-w-lg"
        id="cartDrawerSheet"
      >
        {/* Top Handle Bar */}
        <div className="flex w-full cursor-grab items-center justify-center pt-3 pb-1">
          <div className="h-1.5 w-12 rounded-full bg-surface-container-highest" />
        </div>

        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-surface-container px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-[20px] font-semibold leading-tight text-on-surface">
              Shopping Bag
            </h2>
            <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[11px] font-bold text-on-primary-fixed">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
          </div>
          <button
            aria-label="Close shopping bag"
            className="flex h-9 w-9 shrink-0 aspect-square items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface active:scale-95"
            id="closeCartBtn"
            onClick={onClose}
            type="button"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Free Shipping Progress Indicator */}
        <div className="border-b border-surface-container/60 bg-surface-container-low px-4 py-2.5">
          <div className="mb-1.5 flex items-center justify-between font-label-sm text-[11px] text-on-surface">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <TruckIcon size={16} />
              <span>
                {remainingForFreeShipping > 0
                  ? `Add ৳${remainingForFreeShipping.toLocaleString()} more for Free Dhaka Express!`
                  : 'You have unlocked Free Dhaka Express!'}
              </span>
            </div>
            <span className="font-mono font-medium text-on-surface-variant tabular-nums">
              ৳{subtotal.toLocaleString()} / ৳{freeShippingThreshold.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${shippingProgress}%` }}
            />
          </div>
        </div>

        {/* Scrollable Cart Items List */}
        <div className="flex-1 divide-y divide-surface-container/60 overflow-y-auto px-4 py-3 space-y-3">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <ShoppingBagIcon className="mx-auto size-12 text-outline" />
              <p className="mt-3 font-serif text-[18px] font-semibold text-on-surface">
                Your bag is empty
              </p>
              <p className="mt-1 text-body-sm text-[12px] text-on-surface-variant">
                Explore our handcrafted treasures to add heirloom items.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div className="flex gap-3 pt-3 first:pt-0 group" key={item.id}>
                <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-container-low">
                  <img
                    alt={item.title}
                    className="size-full object-cover"
                    src={item.imageUrl}
                  />
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="line-clamp-1 font-headline-sm text-[14px] font-semibold leading-tight text-on-surface">
                        {item.title}
                      </h3>
                      <button
                        aria-label={`Remove ${item.title}`}
                        className="p-0.5 text-on-surface-variant/70 transition-colors hover:text-error active:scale-90"
                        onClick={() => removeItem(item.id)}
                        type="button"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                    <p className="mt-0.5 font-body-sm text-[11px] text-on-surface-variant">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <QuantityStepper
                      onChange={(newQty) => updateItemQty(item.id, newQty)}
                      size="sm"
                      value={item.quantity}
                    />
                    <div className="flex items-baseline gap-1">
                      <span className="font-price-md font-mono text-price-md font-bold text-on-surface tabular-nums">
                        ৳{(item.price * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary, Trust Reassurance, and Actions Section */}
        {items.length > 0 && (
          <div className="border-t border-surface-container bg-surface-container-low/70 px-4 pt-3 pb-safe shadow-[0_-4px_20px_rgba(158,42,75,0.06)]">
            {/* Cost Breakdown */}
            <div className="space-y-1 pb-2.5">
              <div className="flex items-center justify-between font-body-sm text-[13px] text-on-surface-variant">
                <span>Subtotal</span>
                <span className="font-mono font-medium text-on-surface tabular-nums">
                  ৳{subtotal.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between font-body-sm text-[13px] text-on-surface-variant">
                <span>Delivery</span>
                <span className="text-[12px] font-medium text-primary">
                  {deliveryFee === 0 ? 'Free Dhaka Express' : '৳70 Dhaka / Free over ৳3,000'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-surface-container pt-1 font-headline-sm font-semibold text-on-surface">
                <span>Estimated Total</span>
                <span className="font-price-lg font-mono text-price-lg font-bold text-primary tabular-nums">
                  ৳{estimatedTotal.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Dual Action CTA Buttons */}
            <div className="flex flex-col gap-2 pt-1 pb-2">
              <button
                className="flex h-12 w-full items-center justify-between rounded-xl bg-primary px-4 font-headline-sm text-[15px] font-semibold text-white shadow-md transition-[background-color,transform] duration-150 ease-maevelle active:scale-98 hover:bg-primary-hover"
                onClick={onCheckout}
                type="button"
              >
                <span className="font-price-md font-mono font-bold tabular-nums text-white">
                  ৳{estimatedTotal.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5 text-white">
                  <span>Continue to Checkout</span>
                  <ArrowRightIcon size={18} />
                </span>
              </button>
              <button
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-outline-variant/70 bg-surface-container-lowest font-label-md text-label-md font-semibold text-on-surface transition-[background-color,border-color,transform] duration-150 ease-maevelle active:scale-98 hover:bg-surface-container-low"
                onClick={onViewCart}
                type="button"
              >
                <ShoppingBagIcon className="text-primary" size={18} />
                <span>View Full Cart Page</span>
              </button>
            </div>

            {/* Local Convenience & Trust Seal */}
            <div className="flex items-center justify-center gap-1.5 pb-2 text-center font-label-sm text-[11px] text-on-surface-variant/80">
              <ShieldCheckIcon className="text-primary" size={14} />
              <span>Cash on Delivery (COD) &amp; bKash • 7-Day Doorstep Exchange</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
