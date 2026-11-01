'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { wishlistStore } from './wishlist-store';
import { FREE_DELIVERY_THRESHOLD, type WishlistCategory, type WishlistItem } from './types';
import { requestStorefrontClient } from '@/lib/api/client/http';

export function useWishlist() {
  const wishlist = useSyncExternalStore(wishlistStore.subscribe, wishlistStore.getSnapshot, wishlistStore.getServerSnapshot);
  const items = wishlist.items;
  const [activeCategory, setActiveCategory] = useState<WishlistCategory>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [removal, setRemoval] = useState<{ item: WishlistItem; ownerGeneration: number } | null>(null);
  const recentlyRemoved = removal?.ownerGeneration === wishlist.ownerGeneration ? removal.item : null;

  const showToast = (message: string) => setToastMessage(message);
  const clearToast = () => setToastMessage(null);

  const addItem = (item: WishlistItem, preferredVariantId?: string | null) => {
    try {
      const saved = wishlistStore.save(item, preferredVariantId);
      showToast(saved ? wishlist.mode === 'account' ? `Saving “${item.title}” to your account…`
        : `“${item.title}” saved in this browser` : 'The wishlist is not ready. Try again.');
      return saved;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save this product.');
      return false;
    }
  };
  const removeItem = (id: string, fallback?: WishlistItem) => {
    const item = fallback ?? wishlistStore.getSnapshot().items.find((entry) => entry.id === id);
    if (!item || wishlistStore.membership(id) !== true) return;
    if (wishlistStore.remove(id)) {
      setRemoval({ item, ownerGeneration: wishlistStore.getSnapshot().ownerGeneration });
      showToast(wishlist.mode === 'account' ? `Removing “${item.title}” from your account…`
        : `“${item.title}” removed from this browser`);
    } else showToast('Your browser could not update this wishlist. Try again.');
  };
  const toggleWishlist = (item: WishlistItem, preferredVariantId?: string | null) => {
    if (wishlistStore.membership(item.id)) {
      removeItem(item.id, item);
      return false;
    }
    return addItem(item, preferredVariantId);
  };
  const clearWishlist = () => {
    if (wishlistStore.replace([])) showToast('Your wishlist is now empty.');
    else showToast('Your browser could not update this wishlist. Try again.');
  };
  const undoRemove = async () => {
    if (!recentlyRemoved || removal?.ownerGeneration !== wishlistStore.getSnapshot().ownerGeneration) return;
    const removed = recentlyRemoved;
    const owner = removal.ownerGeneration;
    try {
      const eligible = await requestStorefrontClient<{ id: string }[]>('/api/storefront/v1/wishlist/products', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productIds: [removed.id] }),
      });
      if (wishlistStore.getSnapshot().ownerGeneration !== owner) return;
      if (!eligible.some((product) => product.id === removed.id)) {
        showToast('This product is no longer available to save.');
        setRemoval(null);
        return;
      }
      if (addItem(removed, removed.preferredVariantId)) setRemoval(null);
    } catch {
      if (wishlistStore.getSnapshot().ownerGeneration === owner)
        showToast('Could not check this product right now. Try Undo again.');
    }
  };
  const categoryCounts = useMemo(() => {
    const counts: Record<WishlistCategory, number> = { all: items.length, jewelry: 0, hair: 0, bags: 0, wraps: 0 };
    for (const item of items) if (item.category in counts) counts[item.category]++;
    return counts;
  }, [items]);
  const filteredItems = useMemo(() => activeCategory === 'all' ? items : items.filter((item) => item.category === activeCategory), [items, activeCategory]);
  const totalPrice = useMemo(() => items.reduce((sum, item) => sum + item.price, 0), [items]);
  const deliveryProgress = Math.min(100, Math.round((totalPrice / FREE_DELIVERY_THRESHOLD) * 100));

  return {
    activeCategory, addItem, amountNeededForFreeDelivery: Math.max(0, FREE_DELIVERY_THRESHOLD - totalPrice),
    categoryCounts, clearToast, clearWishlist, deliveryProgress, filteredItems,
    isInWishlist: (id: string) => wishlistStore.membership(id) === true,
    membership: wishlistStore.membership,
    isTransferringAll: false, items, moveAllToBag: () => showToast('Open a product to select a variant and add it to your bag.'),
    movedItemIds: new Set<string>(), moveToBag: (item: WishlistItem) => showToast(`Open “${item.title}” to choose a variant and add it to your bag.`),
    movingItemIds: new Set<string>(), recentlyRemoved, removeItem, setActiveCategory, showToast, toastMessage,
    toggleWishlist, totalPrice, undoRemove,
    updatePreferredVariant: wishlistStore.updatePreferredVariant,
    mode: wishlist.mode, sync: wishlist.sync,
    count: wishlist.count, nextCursor: wishlist.nextCursor, loadingMore: wishlist.loadingMore,
    ownerGeneration: wishlist.ownerGeneration, listVersion: wishlist.listVersion,
    ownerPartition: wishlist.ownerPartition,
    loadMore: wishlistStore.loadMore,
    syncMessage: wishlist.message, pendingIds: wishlist.pendingIds,
    retrySync: wishlistStore.retry, mergeReviewed: wishlist.mergeReviewed,
    mergeConflict: wishlist.mergeConflict,
    reviewMergeConflict: wishlistStore.reviewMergeConflict,
    confirmMergeAfterReview: wishlistStore.confirmMergeAfterReview,
  };
}
