'use client';

import Link from 'next/link';

import { cx } from '@/components/ui/classnames';
import {
  CheckCircleIcon,
  HeartIcon,
  ShareIcon,
  ShoppingBagIcon,
  StorefrontIcon,
  TrashIcon,
  TruckIcon,
  WhatsAppIcon,
} from '@/components/ui/icons';
import { Money } from '@/components/commerce/price';
import { WishlistItemCard } from '@/features/wishlist/components/wishlist-item-card';
import {
  FREE_DELIVERY_THRESHOLD,
  type WishlistCategory,
  type WishlistItem,
} from '@/features/wishlist/types';

export interface WishlistDesktopViewProps {
  activeCategory: WishlistCategory;
  amountNeededForFreeDelivery: number;
  categoryCounts: Record<WishlistCategory, number>;
  deliveryProgress: number;
  filteredItems: readonly WishlistItem[];
  isTransferringAll: boolean;
  items: readonly WishlistItem[];
  moveAllToBag: () => void;
  movedItemIds: Set<string>;
  moveToBag: (item: WishlistItem) => void;
  movingItemIds: Set<string>;
  onCategoryChange: (category: WishlistCategory) => void;
  onClearWishlist?: () => void;
  onRemoveItem: (id: string) => void;
  onShare: () => void;
  totalPrice: number;
}

export function WishlistDesktopView({
  activeCategory,
  amountNeededForFreeDelivery,
  categoryCounts,
  deliveryProgress,
  filteredItems,
  isTransferringAll,
  items,
  moveAllToBag,
  movedItemIds,
  moveToBag,
  movingItemIds,
  onCategoryChange,
  onClearWishlist,
  onRemoveItem,
  onShare,
  totalPrice,
}: WishlistDesktopViewProps) {
  const hasItems = items.length > 0;
  const deliveryFee = totalPrice >= FREE_DELIVERY_THRESHOLD || totalPrice === 0 ? 0 : 120;
  const estimatedOrderTotal = totalPrice + deliveryFee;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-8 py-8">
      {/* 1. Breadcrumbs */}
      <nav aria-label="Breadcrumbs" className="mb-4 flex items-center gap-2 text-xs font-label-sm text-on-surface-variant/70">
        <Link className="hover:text-primary transition-colors" href="/">
          Home
        </Link>
        <span>/</span>
        <span className="text-on-surface font-medium">Your Wishlist</span>
      </nav>

      {/* 2. Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/40 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-headline-lg text-3xl font-semibold text-primary tracking-tight">
              Your Wishlist
            </h1>
            <span className="rounded-full bg-secondary-fixed px-3 py-1 font-label-sm text-xs font-bold text-on-secondary-fixed">
              {items.length} {items.length === 1 ? 'Piece' : 'Pieces'} Saved
            </span>
          </div>
          <p className="mt-2 text-body-md text-on-surface-variant max-w-2xl">
            Saved heirloom accessories and artisanal edits reserved for your personal consideration.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-surface-container-lowest text-on-surface hover:text-primary hover:border-primary/40 font-label-md text-xs font-semibold shadow-2xs transition-[background-color,border-color,color] duration-150 cursor-pointer"
            onClick={onShare}
            type="button"
          >
            <ShareIcon size={16} />
            <span>Share Collection</span>
          </button>
          {onClearWishlist && hasItems ? (
            <button
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border/60 bg-surface-container-lowest text-on-surface-variant hover:text-error hover:border-error/40 font-label-md text-xs font-semibold shadow-2xs transition-[background-color,border-color,color] duration-150 cursor-pointer"
              onClick={onClearWishlist}
              type="button"
            >
              <TrashIcon size={16} />
              <span>Clear All</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* 3. Main 2-Column Split */}
      {hasItems ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left / Primary Catalog List (8 cols) */}
          <div className="lg:col-span-8 space-y-5">
            {/* Filter Pills Toolbar */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-surface-container-low border border-border/30">
              <button
                className={cx(
                  'px-4 h-9 rounded-xl font-label-md text-xs font-semibold transition-[background-color,color,box-shadow] cursor-pointer',
                  activeCategory === 'all'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-primary',
                )}
                onClick={() => onCategoryChange('all')}
                type="button"
              >
                All Items ({categoryCounts.all})
              </button>
              <button
                className={cx(
                  'px-4 h-9 rounded-xl font-label-md text-xs font-semibold transition-[background-color,color,box-shadow] cursor-pointer',
                  activeCategory === 'jewelry'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-primary',
                )}
                onClick={() => onCategoryChange('jewelry')}
                type="button"
              >
                Jewelry ({categoryCounts.jewelry})
              </button>
              <button
                className={cx(
                  'px-4 h-9 rounded-xl font-label-md text-xs font-semibold transition-[background-color,color,box-shadow] cursor-pointer',
                  activeCategory === 'hair'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-primary',
                )}
                onClick={() => onCategoryChange('hair')}
                type="button"
              >
                Hair Accents ({categoryCounts.hair})
              </button>
              <button
                className={cx(
                  'px-4 h-9 rounded-xl font-label-md text-xs font-semibold transition-[background-color,color,box-shadow] cursor-pointer',
                  activeCategory === 'bags'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-primary',
                )}
                onClick={() => onCategoryChange('bags')}
                type="button"
              >
                Bags ({categoryCounts.bags})
              </button>
              <button
                className={cx(
                  'px-4 h-9 rounded-xl font-label-md text-xs font-semibold transition-[background-color,color,box-shadow] cursor-pointer',
                  activeCategory === 'wraps'
                    ? 'bg-surface-container-lowest text-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-primary',
                )}
                onClick={() => onCategoryChange('wraps')}
                type="button"
              >
                Silk Wraps ({categoryCounts.wraps})
              </button>
            </div>

            {/* List of Wishlist Item Cards */}
            <div className="space-y-4">
              {filteredItems.map((item) => (
                <WishlistItemCard
                  isMoved={movedItemIds.has(item.id)}
                  isMoving={movingItemIds.has(item.id)}
                  item={item}
                  key={item.id}
                  onMoveToBag={moveToBag}
                  onRemove={onRemoveItem}
                  variant="desktop"
                />
              ))}

              {filteredItems.length === 0 ? (
                <div className="py-16 text-center rounded-2xl border border-dashed border-border bg-surface-container-lowest p-8">
                  <p className="font-body-md text-on-surface-variant">
                    No items in this category currently saved.
                  </p>
                  <button
                    className="mt-3 text-primary font-label-md text-xs font-semibold hover:underline cursor-pointer"
                    onClick={() => onCategoryChange('all')}
                    type="button"
                  >
                    View all items ({items.length})
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Right / Sticky Atelier Summary Sidebar (4 cols) */}
          <div className="lg:col-span-4 sticky top-28 space-y-5">
            {/* Summary Card */}
            <div className="rounded-2xl border border-border/60 bg-surface-container-lowest p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-border/30 pb-3">
                <h2 className="font-headline-sm text-base font-semibold text-on-surface">
                  Wishlist Summary
                </h2>
                <span className="font-label-sm text-xs text-on-surface-variant font-medium">
                  {items.length} {items.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>

              {/* Delivery Progress */}
              <div className="space-y-2 rounded-xl bg-surface-container-low/60 p-4 border border-border/30">
                <div className="flex items-center justify-between text-xs font-label-sm">
                  <span className="flex items-center gap-1.5 text-on-surface font-semibold">
                    <TruckIcon className="text-secondary" size={16} />
                    <span>Dhaka Express VIP Delivery</span>
                  </span>
                  <span className="font-bold text-primary font-mono tabular-nums">
                    <Money amount={totalPrice} /> / <Money amount={FREE_DELIVERY_THRESHOLD} />
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-[width] duration-300"
                    style={{ width: `${deliveryProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {amountNeededForFreeDelivery > 0 ? (
                    <>
                      Add{' '}
                      <strong className="text-primary font-semibold">
                        <Money amount={amountNeededForFreeDelivery} /> more
                      </strong>{' '}
                      to unlock Complimentary Express Delivery.
                    </>
                  ) : (
                    <span className="text-tertiary font-semibold">
                      ✨ You have unlocked Complimentary Express Delivery!
                    </span>
                  )}
                </p>
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2 text-xs font-body-sm text-on-surface-variant">
                <div className="flex justify-between">
                  <span>Saved Items Subtotal</span>
                  <span className="font-semibold text-on-surface font-mono tabular-nums">
                    <Money amount={totalPrice} />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Dhaka Delivery</span>
                  <span className="font-semibold font-mono tabular-nums">
                    {deliveryFee === 0 ? (
                      <span className="text-tertiary font-bold uppercase">Free</span>
                    ) : (
                      <Money amount={deliveryFee} />
                    )}
                  </span>
                </div>
                <div className="pt-2 border-t border-border/30 flex justify-between items-baseline text-sm">
                  <span className="font-bold text-on-surface">Estimated Order Total</span>
                  <span className="font-price-md text-lg font-bold text-primary font-mono tabular-nums">
                    <Money amount={estimatedOrderTotal} />
                  </span>
                </div>
              </div>

              {/* Primary Move All Action Button */}
              <button
                className="w-full h-12 rounded-xl bg-primary text-on-primary font-label-md text-sm font-semibold flex items-center justify-center gap-2 shadow-sm hover:bg-primary-hover active:scale-98 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                disabled={isTransferringAll || items.length === 0}
                onClick={moveAllToBag}
                type="button"
              >
                <ShoppingBagIcon size={18} />
                <span>
                  {isTransferringAll
                    ? 'Transferring All Pieces…'
                    : `Move All Available to Bag (${items.length} Pieces)`}
                </span>
              </button>
            </div>

            {/* Online Styling Concierge Card */}
            <div className="rounded-2xl border border-border/40 bg-surface-container-low p-5 shadow-2xs space-y-3">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0 shadow-2xs">
                  <StorefrontIcon size={20} />
                </div>
                <div>
                  <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
                    Online Styling Concierge
                  </h3>
                  <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                    Need personalized advice? Chat directly with our online stylists on WhatsApp for guidance on sizing, pairing, and gift selections.
                  </p>
                </div>
              </div>

              <a
                className="inline-flex w-full items-center justify-center gap-2 h-9 rounded-lg border border-primary/30 bg-surface-container-lowest text-primary font-label-sm text-xs font-semibold hover:bg-primary hover:text-on-primary transition-[background-color,color] duration-150"
                href="https://wa.me/8801700000000"
                rel="noopener noreferrer"
                target="_blank"
              >
                <WhatsAppIcon size={16} />
                <span>Chat with Stylist on WhatsApp</span>
              </a>
            </div>

            {/* Maevelle Assurance Guarantee */}
            <div className="rounded-2xl border border-border/30 bg-surface-container-lowest p-4 space-y-2.5 text-xs text-on-surface-variant">
              <div className="flex items-center gap-2 text-on-surface font-semibold text-[11px] uppercase tracking-wider">
                <CheckCircleIcon className="text-primary" size={14} />
                <span>The Maevelle Promise</span>
              </div>
              <ul className="space-y-1.5 text-[11px] text-on-surface-variant/90 pl-1">
                <li>• 3-Day Easy Doorstep Exchange</li>
                <li>• Cash on Delivery across all 64 districts</li>
                <li>• Hand-inspected artisanal quality guarantee</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        /* Desktop Empty State */
        <div className="max-w-xl mx-auto my-16 py-16 px-6 text-center rounded-3xl border border-border/40 bg-surface-container-lowest shadow-xs">
          <div className="size-20 mx-auto rounded-full bg-secondary-fixed flex items-center justify-center text-secondary mb-4 shadow-2xs">
            <HeartIcon filled size={36} />
          </div>
          <h2 className="font-headline-lg text-2xl font-semibold text-on-surface mb-2">
            Your Wishlist is Dreaming
          </h2>
          <p className="text-body-md text-on-surface-variant max-w-md mx-auto mb-6">
            Explore our curated heirloom edits and save pieces you adore for later contemplation.
          </p>
          <Link
            className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-primary text-on-primary font-label-md font-semibold shadow-sm hover:bg-primary-hover active:scale-98 transition-transform"
            href="/categories"
          >
            Explore Curated Collections
          </Link>
        </div>
      )}
    </div>
  );
}
