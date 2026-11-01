'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useWishlist } from '@/features/wishlist/use-wishlist';
import { WishlistPageShell } from './wishlist-page-shell';

export function WishlistDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { count, mode } = useWishlist();
  const [keepMounted, setKeepMounted] = useState(false);
  useEffect(() => {
    if (isOpen) { setKeepMounted(true); return; }
    const timer = window.setTimeout(() => setKeepMounted(false), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen]);
  const subtitle = mode === 'resolving' || mode === 'expired' ? 'Your private saved collection'
    : <><span className="font-mono tabular-nums">{count}</span> {count === 1 ? 'piece' : 'pieces'} saved</>;
  return <BottomSheet isOpen={isOpen} onClose={onClose} subtitle={subtitle} title="Your Wishlist">
    {isOpen || keepMounted ? <WishlistPageShell inDrawer mode="mobile" onNavigate={onClose} /> : null}
  </BottomSheet>;
}
