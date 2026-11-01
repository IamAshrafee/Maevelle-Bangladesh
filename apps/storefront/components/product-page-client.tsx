'use client';

import type {
  ProductRatingSummaryDto,
  PublicReviewDto,
  PublicSizeGuideDto,
  StorefrontProductDto,
} from '@maevelle/contracts';
import { useEffect, useState } from 'react';
import { notifyCartChanged } from '@/features/cart/cart-events';
import { useWishlist } from '@/features/wishlist/use-wishlist';
import { wishlistStore } from '@/features/wishlist/wishlist-store';
import { requestStorefrontClient, StorefrontClientApiError } from '@/lib/api/client/http';
import { PdpView } from '@/features/pdp';
import type { BreadcrumbItemDef } from '@/components/ui/breadcrumb';

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
  readonly breadcrumbs?: readonly BreadcrumbItemDef[] | undefined;
}

export function ProductPageClient({
  initialProduct,
  initialGuide,
  organizationId,
  currency,
  initialReviews,
  initialSummary,
  breadcrumbs,
}: ProductPageClientProps) {
  const [cart, setCart] = useState<CartView>();
  const [cartMessage, setCartMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const { membership, toggleWishlist, pendingIds, mode, listVersion, ownerGeneration } = useWishlist();
  const wishlisted = membership(initialProduct.id);
  useEffect(() => {
    if (mode === 'account') void wishlistStore.hydrateSavedState([initialProduct.id]);
  }, [mode, listVersion, ownerGeneration, initialProduct.id]);

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

  function handleWishlistToggle(preferredVariantId: string | null) {
    // Build a lightweight WishlistItem from the product for toggle
    const primaryMedia = initialProduct.media.find((m) => m.isPrimary) ?? initialProduct.media[0];
    toggleWishlist({
      id: initialProduct.id,
      handle: initialProduct.handle,
      title: initialProduct.title,
      subtitle: 'Maevelle Bangladesh',
      category: 'all',
      categoryLabel: 'Saved product',
      price: Number(initialProduct.variants.find((variant) => variant.price)?.price?.amount ?? 0),
      imageUrl: primaryMedia ? `/api/media/public/${primaryMedia.id}?rendition=thumbnail` : '',
      alt: primaryMedia?.altText ?? initialProduct.title,
      inStock: initialProduct.variants.some((v) => v.available),
    }, preferredVariantId);
  }

  return (
    <PdpView
      product={initialProduct}
      guide={initialGuide}
      organizationId={organizationId}
      currency={currency}
      initialReviews={initialReviews}
      initialSummary={initialSummary}
      breadcrumbs={breadcrumbs}
      wishlisted={wishlisted}
      wishlistPending={pendingIds.includes(initialProduct.id)}
      onWishlistToggle={handleWishlistToggle}
      onAddToCart={handleAddToCart}
      busy={busy}
      cartMessage={cartMessage}
    />
  );
}
