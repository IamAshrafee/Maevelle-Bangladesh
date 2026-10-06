'use client';

import Link from 'next/link';

import { cx } from '@/components/ui/classnames';
import {
  HeartIcon,
  MoreVerticalIcon,
  ShareIcon,
  ShoppingBagIcon,
  StorefrontIcon,
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

export interface WishlistMobileViewProps {
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

export function WishlistMobileView({
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
}: WishlistMobileViewProps) {
  const hasItems = items.length > 0;

  return (
    <div className="flex flex-col w-full pb-10">
      {/* 1. Header Section */}
      <section className="px-margin pt-space-md pb-space-sm">
        <div className="flex items-center justify-between gap-space-sm mb-space-xs">
          <div className="flex items-center gap-space-xs">
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight font-medium">
              Your Wishlist
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-semibold">
              {items.length} {items.length === 1 ? 'Piece' : 'Pieces'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              aria-label="Share Wishlist link"
              className="size-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container active:scale-95 transition-colors duration-150"
              onClick={onShare}
              type="button"
            >
              <ShareIcon size={20} />
            </button>
            {onClearWishlist && hasItems ? (
              <button
                aria-label="Clear all wishlist items"
                className="size-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-error hover:bg-surface-container active:scale-95 transition-colors duration-150"
                onClick={onClearWishlist}
                title="Clear Wishlist"
                type="button"
              >
                <MoreVerticalIcon size={20} />
              </button>
            ) : null}
          </div>
        </div>

        <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed max-w-[92%]">
          Saved heirloom accessories and artisanal edits reserved for your personal consideration.
        </p>
      </section>

      {/* 2. Quick Filter Horizontal Scrollable Pills */}
      {hasItems ? (
        <nav
          aria-label="Wishlist category filters"
          className="w-full overflow-x-auto no-scrollbar py-space-xs px-margin mb-space-sm flex items-center gap-space-xs bg-surface/90 backdrop-blur-md sticky top-14 z-20"
        >
          <button
            className={cx(
              'filter-pill whitespace-nowrap px-3.5 h-9 rounded-full font-label-md text-label-md flex items-center justify-center transition-colors duration-150 cursor-pointer',
              activeCategory === 'all'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container-high text-on-surface-variant hover:text-primary active:scale-95',
            )}
            onClick={() => onCategoryChange('all')}
            type="button"
          >
            All Items ({categoryCounts.all})
          </button>
          <button
            className={cx(
              'filter-pill whitespace-nowrap px-3.5 h-9 rounded-full font-label-md text-label-md flex items-center justify-center transition-colors duration-150 cursor-pointer',
              activeCategory === 'jewelry'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container-high text-on-surface-variant hover:text-primary active:scale-95',
            )}
            onClick={() => onCategoryChange('jewelry')}
            type="button"
          >
            Jewelry ({categoryCounts.jewelry})
          </button>
          <button
            className={cx(
              'filter-pill whitespace-nowrap px-3.5 h-9 rounded-full font-label-md text-label-md flex items-center justify-center transition-colors duration-150 cursor-pointer',
              activeCategory === 'hair'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container-high text-on-surface-variant hover:text-primary active:scale-95',
            )}
            onClick={() => onCategoryChange('hair')}
            type="button"
          >
            Hair Accents ({categoryCounts.hair})
          </button>
          <button
            className={cx(
              'filter-pill whitespace-nowrap px-3.5 h-9 rounded-full font-label-md text-label-md flex items-center justify-center transition-colors duration-150 cursor-pointer',
              activeCategory === 'bags'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container-high text-on-surface-variant hover:text-primary active:scale-95',
            )}
            onClick={() => onCategoryChange('bags')}
            type="button"
          >
            Bags ({categoryCounts.bags})
          </button>
          <button
            className={cx(
              'filter-pill whitespace-nowrap px-3.5 h-9 rounded-full font-label-md text-label-md flex items-center justify-center transition-colors duration-150 cursor-pointer',
              activeCategory === 'wraps'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'bg-surface-container-high text-on-surface-variant hover:text-primary active:scale-95',
            )}
            onClick={() => onCategoryChange('wraps')}
            type="button"
          >
            Silk Wraps ({categoryCounts.wraps})
          </button>
        </nav>
      ) : null}

      {/* 3. Wishlist Items List OR Empty State */}
      {hasItems ? (
        <div className="px-margin flex flex-col gap-space-md" id="wishlist-container">
          {filteredItems.map((item) => (
            <WishlistItemCard
              isMoved={movedItemIds.has(item.id)}
              isMoving={movingItemIds.has(item.id)}
              item={item}
              key={item.id}
              onMoveToBag={moveToBag}
              onRemove={onRemoveItem}
              variant="mobile"
            />
          ))}

          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-on-surface-variant">
              <p className="font-body-md text-body-md">No pieces found in this category.</p>
              <button
                className="mt-2 text-primary font-label-md text-label-md underline cursor-pointer"
                onClick={() => onCategoryChange('all')}
                type="button"
              >
                View all saved items
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        /* Empty State */
        <div className="px-margin py-space-xl flex flex-col items-center text-center">
          <div className="size-20 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary mb-space-md shadow-xs">
            <HeartIcon filled size={36} />
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface mb-1 font-semibold">
            Your Wishlist is Dreaming
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-xs mb-space-lg">
            Explore our curated heirloom edits and save pieces you adore for later contemplation.
          </p>
          <Link
            className="h-12 px-6 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center justify-center shadow-sm hover:bg-primary-hover active:scale-98 transition-transform"
            href="/categories"
          >
            Explore New Arrivals
          </Link>
        </div>
      )}

      {/* 4. Atelier Concierge & Studio Fitting Note */}
      {hasItems ? (
        <section className="px-margin mt-space-lg mb-space-md">
          <div className="w-full bg-surface-container-low rounded-xl p-space-md shadow-sm border border-border/40">
            <div className="flex items-start gap-space-sm">
              <div className="size-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0 shadow-2xs">
                <StorefrontIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-headline-sm text-headline-sm text-on-surface mb-0.5 font-semibold">
                  Banani Studio Private Fitting
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  Visiting our studio in Banani? Your saved {items.length} pieces can be set aside
                  for an exclusive private styling session.
                </p>
                <a
                  className="inline-flex items-center gap-1.5 text-primary font-label-md text-label-md font-semibold mt-2.5 hover:underline"
                  href="https://wa.me/8801700000000"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <WhatsAppIcon size={18} />
                  <span>Reserve Viewing on WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* 5. Summary Card & Multi-Action Floating Bar */}
      {hasItems ? (
        <section className="px-margin mb-space-lg">
          <div className="w-full bg-surface-container-lowest rounded-xl p-space-md shadow-[0_4px_20px_rgba(158,42,75,0.06)] border border-border/40 flex flex-col gap-space-sm">
            {/* Delivery Progress bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                  <TruckIcon className="text-secondary" size={16} />
                  <span>Dhaka Express Delivery</span>
                </span>
                <span className="font-label-sm text-label-sm text-primary font-bold tabular-nums font-mono">
                  <Money amount={totalPrice} /> / <Money amount={FREE_DELIVERY_THRESHOLD} />
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-300"
                  style={{ width: `${deliveryProgress}%` }}
                />
              </div>
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                {amountNeededForFreeDelivery > 0 ? (
                  <>
                    Add{' '}
                    <strong className="text-primary font-semibold">
                      <Money amount={amountNeededForFreeDelivery} /> more
                    </strong>{' '}
                    on checkout to unlock Complimentary Same-Day Delivery in Gulshan &amp; Banani.
                  </>
                ) : (
                  <span className="text-tertiary font-semibold">
                    ✨ You have unlocked Complimentary Same-Day Delivery in Dhaka!
                  </span>
                )}
              </p>
            </div>

            {/* Total & Action Button */}
            <div className="pt-space-sm border-t border-border/20 flex flex-col gap-space-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Total Value ({items.length} {items.length === 1 ? 'Item' : 'Items'})
                </span>
                <span className="font-price-lg text-price-lg text-primary font-bold tabular-nums font-mono">
                  <Money amount={totalPrice} />
                </span>
              </div>
              <button
                className="w-full h-12 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold flex items-center justify-center gap-2 hover:bg-primary-hover active:scale-[0.98] transition-colors duration-150 shadow-md cursor-pointer disabled:opacity-50"
                disabled={isTransferringAll || items.length === 0}
                onClick={moveAllToBag}
                type="button"
              >
                <ShoppingBagIcon size={20} />
                <span>
                  {isTransferringAll
                    ? 'Transferring Items…'
                    : `Move All Available to Bag (${items.length} Pieces)`}
                </span>
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
