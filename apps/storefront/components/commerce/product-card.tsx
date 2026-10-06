'use client';

import { useState } from 'react';
import Link from 'next/link';

import { cx } from '@/components/ui/classnames';
import {
  BellIcon,
  BoltIcon,
  ShoppingBagIcon,
  StarIcon,
} from '@/components/ui/icons';
import { Money } from '@/components/commerce/price';
import { WishlistButton } from '@/components/commerce/wishlist-button';

export type ProductCardFinish = {
  color: string;
  imageUrl?: string;
  name: string;
};

export type ProductCardRating = {
  count: number;
  score: number;
};

export type ProductCardBadgeType =
  | 'primary'
  | 'secondary'
  | 'scarcity'
  | 'neutral'
  | 'sale';

export interface ProductCardProps {
  /** Optional craft or specification label under image (e.g. "Adjustable Fit", "18k Gold Plated") */
  attributeTag?: string | undefined;
  /** Primary badge label (e.g. "Editor's Pick", "New In", "Low Stock (3 left)", "Best Seller") */
  badge?: string | undefined;
  /** Visual category style for the badge */
  badgeType?: ProductCardBadgeType | undefined;
  /** Additional container classes */
  className?: string | undefined;
  /** Floating delivery reassurance pill on image (e.g. "Dhaka 24-48h Delivery") */
  deliveryPill?: string | undefined;
  /** Available color or material finish options */
  finishes?: ProductCardFinish[] | undefined;
  /** Suffix label for finish options (e.g. "2 Finishes", "3 Hues", "2 Tones") */
  finishesCountLabel?: string | undefined;
  /** Direct link URL for product navigation */
  href?: string | undefined;
  /** Unique product identifier */
  id: string;
  /** Image accessible description */
  imageAlt?: string | undefined;
  /** Primary 3:4 product hero image URL */
  imageUrl: string;
  /** Initial wishlist toggle state */
  initialWishlist?: boolean | undefined;
  /** Whether the product is currently sold out */
  isSoldOut?: boolean | undefined;
  /** Button label for sold-out restock notification (defaults to "Notify Me") */
  notifyMeLabel?: string | undefined;
  /** Quick-add to bag callback */
  onAddToCart?: (() => void) | undefined;
  /** Card click callback */
  onClick?: (() => void) | undefined;
  /** Notify-me restock alert callback for sold-out items */
  onNotifyMe?: (() => void) | undefined;
  /** Quick view trigger callback */
  onQuickView?: (() => void) | undefined;
  /** Wishlist toggle callback */
  onWishlistToggle?: ((active: boolean) => void) | undefined;
  /** Crossed-out original price (MSRP) */
  originalPrice?: number | string | undefined;
  /** Current retail selling price */
  price: number | string;
  /** Star rating and count */
  rating?: ProductCardRating | undefined;
  /** Secondary image URL for desktop hover crossfade */
  secondaryImageUrl?: string | undefined;
  /** Legacy alias for delivery/shipping pill */
  shippingTag?: string | undefined;
  /** Legacy prop: display persistent button on mobile */
  showAddButton?: boolean | undefined;
  /** Display label for sold out badge (defaults to "Sold Out") */
  soldOutLabel?: string | undefined;
  /** Editorial subtitle or material summary */
  subtitle?: string | undefined;
  /** Product display title */
  title: string;
  /** Card layout variant: auto (responsive), mobile (mobile/tablet), desktop (expanded with desktop hover) */
  variant?: 'auto' | 'mobile' | 'desktop' | undefined;
}

function resolveBadgeStyle(badge: string, badgeType?: ProductCardBadgeType) {
  if (badgeType === 'scarcity') {
    return 'bg-secondary-fixed text-on-secondary-fixed';
  }
  if (badgeType === 'secondary') {
    return 'bg-surface-container-low/95 backdrop-blur-md text-secondary';
  }
  if (badgeType === 'sale') {
    return 'bg-primary text-on-primary';
  }
  if (badgeType === 'neutral') {
    return 'bg-surface-container-high text-on-surface';
  }

  const lower = badge.toLowerCase();
  if (
    lower.includes('low stock') ||
    lower.includes('left') ||
    lower.includes('urgent') ||
    lower.includes('scarce')
  ) {
    return 'bg-secondary-fixed text-on-secondary-fixed';
  }
  if (lower.includes('new') || lower.includes('arrival')) {
    return 'bg-surface-container-low/95 backdrop-blur-md text-secondary';
  }
  if (lower.startsWith('-') || lower.includes('% off')) {
    return 'bg-primary text-on-primary';
  }

  // Default Editorial Atelier badge (Editor's Pick, Best Seller, Curated, etc.)
  return 'bg-surface-container-low/95 backdrop-blur-md text-primary';
}

export function ProductCard({
  attributeTag,
  badge,
  badgeType,
  className,
  deliveryPill,
  finishes,
  finishesCountLabel,
  href,
  id,
  imageAlt,
  imageUrl,
  initialWishlist = false,
  isSoldOut = false,
  notifyMeLabel = 'Notify Me',
  onAddToCart,
  onClick,
  onNotifyMe,
  onWishlistToggle,
  originalPrice,
  price,
  rating,
  secondaryImageUrl,
  shippingTag,
  showAddButton = false,
  soldOutLabel = 'Sold Out',
  subtitle,
  title,
  variant = 'auto',
}: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(initialWishlist);
  const [selectedFinishIdx, setSelectedFinishIdx] = useState(0);

  const activeDeliveryPill = deliveryPill || shippingTag;
  const currentImage =
    finishes && finishes[selectedFinishIdx]?.imageUrl
      ? finishes[selectedFinishIdx].imageUrl
      : imageUrl;

  const handleWishlistToggle = (active: boolean) => {
    setIsWishlisted(active);
    onWishlistToggle?.(active);
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    }
  };

  const content = (
    <article
      aria-label={title}
      className={cx(
        'group relative flex flex-col cursor-pointer select-none',
        isSoldOut && 'opacity-90',
        className,
      )}
      data-product-id={id}
      onClick={handleCardClick}
    >
      {/* 3:4 Aspect Ratio Hero Container */}
      <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden bg-surface-container-low shadow-[0_4px_16px_rgba(26,22,23,0.04)]">
        {/* Primary Product Artwork */}
        {currentImage ? (
          <img
            alt={imageAlt || title}
            className={cx(
              'size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105',
              isSoldOut && 'filter grayscale-[30%]',
              secondaryImageUrl && !isSoldOut && 'group-hover:opacity-0 transition-opacity duration-300',
            )}
            loading="lazy"
            src={currentImage}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-surface-container text-on-surface-variant font-label-sm text-xs">
            3:4 Artwork
          </div>
        )}

        {/* Secondary Image for Desktop Hover Crossfade */}
        {secondaryImageUrl && !isSoldOut ? (
          <img
            alt={imageAlt || title}
            aria-hidden="true"
            className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:scale-105 pointer-events-none"
            loading="lazy"
            src={secondaryImageUrl}
          />
        ) : null}

        {/* Top-Left Editorial Capsule Badge */}
        {badge ? (
          <span
            className={cx(
              'absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-full font-label-sm text-[10px] font-bold tracking-wider uppercase shadow-sm',
              resolveBadgeStyle(badge, badgeType),
            )}
          >
            {badge}
          </span>
        ) : null}

        {/* Top-Right Frosted Wishlist Toggle */}
        <div className="absolute top-2.5 right-2.5 z-10">
          <WishlistButton
            active={isWishlisted}
            className="shadow-sm active:scale-90"
            onToggle={handleWishlistToggle}
            productTitle={title}
            size="xs"
            variant="floating"
          />
        </div>

        {/* Floating Bottom Reassurance / Rating Pill */}
        {!isSoldOut && activeDeliveryPill ? (
          <div
            className={cx(
              'absolute bottom-2 left-2 right-2 z-10 px-2 py-1 rounded-md bg-surface-container-lowest/90 backdrop-blur-sm flex items-center gap-1 shadow-2xs',
              onAddToCart && 'transition-opacity duration-150 group-hover:opacity-0',
            )}
          >
            <BoltIcon className="text-tertiary shrink-0" size={13} />
            <span className="font-label-sm text-[10px] text-tertiary font-bold tracking-tight truncate">
              {activeDeliveryPill}
            </span>
          </div>
        ) : !isSoldOut && rating ? (
          <div
            className={cx(
              'absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-md bg-surface-container-lowest/90 backdrop-blur-sm flex items-center gap-1 shadow-2xs',
              onAddToCart && 'transition-opacity duration-150 group-hover:opacity-0',
            )}
          >
            <StarIcon className="text-[#B76E2E] fill-[#B76E2E] shrink-0" size={12} />
            <span className="font-label-sm text-[10px] text-on-surface font-semibold">
              {rating.score.toFixed(1)} ({rating.count})
            </span>
          </div>
        ) : null}

        {/* Sold-Out Atelier Scrim & Notify Action */}
        {isSoldOut ? (
          <div className="absolute inset-0 z-20 bg-inverse-surface/35 backdrop-blur-[1px] flex flex-col items-center justify-center p-3 text-center">
            <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider text-surface-container-lowest bg-on-surface/80 px-2.5 py-1 rounded shadow-xs">
              {soldOutLabel}
            </span>
            <button
              className="mt-2 text-[11px] font-label-sm font-semibold text-on-primary bg-primary/95 px-3 py-1.5 rounded-lg active:scale-95 hover:bg-primary transition-[background-color,transform] duration-150 flex items-center gap-1.5 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onNotifyMe?.();
              }}
              type="button"
            >
              <BellIcon size={14} />
              <span>{notifyMeLabel}</span>
            </button>
          </div>
        ) : null}

        {/* Desktop Slide-Up Quick Add Bar */}
        {!isSoldOut && onAddToCart ? (
          <div
            className={cx(
              'absolute inset-x-2 bottom-2 z-20',
              variant === 'desktop' ? 'flex' : variant === 'mobile' ? 'hidden' : 'hidden md:flex',
              'items-center justify-center gap-1.5 py-2 px-3 rounded-lg',
              'bg-surface-container-lowest/95 backdrop-blur-md text-primary font-label-sm text-xs font-semibold shadow-md',
              'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
              'transition-[transform,opacity,background-color,color] duration-200 ease-out',
              'hover:bg-primary hover:text-on-primary',
            )}
          >
            <button
              className="flex size-full items-center justify-center gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart();
              }}
              type="button"
            >
              <ShoppingBagIcon size={14} />
              <span>Quick Add to Bag</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Product Details Column */}
      <div className="flex flex-col mt-2.5">
        {/* Row 1: Finishes Swatches OR Attribute Tag */}
        <div className="flex items-center justify-between gap-1.5 mb-1 min-h-[16px]">
          {finishes && finishes.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {finishes.map((finish, idx) => (
                <button
                  aria-label={finish.name}
                  className={cx(
                    'size-2.5 rounded-full transition-[transform,box-shadow] duration-150',
                    'shadow-[0_0_0_1px_rgba(0,0,0,0.12)]',
                    selectedFinishIdx === idx
                      ? 'ring-1 ring-primary/60 ring-offset-1 scale-110'
                      : 'hover:scale-110 opacity-90 hover:opacity-100',
                  )}
                  key={finish.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFinishIdx(idx);
                  }}
                  style={{ backgroundColor: finish.color }}
                  title={finish.name}
                  type="button"
                />
              ))}
              {finishesCountLabel ? (
                <span className="font-label-sm text-[10px] text-on-surface-variant ml-0.5">
                  {finishesCountLabel}
                </span>
              ) : null}
            </div>
          ) : attributeTag ? (
            <span
              className={cx(
                'font-label-sm text-[10px] font-medium',
                attributeTag.toLowerCase().includes('gold') ||
                  attributeTag.toLowerCase().includes('plated') ||
                  attributeTag.toLowerCase().includes('silk')
                  ? 'text-tertiary font-semibold'
                  : attributeTag.toLowerCase().includes('soon') ||
                    attributeTag.toLowerCase().includes('restock')
                  ? 'text-outline'
                  : 'text-on-surface-variant',
              )}
            >
              {attributeTag}
            </span>
          ) : (
            <span />
          )}

          {/* Desktop Star Rating Pill in Row 1 when delivery pill took the image */}
          {rating && activeDeliveryPill && !isSoldOut ? (
            <div
              className={cx(
                'items-center gap-1 font-label-sm text-[10px] text-on-surface-variant',
                variant === 'desktop' ? 'flex' : 'hidden md:flex',
              )}
            >
              <StarIcon className="text-[#B76E2E] fill-[#B76E2E] shrink-0" size={11} />
              <span className="font-bold text-on-surface">{rating.score.toFixed(1)}</span>
              <span className="text-on-surface-variant/70">({rating.count})</span>
            </div>
          ) : null}
        </div>

        {/* Row 2: Product Title */}
        <h3
          className={cx(
            'font-headline-sm text-headline-sm font-semibold leading-snug',
            variant === 'desktop' ? 'line-clamp-2' : 'line-clamp-1 md:line-clamp-2',
            isSoldOut ? 'text-on-surface-variant' : 'text-on-surface',
          )}
        >
          {title}
        </h3>

        {/* Row 3: Editorial Subtitle (Visible on desktop or when expanded) */}
        {subtitle ? (
          <p
            className={cx(
              'mt-0.5 text-body-sm text-[11px] text-on-surface-variant line-clamp-1',
              variant === 'mobile' ? 'hidden' : 'hidden md:block',
            )}
          >
            {subtitle}
          </p>
        ) : null}

        {/* Row 4: Price & Savings Row */}
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span
            className={cx(
              'font-label-lg text-label-lg font-bold tabular-nums font-mono',
              isSoldOut ? 'text-on-surface-variant' : 'text-on-surface',
            )}
          >
            <Money amount={price} />
          </span>

          {originalPrice ? (
            <span className="font-body-sm text-[11px] text-outline line-through tabular-nums font-mono">
              <Money amount={originalPrice} />
            </span>
          ) : null}
        </div>

        {/* Optional Mobile Persistent Button (Legacy / Specimen Support) */}
        {showAddButton && !isSoldOut && onAddToCart ? (
          <button
            className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-label-md font-semibold text-white shadow-xs transition-[background-color,transform] duration-150 ease-maevelle active:scale-98 hover:bg-primary-hover"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart();
            }}
            type="button"
          >
            <ShoppingBagIcon size={16} />
            <span>Add to Bag</span>
          </button>
        ) : null}
      </div>
    </article>
  );

  if (href) {
    return (
      <Link className="contents focus:outline-none" href={href}>
        {content}
      </Link>
    );
  }

  return content;
}

/** Convenience wrapper explicitly configured for Mobile and Tablet viewports */
export function MobileProductCard(props: Omit<ProductCardProps, 'variant'>) {
  return <ProductCard {...props} variant="mobile" />;
}

/** Convenience wrapper explicitly configured for Desktop viewports with hover interactions */
export function DesktopProductCard(props: Omit<ProductCardProps, 'variant'>) {
  return <ProductCard {...props} variant="desktop" />;
}
