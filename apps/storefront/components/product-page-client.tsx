'use client';

import type {
  ProductRatingSummaryDto,
  PublicReviewDto,
  PublicSizeGuideDto,
  StorefrontProductDto,
} from '@maevelle/contracts';
import { useState } from 'react';
import { notifyCartChanged } from '@/features/cart/cart-events';
import { useWishlist } from '@/features/wishlist/use-wishlist';
import { requestStorefrontClient, StorefrontClientApiError } from '@/lib/api/client/http';
import { PdpView } from '@/features/pdp';

interface CartView {
  version: number;
  merchandiseNet: string;
  lines: readonly { id: string }[];
}

export interface ProductPageClientProps {
  readonly initialProduct: StorefrontProductDto;
  readonly initialGuide: PublicSizeGuideDto | null;
  readonly organizationId: string;
  readonly currency: string;
  readonly initialReviews?: readonly PublicReviewDto[] | undefined;
  readonly initialSummary?: ProductRatingSummaryDto | undefined;
}

export function ProductPageClient({
  initialProduct,
  initialGuide,
  organizationId,
  currency,
  initialReviews,
  initialSummary,
}: ProductPageClientProps) {
  const [cart, setCart] = useState<CartView>();
  const [cartMessage, setCartMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const { isInWishlist, toggleWishlist } = useWishlist();
  const wishlisted = isInWishlist(initialProduct.id);

  async function loadOrCreateCart(): Promise<CartView> {
    try {
      return await requestStorefrontClient<CartView>('/api/storefront/v1/carts/current');
    } catch (error) {
      if (!(error instanceof StorefrontClientApiError) || error.status !== 404) throw error;
      return requestStorefrontClient<CartView>('/api/storefront/v1/carts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId, currency }),
      });
    }
  }

  async function handleAddToCart(variantId: string, quantity: number) {
    setBusy(true);
    setCartMessage('');
    try {
      const current = cart ?? (await loadOrCreateCart());
      const next = await requestStorefrontClient<CartView>(
        '/api/storefront/v1/carts/current/lines',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ variantId, quantity: String(quantity), version: current.version }),
        },
      );
      setCart(next);
      notifyCartChanged();
      setCartMessage('Added to your bag.');
      // Clear message after 3s
      setTimeout(() => setCartMessage(''), 3000);
    } catch (error) {
      setCartMessage(error instanceof Error ? error.message : 'Your bag could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  function handleWishlistToggle() {
    // Build a lightweight WishlistItem from the product for toggle
    const primaryMedia = initialProduct.media.find((m) => m.isPrimary) ?? initialProduct.media[0];
    toggleWishlist({
      id: initialProduct.id,
      handle: initialProduct.handle,
      title: initialProduct.title,
      subtitle: 'Maevelle Atelier',
      category: 'hair',
      categoryLabel: 'Hair',
      price: 0,
      imageUrl: primaryMedia ? `/api/media/public/${primaryMedia.id}?rendition=thumbnail` : '',
      alt: primaryMedia?.altText ?? initialProduct.title,
      inStock: initialProduct.variants.some((v) => v.available),
    });
  }

  return (
    <PdpView
      product={initialProduct}
      guide={initialGuide}
      organizationId={organizationId}
      currency={currency}
      initialReviews={initialReviews}
      initialSummary={initialSummary}
      wishlisted={wishlisted}
      onWishlistToggle={handleWishlistToggle}
      onAddToCart={handleAddToCart}
      busy={busy}
      cartMessage={cartMessage}
    />
  );
}
