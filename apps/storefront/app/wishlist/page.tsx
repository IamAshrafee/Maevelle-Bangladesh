import type { Metadata } from 'next';

import { WishlistPageShell } from '@/features/wishlist/components/wishlist-page-shell';

export const metadata: Metadata = {
  title: 'Your Wishlist',
  description:
    'Your saved favorites, jewelry, and accessories reserved for your personal selection at Maevelle Bangladesh.',
};

export default function WishlistPage() {
  return (
    <main className="min-h-screen bg-surface">
      <WishlistPageShell />
    </main>
  );
}
