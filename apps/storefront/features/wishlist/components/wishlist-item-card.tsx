'use client';

import Link from 'next/link';

import { cx } from '@/components/ui/classnames';
import { CheckIcon, ShoppingBagIcon, TrashIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/spinner';
import { Money } from '@/components/commerce/price';
import type { WishlistItem } from '@/features/wishlist/types';

export interface WishlistItemCardProps {
  className?: string | undefined;
  isMoved?: boolean | undefined;
  isMoving?: boolean | undefined;
  item: WishlistItem;
  onMoveToBag: (item: WishlistItem) => void;
  onRemove: (id: string) => void;
  variant?: 'mobile' | 'desktop' | undefined;
}

export function WishlistItemCard({
  className,
  isMoved = false,
  isMoving = false,
  item,
  onMoveToBag,
  onRemove,
  variant = 'mobile',
}: WishlistItemCardProps) {
  const isDesktop = variant === 'desktop';

  const badgeElement = item.badge ? (
    <span
      className={cx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-label-sm text-[10px] font-semibold',
        item.badgeType === 'scarcity'
          ? 'bg-error-container text-on-error-container'
          : item.badgeType === 'primary-fixed'
            ? 'bg-primary-fixed text-on-primary-fixed'
            : item.badgeType === 'secondary-fixed'
              ? 'bg-secondary-fixed text-on-secondary-fixed-variant'
              : item.badgeType === 'primary-fixed-dim'
                ? 'bg-primary-fixed-dim text-on-primary-fixed-variant'
                : 'bg-surface-container-high text-on-surface-variant',
      )}
    >
      {item.badgeType === 'scarcity' ? (
        <span className="size-1.5 rounded-full bg-error animate-pulse" />
      ) : null}
      {item.badge}
    </span>
  ) : null;

  return (
    <article
      aria-label={item.title}
      className={cx(
        'wishlist-item group w-full bg-surface-container-lowest rounded-xl p-space-sm',
        'shadow-[0_2px_12px_rgba(158,42,75,0.04)] border border-border/30',
        'flex gap-space-md relative overflow-hidden transition-[transform,opacity,box-shadow] duration-200 hover:shadow-md',
        isDesktop ? 'items-center sm:p-4' : 'items-stretch',
        className,
      )}
      data-category={item.category}
      data-price={item.price}
    >
      {/* 3:4 Artwork Thumbnail */}
      <Link
        aria-label={item.title}
        className={cx(
          'relative flex-shrink-0 rounded-lg overflow-hidden bg-surface-container-high block',
          isDesktop ? 'w-28 h-36 sm:w-32 sm:h-40' : 'w-28 h-36',
        )}
        href={`/products/${item.handle}`}
      >
        <img
          alt={item.alt}
          className="size-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
          loading="lazy"
          src={item.imageUrl}
        />
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur-sm text-primary font-label-sm text-[9px] uppercase tracking-wider font-bold shadow-2xs">
          {item.categoryLabel}
        </span>
      </Link>

      {/* Details & Actions Content */}
      <div className="flex-1 flex flex-col justify-between py-0.5 min-w-0">
        <div>
          {/* Top Status & Remove Action Row */}
          <div className="flex items-center justify-between gap-1 mb-1">
            {badgeElement || <div />}
            <button
              aria-label={`Remove ${item.title} from wishlist`}
              className="remove-btn size-10 -mr-2 -mt-2 flex items-center justify-center text-on-surface-variant/70 hover:text-error transition-colors rounded-full active:scale-90"
              onClick={() => onRemove(item.id)}
              type="button"
            >
              <TrashIcon size={18} />
            </button>
          </div>

          {/* Product Title */}
          <h2 className="font-headline-sm text-headline-sm text-on-surface truncate font-semibold leading-snug">
            <Link
              className="hover:text-primary transition-colors focus:outline-none focus:underline"
              href={`/products/${item.handle}`}
            >
              {item.title}
            </Link>
          </h2>

          {/* Subtitle / Atelier Specs */}
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 truncate">
            {item.subtitle}
          </p>
        </div>

        {/* Pricing & Add to Bag Row */}
        <div className="mt-2.5 pt-1 border-t border-border/20 flex flex-wrap items-center justify-between gap-2">
          {/* Price Block */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="font-price-md text-price-md text-primary font-bold tabular-nums font-mono">
                <Money amount={item.price} />
              </span>
              {item.originalPrice ? (
                <span className="font-body-sm text-body-sm text-on-surface-variant/70 line-through tabular-nums font-mono">
                  <Money amount={item.originalPrice} />
                </span>
              ) : null}
            </div>

            {item.discountTag ? (
              <span className="font-label-sm text-[10px] text-secondary font-semibold">
                {item.discountTag}
              </span>
            ) : item.deliveryTag ? (
              <span className="font-label-sm text-[10px] text-tertiary font-medium">
                {item.deliveryTag}
              </span>
            ) : null}
          </div>

          {/* Move to Bag Button */}
          <button
            aria-label={`Move ${item.title} to bag`}
            className={cx(
              'add-to-bag-btn h-9 px-3.5 rounded-full border border-primary/20',
              'font-label-sm text-label-sm font-semibold inline-flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer',
              'transition-[background-color,color,border-color,transform] duration-150',
              isMoved
                ? 'bg-surface-container-high text-primary border-primary/30'
                : 'bg-surface-container-low hover:bg-primary hover:text-on-primary text-primary',
            )}
            disabled={isMoving || isMoved}
            onClick={() => onMoveToBag(item)}
            type="button"
          >
            {isMoving ? (
              <>
                <Spinner size="xs" />
                <span>Adding…</span>
              </>
            ) : isMoved ? (
              <>
                <CheckIcon size={16} />
                <span>Added</span>
              </>
            ) : (
              <>
                <ShoppingBagIcon size={16} />
                <span>Move to Bag</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
