'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { HeartIcon, ShareIcon } from '@/components/ui/icons';
import { IconButton } from '@/components/ui/icon-button';
import { WishlistCategoryFilters, WishlistPageEnd, WishlistSortControl } from './wishlist-controls';
import { WishlistItemCard } from './wishlist-item-card';
import type { WishlistViewProps } from './wishlist-view-model';

export function WishlistMobileView(props: WishlistViewProps & { inDrawer?: boolean }) {
  const { count, items, totalVisible, availableVisible, mode, sort, onSortChange, categories,
    activeCategory, onCategoryChange, onRemove, pendingIds, nextCursor, loadingMore, onLoadMore,
    onShare, showSharing, onNavigate, inDrawer = false } = props;
  return <div className="flex w-full min-w-0 flex-col pb-8">
    {!inDrawer ? <header className="px-4 pb-3 pt-5 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><h1 className="font-headline-lg-mobile text-headline-lg-mobile font-medium tracking-tight text-primary">Your Wishlist</h1><Badge variant="secondary-fixed"><span className="font-mono tabular-nums">{count}</span> {count === 1 ? 'Piece' : 'Pieces'}</Badge></div>
        {showSharing ? <IconButton aria-label="Share collection" onClick={onShare} variant="ghost"><ShareIcon size={20} /></IconButton> : null}
      </div>
      <p className="mt-2 max-w-md font-body-sm text-body-sm leading-relaxed text-on-surface-variant">Your favorite pieces, saved for whenever inspiration strikes.</p>
    </header> : <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-3 sm:px-6"><p className="font-body-sm text-body-sm text-on-surface-variant">Your favorite pieces, saved for whenever inspiration strikes.</p>{showSharing ? <IconButton aria-label="Share collection" onClick={onShare} variant="ghost"><ShareIcon size={20} /></IconButton> : null}</div>}
    {count === 0 ? <div className="flex flex-col items-center px-4 py-16 text-center sm:px-6">
      <div className="mb-4 grid size-20 place-items-center rounded-full bg-secondary-fixed text-secondary shadow-xs"><HeartIcon filled size={36} /></div>
      <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">Your Wishlist is Dreaming</h2>
      <p className="mb-6 mt-2 max-w-xs font-body-md text-body-md text-on-surface-variant">Explore our curated edits and save pieces you adore for later.</p>
      <Link className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 font-label-md font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" href="/categories" onClick={() => onNavigate?.()}>Explore new arrivals</Link>
    </div> : <>
      {mode === 'guest' ? <div className="space-y-2 px-4 sm:px-6">
        <WishlistCategoryFilters active={activeCategory} categories={categories} onChange={onCategoryChange} />
        <WishlistSortControl onChange={onSortChange} sort={sort} />
      </div> : <p className="px-4 py-2 font-label-sm text-xs text-on-surface-variant sm:px-6">Most recently saved pieces first</p>}
      <div className="mt-4 flex flex-col gap-3 px-4 sm:px-6">
        {items.map((item) => <WishlistItemCard item={item} key={item.entry.id} onNavigate={onNavigate} onRemove={onRemove} pending={pendingIds.includes(item.entry.id)} />)}
        {items.length === 0 ? <p className="rounded-xl border border-dashed border-border bg-surface-container-lowest p-6 text-center font-body-md text-on-surface-variant">No pieces in this category. Choose All pieces to see your collection.</p> : null}
      </div>
      {mode === 'account' ? <WishlistPageEnd count={count} loadingMore={loadingMore} nextCursor={nextCursor} onLoadMore={onLoadMore} shown={totalVisible} /> : null}
      <section className="mx-4 mt-6 rounded-xl border border-border/40 bg-surface-container-lowest p-4 shadow-xs sm:mx-6">
        <div className="flex items-baseline justify-between"><h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Saved collection</h2><span className="font-mono text-sm font-semibold tabular-nums text-primary">{count} {count === 1 ? 'piece' : 'pieces'}</span></div>
        <p className="mt-2 font-body-sm text-xs text-on-surface-variant"><span className="font-mono tabular-nums">{availableVisible}</span> available in this view. Prices and availability are checked when you return.</p>
        <Link className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 font-label-md font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" href="/categories" onClick={() => onNavigate?.()}>Explore more pieces</Link>
      </section>
    </>}
  </div>;
}
