import type { Metadata } from 'next';

import { WishlistPageShell } from '@/features/wishlist/components/wishlist-page-shell';

export const metadata: Metadata = {
  title: 'Your Wishlist',
  description:
    'Saved heirloom accessories and artisanal edits reserved for your personal consideration at Maevelle Bangladesh.',
};

export default function WishlistPage() {
  return (
    <main className="min-h-screen bg-surface">
      <WishlistPageShell />
    </main>
  );
}
