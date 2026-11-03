'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Money } from '@/components/commerce/price';
import { IconButton } from '@/components/ui/icon-button';
import { TrashIcon } from '@/components/ui/icons';
import { publicMediaPath } from '@/lib/media/url';
import type { WishlistDisplayItem } from './wishlist-view-model';

export interface WishlistItemCardProps {
  item: WishlistDisplayItem;
  onRemove: (item: WishlistDisplayItem) => void;
  pending: boolean;
  bagActions?: ReactNode;
  variant?: 'mobile' | 'desktop';
  onNavigate?: (() => void) | undefined;
}

export function WishlistItemCard({ item, onRemove, pending, bagActions, variant = 'mobile', onNavigate }: WishlistItemCardProps) {
  const { entry, product } = item;
  const title = product?.title ?? 'Product unavailable';
  const image = product?.imageUrl ?? (product?.primaryMediaAssetId ? publicMediaPath(product.primaryMediaAssetId, 'card') : null);
  const productHref = product?.handle ? `/products/${product.handle}` : null;
  const artwork = image ? <img alt={title} className="size-full object-cover transition-transform duration-200 motion-reduce:transition-none group-hover:scale-105" loading="lazy" src={image} />
    : <span className="flex size-full items-center justify-center px-2 text-center font-label-sm text-xs text-on-surface-variant">Image unavailable</span>;
  return <article aria-label={title} className={`group flex min-w-0 gap-3 rounded-xl border border-border/40 bg-surface-container-lowest p-2 shadow-xs transition-[box-shadow,border-color] duration-150 hover:border-border hover:shadow-sm ${variant === 'desktop' ? 'sm:gap-4 sm:p-4' : ''}`}>
    <div className={`relative shrink-0 overflow-hidden rounded-lg bg-surface-container-high ${variant === 'desktop' ? 'h-36 w-28 sm:h-40 sm:w-32' : 'h-32 w-24 sm:h-36 sm:w-28'}`}>
      {productHref ? <Link aria-label={`View ${title}`} className="block size-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" href={productHref} onClick={() => onNavigate?.()}>{artwork}</Link>
        : artwork}
      {product?.categoryName ? <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-surface-container-lowest/90 px-1.5 py-0.5 text-center font-label-sm text-[10px] text-primary">{product.categoryName}</span> : null}
    </div>
    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
      <div>
        <div className="flex items-start justify-between gap-1">
          <span className={`rounded-full px-2 py-0.5 font-label-sm text-[10px] font-semibold ${!product ? 'bg-surface-container-high text-on-surface-variant' : product.available ? 'bg-success-subtle text-success-foreground' : 'bg-warning-subtle text-warning-foreground'}`}>
            {!product ? 'Unavailable' : product.available ? 'Available' : 'Out of stock'}
          </span>
          <IconButton aria-label={`Remove ${title} from Wishlist`} className="-mr-1 -mt-1" disabled={pending} onClick={() => onRemove(item)} size="sm" variant="ghost"><TrashIcon size={18} /></IconButton>
        </div>
        <h2 className="mt-1 font-headline-sm text-headline-sm font-semibold leading-snug text-on-surface [overflow-wrap:anywhere]">
          {productHref ? <Link className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus hover:text-primary" href={productHref} onClick={() => onNavigate?.()}>{title}</Link> : title}
        </h2>
        {product?.description ? <p className="mt-1 line-clamp-2 font-body-sm text-body-sm text-on-surface-variant">{product.description}</p> : null}
        {!product ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">This product is no longer public.</p> : null}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2 border-t border-border/30 pt-2">
        <div>
          <p className="font-mono text-price-md font-bold tabular-nums text-primary">{product?.price ? <Money amount={product.price} /> : 'Price unavailable'}</p>
          {entry.preferredVariantId ? <p className="mt-0.5 font-body-sm text-[11px] text-on-surface-variant">{entry.preferredVariantAvailable === false ? 'Saved option unavailable; review on product page' : 'Preferred option saved'}</p> : null}
        </div>
        {productHref ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-primary/30 bg-surface-container-low px-3 font-label-sm text-xs font-semibold text-primary transition-colors duration-150 hover:bg-primary hover:text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" href={productHref} onClick={() => onNavigate?.()}>View piece</Link> : null}
      </div>
      {bagActions}
    </div>
  </article>;
}
