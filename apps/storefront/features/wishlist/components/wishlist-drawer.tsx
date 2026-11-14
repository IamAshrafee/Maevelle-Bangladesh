'use client';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useWishlist } from '@/features/wishlist/use-wishlist';
import { WishlistPageShell } from './wishlist-page-shell';

export function WishlistDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { count, mode } = useWishlist();

  const subtitle =
    mode === 'resolving' || mode === 'expired' ? (
      'Your private saved collection'
    ) : (
      <>
        <span className="font-mono tabular-nums">{count}</span> {count === 1 ? 'piece' : 'pieces'}{' '}
        saved
      </>
    );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} subtitle={subtitle} title="Your Wishlist">
      <WishlistPageShell inDrawer mode="mobile" onNavigate={onClose} />
    </BottomSheet>
  );
}
