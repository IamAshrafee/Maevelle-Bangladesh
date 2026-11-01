'use client';

import { useMemo, useState } from 'react';
import { WishlistDesktopView } from './wishlist-desktop-view';
import { WishlistMobileView } from './wishlist-mobile-view';
import { WISHLIST_DESIGN_ITEMS } from './wishlist-design-fixtures';
import type { WishlistDisplayItem, WishlistSort, WishlistViewProps } from './wishlist-view-model';

/** Keeps the original approved, populated Wishlist composition visible in the design lab. */
export function WishlistDesignSpecimen({ mode }: { mode: 'mobile' | 'desktop' }) {
  const [items, setItems] = useState(() => [...WISHLIST_DESIGN_ITEMS]);
  const [sort, setSort] = useState<WishlistSort>('recent');
  const [category, setCategory] = useState('all');
  const [notice, setNotice] = useState('');
  const categories = useMemo(() => [...new Set(items.map((item) => item.categoryLabel))].sort(), [items]);
  const displayItems = useMemo(() => {
    const result: WishlistDisplayItem[] = items.filter((item) => category === 'all' || item.categoryLabel === category)
      .map((entry) => ({ entry, product: {
        id: entry.id, handle: '', title: entry.title, description: entry.subtitle,
        price: String(entry.price), available: entry.inStock, primaryMediaAssetId: null,
        categoryName: entry.categoryLabel, imageUrl: entry.imageUrl,
      } }));
    if (sort === 'oldest') result.reverse();
    if (sort === 'price-asc' || sort === 'price-desc') result.sort((a, b) =>
      sort === 'price-asc' ? a.entry.price - b.entry.price : b.entry.price - a.entry.price);
    return result;
  }, [items, category, sort]);
  const props: WishlistViewProps = {
    count: items.length, items: displayItems, totalVisible: items.length,
    availableVisible: items.filter((item) => item.inStock).length,
    mode: 'guest', sort, onSortChange: setSort, categories,
    activeCategory: category, onCategoryChange: setCategory,
    onRemove: ({ entry }) => setItems((current) => current.filter((item) => item.id !== entry.id)),
    pendingIds: [], nextCursor: null, loadingMore: false, onLoadMore: () => {},
    onShare: () => setNotice('Open the live Wishlist to create a private share link.'),
    showSharing: true,
  };
  return <div>
    {notice ? <p aria-live="polite" className="m-4 rounded-xl bg-surface-container-low p-3 font-body-sm text-xs text-on-surface-variant">{notice}</p> : null}
    {mode === 'mobile' ? <WishlistMobileView {...props} /> : <WishlistDesktopView {...props} />}
  </div>;
}
