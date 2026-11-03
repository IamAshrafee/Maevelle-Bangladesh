import type { ReactNode } from 'react';
import type { WishlistItem } from '@/features/wishlist/types';

export interface WishlistCatalogProduct {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  price: string | null;
  available: boolean;
  primaryMediaAssetId: string | null;
  categoryName: string | null;
  /** Design-lab specimen only; live products use public Media renditions. */
  imageUrl?: string;
}

export interface WishlistDisplayItem {
  entry: WishlistItem;
  product: WishlistCatalogProduct | null;
}

export type WishlistSort = 'recent' | 'oldest' | 'price-asc' | 'price-desc';

export interface WishlistViewProps {
  count: number;
  items: readonly WishlistDisplayItem[];
  totalVisible: number;
  availableVisible: number;
  mode: 'guest' | 'account';
  sort: WishlistSort;
  onSortChange: (sort: WishlistSort) => void;
  categories: readonly string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  bagActions?: ((item: WishlistDisplayItem) => ReactNode) | undefined;
  onRemove: (item: WishlistDisplayItem) => void;
  pendingIds: readonly string[];
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  onShare: () => void;
  showSharing: boolean;
  onNavigate?: (() => void) | undefined;
}
