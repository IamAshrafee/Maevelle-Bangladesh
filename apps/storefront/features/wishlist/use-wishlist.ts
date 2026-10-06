'use client';

import { useEffect, useMemo, useState } from 'react';

import { CART_CHANGED_EVENT } from '@/features/cart/cart-events';
import {
  DEFAULT_WISHLIST_ITEMS,
  FREE_DELIVERY_THRESHOLD,
  type WishlistCategory,
  type WishlistItem,
} from '@/features/wishlist/types';
import { WISHLIST_CHANGED_EVENT } from '@/features/wishlist/wishlist-events';

const STORAGE_KEY = 'maevelle_wishlist_items_v1';

export function useWishlist() {
  const [items, setItems] = useState<WishlistItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // Fall back to defaults
      }
    }
    return [...DEFAULT_WISHLIST_ITEMS];
  });

  const [activeCategory, setActiveCategory] = useState<WishlistCategory>('all');
  const [movingItemIds, setMovingItemIds] = useState<Set<string>>(new Set());
  const [movedItemIds, setMovedItemIds] = useState<Set<string>>(new Set());
  const [isTransferringAll, setIsTransferringAll] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Synchronize with LocalStorage and dispatch event
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage errors
    }
    window.dispatchEvent(new CustomEvent(WISHLIST_CHANGED_EVENT, { detail: { count: items.length } }));
  }, [items]);

  const showToast = (message: string) => {
    setToastMessage(message);
  };

  const clearToast = () => {
    setToastMessage(null);
  };

  const removeItem = (id: string) => {
    const itemToRemove = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    showToast(
      itemToRemove
        ? `“${itemToRemove.title}” removed from your wishlist`
        : 'Piece removed from your wishlist',
    );
  };

  const clearWishlist = () => {
    setItems([]);
    showToast('Your wishlist has been cleared');
  };

  const moveToBag = (item: WishlistItem) => {
    if (movingItemIds.has(item.id) || movedItemIds.has(item.id)) return;

    setMovingItemIds((prev) => new Set(prev).add(item.id));

    setTimeout(() => {
      setMovingItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setMovedItemIds((prev) => new Set(prev).add(item.id));

      // Notify cart listeners
      window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
      showToast(`Added “${item.title}” to your shopping bag`);

      // Automatically transition from moved state after delay
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      }, 1200);
    }, 600);
  };

  const moveAllToBag = () => {
    if (isTransferringAll || items.length === 0) return;

    setIsTransferringAll(true);
    setTimeout(() => {
      setIsTransferringAll(false);
      window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
      showToast(`All ${items.length} available pieces transferred to your bag`);
      setItems([]);
    }, 800);
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<WishlistCategory, number> = {
      all: items.length,
      jewelry: 0,
      hair: 0,
      bags: 0,
      wraps: 0,
    };
    for (const item of items) {
      if (item.category in counts) {
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  const totalPrice = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price, 0);
  }, [items]);

  const deliveryProgress = useMemo(() => {
    if (FREE_DELIVERY_THRESHOLD <= 0) return 100;
    return Math.min(100, Math.round((totalPrice / FREE_DELIVERY_THRESHOLD) * 100));
  }, [totalPrice]);

  const amountNeededForFreeDelivery = useMemo(() => {
    return Math.max(0, FREE_DELIVERY_THRESHOLD - totalPrice);
  }, [totalPrice]);

  return {
    activeCategory,
    amountNeededForFreeDelivery,
    categoryCounts,
    clearToast,
    clearWishlist,
    deliveryProgress,
    filteredItems,
    isTransferringAll,
    items,
    moveAllToBag,
    movedItemIds,
    moveToBag,
    movingItemIds,
    removeItem,
    setActiveCategory,
    showToast,
    toastMessage,
    totalPrice,
  };
}
