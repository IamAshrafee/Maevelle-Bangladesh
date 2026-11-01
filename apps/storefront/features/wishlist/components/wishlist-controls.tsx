'use client';

import { Button } from '@/components/ui/button';
import { CategoryPill } from '@/components/ui/chip';
import { Select } from '@/components/ui/select';
import type { WishlistSort } from './wishlist-view-model';

export function WishlistCategoryFilters({ categories, active, onChange }: {
  categories: readonly string[]; active: string; onChange: (category: string) => void;
}) {
  if (categories.length < 2) return null;
  return <nav aria-label="Wishlist category filters" className="flex min-w-0 gap-2 overflow-x-auto py-2 no-scrollbar">
    <CategoryPill active={active === 'all'} className="min-h-12 shrink-0" onClick={() => onChange('all')}>All pieces</CategoryPill>
    {categories.map((category) => <CategoryPill active={active === category} className="min-h-12 shrink-0" key={category} onClick={() => onChange(category)}>{category}</CategoryPill>)}
  </nav>;
}

export function WishlistSortControl({ sort, onChange }: { sort: WishlistSort; onChange: (sort: WishlistSort) => void }) {
  return <label className="flex min-w-44 items-center gap-2 font-label-md text-xs text-on-surface-variant">
    <span className="shrink-0">Sort by</span>
    <Select aria-label="Sort saved products" onChange={(event) => onChange(event.target.value as WishlistSort)} sizeVariant="md" value={sort}>
      <option value="recent">Recently saved</option>
      <option value="oldest">Oldest saved</option>
      <option value="price-asc">Price: low to high</option>
      <option value="price-desc">Price: high to low</option>
    </Select>
  </label>;
}

export function WishlistPageEnd({ count, shown, nextCursor, loadingMore, onLoadMore }: {
  count: number; shown: number; nextCursor: string | null; loadingMore: boolean; onLoadMore: () => void;
}) {
  if (count <= shown && !nextCursor) return null;
  return <div className="space-y-3 py-5 text-center">
    <p className="font-label-sm text-xs text-on-surface-variant">Showing <span className="font-mono tabular-nums">{shown}</span> of <span className="font-mono tabular-nums">{count}</span> saved pieces</p>
    {nextCursor ? <Button loading={loadingMore} onClick={onLoadMore} variant="outline">Load more saved pieces</Button> : null}
  </div>;
}
