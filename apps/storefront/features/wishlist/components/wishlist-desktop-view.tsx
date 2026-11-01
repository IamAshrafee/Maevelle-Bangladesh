'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HeartIcon, ShareIcon, StorefrontIcon } from '@/components/ui/icons';
import { WishlistCategoryFilters, WishlistPageEnd, WishlistSortControl } from './wishlist-controls';
import { WishlistItemCard } from './wishlist-item-card';
import type { WishlistViewProps } from './wishlist-view-model';

export function WishlistDesktopView(props: WishlistViewProps) {
  const { count, items, totalVisible, availableVisible, mode, sort, onSortChange, categories,
    activeCategory, onCategoryChange, onRemove, pendingIds, nextCursor, loadingMore, onLoadMore,
    onShare, showSharing, onNavigate } = props;
  return <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
    <nav aria-label="Breadcrumbs" className="mb-4 flex items-center gap-2 font-label-sm text-xs text-on-surface-variant">
      <Link className="hover:text-primary" href="/">Home</Link><span aria-hidden="true">/</span><span className="text-on-surface">Your Wishlist</span>
    </nav>
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border/40 pb-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-headline-lg text-3xl font-semibold tracking-tight text-primary">Your Wishlist</h1>
          <Badge variant="secondary-fixed"><span className="font-mono tabular-nums">{count}</span> {count === 1 ? 'Piece' : 'Pieces'} Saved</Badge>
        </div>
        <p className="mt-2 max-w-2xl font-body-md text-body-md text-on-surface-variant">A private collection of the pieces you love. Revisit each piece whenever you wish.</p>
      </div>
      {showSharing ? <Button onClick={onShare} variant="outline"><ShareIcon size={16} /> Share collection</Button> : null}
    </header>
    {count === 0 ? <div className="mx-auto my-16 max-w-xl rounded-3xl border border-border/40 bg-surface-container-lowest px-6 py-16 text-center shadow-xs">
      <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-secondary-fixed text-secondary"><HeartIcon filled size={36} /></div>
      <h2 className="font-headline-lg text-2xl font-semibold text-on-surface">Your Wishlist is Dreaming</h2>
      <p className="mx-auto mt-2 max-w-md font-body-md text-on-surface-variant">Explore our curated edits and save pieces you adore for later.</p>
      <Link className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-primary px-6 font-label-md font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" href="/categories">Explore curated collections</Link>
    </div> : <div className="grid grid-cols-12 items-start gap-8">
      <div className="col-span-8 min-w-0 space-y-5">
        {mode === 'guest' ? <div className="space-y-3 rounded-2xl border border-border/30 bg-surface-container-low p-2">
          <WishlistCategoryFilters active={activeCategory} categories={categories} onChange={onCategoryChange} />
          <WishlistSortControl onChange={onSortChange} sort={sort} />
        </div> : <p className="font-label-sm text-xs text-on-surface-variant">Most recently saved pieces first</p>}
        <div className="space-y-4">
          {items.map((item) => <WishlistItemCard item={item} key={item.entry.id} onNavigate={onNavigate} onRemove={onRemove} pending={pendingIds.includes(item.entry.id)} variant="desktop" />)}
          {items.length === 0 ? <p className="rounded-2xl border border-dashed border-border bg-surface-container-lowest p-8 text-center font-body-md text-on-surface-variant">No pieces in this category. Choose All pieces to see your collection.</p> : null}
        </div>
        {mode === 'account' ? <WishlistPageEnd count={count} loadingMore={loadingMore} nextCursor={nextCursor} onLoadMore={onLoadMore} shown={totalVisible} /> : null}
      </div>
      <aside className="sticky top-28 col-span-4 space-y-5">
        <div className="space-y-5 rounded-2xl border border-border/60 bg-surface-container-lowest p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/30 pb-3"><h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Wishlist Summary</h2><span className="font-mono text-xs tabular-nums text-on-surface-variant">{count} saved</span></div>
          <div className="flex justify-between font-body-md text-sm"><span className="text-on-surface-variant">Available in this view</span><span className="font-mono font-semibold tabular-nums text-on-surface">{availableVisible}</span></div>
          {mode === 'account' && count > totalVisible ? <p className="font-body-sm text-xs text-on-surface-variant">More pieces are available as you load older saves.</p> : null}
          <Link className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 font-label-md font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" href="/categories">Explore more pieces</Link>
        </div>
        <div className="rounded-2xl border border-border/40 bg-surface-container-low p-5">
          <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-fixed text-primary"><StorefrontIcon size={20} /></div><div><h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Your private edit</h3><p className="mt-1 font-body-sm text-xs leading-relaxed text-on-surface-variant">Saved pieces stay here until you remove them. Product prices and availability can change.</p></div></div>
        </div>
      </aside>
    </div>}
  </div>;
}
