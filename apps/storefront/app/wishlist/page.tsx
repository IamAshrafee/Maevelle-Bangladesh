import type { Metadata } from 'next';

import { WishlistPageShell } from '@/features/wishlist/components/wishlist-page-shell';

export const metadata: Metadata = {
  title: 'Your Wishlist',
  description: 'Your private saved Maevelle products.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default function WishlistPage() {
  return (
    <main className="min-h-screen bg-surface">
      <WishlistPageShell />
    </main>
  );
}
