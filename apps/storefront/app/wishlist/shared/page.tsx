import type { Metadata } from 'next';
import { SharedWishlist } from '@/features/wishlist/components/shared-wishlist';

export const metadata: Metadata = {
  title: 'Shared Maevelle Favorites',
  description: 'A private collection of Maevelle favorites shared with you.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function SharedWishlistPage() { return <SharedWishlist />; }
