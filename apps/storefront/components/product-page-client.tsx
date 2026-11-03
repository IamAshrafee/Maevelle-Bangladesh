'use client';

import type {
  ProductRatingSummaryDto,
  PublicReviewDto,
  PublicSizeGuideDto,
  StorefrontProductDto,
} from '@maevelle/contracts';
import { useEffect } from 'react';
import { cartStore } from '@/features/cart/browser-runtime';
import { useCartBusy, useCartEpoch } from '@/features/cart/use-cart';
import { useWishlist } from '@/features/wishlist/use-wishlist';
import { wishlistStore } from '@/features/wishlist/wishlist-store';
import { PdpView } from '@/features/pdp';
import type { BreadcrumbItemDef } from '@/components/ui/breadcrumb';

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
  const busy = useCartBusy();
  const cartEpoch = useCartEpoch();
  const { membership, toggleWishlist, pendingIds, mode, listVersion, ownerGeneration } =
    useWishlist();
  const wishlisted = membership(initialProduct.id);
  useEffect(() => {
    if (mode === 'account') void wishlistStore.hydrateSavedState([initialProduct.id]);
  }, [mode, listVersion, ownerGeneration, initialProduct.id]);

  async function handleAddToCart(variantId: string, quantity: number) {
    await cartStore.addItem(variantId, quantity);
  }

  function handleWishlistToggle(preferredVariantId: string | null) {
    // Build a lightweight WishlistItem from the product for toggle
    const primaryMedia = initialProduct.media.find((m) => m.isPrimary) ?? initialProduct.media[0];
    toggleWishlist(
      {
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
      },
      preferredVariantId,
    );
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
      cartMessage=""
      cartEpoch={cartEpoch}
    />
  );
}
