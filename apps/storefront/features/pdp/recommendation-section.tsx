'use client';

import { useEffect, useRef } from 'react';
import type { CommerceItemDto, RecommendationSectionDto } from '@maevelle/contracts';
import { ProductCard } from '@/components/commerce/product-card';
import { WishlistMembershipHydrator } from '@/features/wishlist/wishlist-membership-hydrator';
import { publicMediaPath } from '@/lib/media/url';
import {
  createBrowserCommerceEvent,
  publishCommerceEvent,
  storefrontAnalyticsSessionId,
} from '@/lib/analytics/events';
import { currentCommerceConsent } from '@/lib/analytics/consent';

function commerceItem(item: RecommendationSectionDto['items'][number]): CommerceItemDto {
  return {
    productId: item.productId,
    skuId: item.presentationVariantId,
    sku: item.sku,
    itemName: item.title,
    price: item.price.amount,
    currency: item.price.currency,
  };
}

export function RecommendationSection({
  section,
  requestId,
}: {
  section: RecommendationSectionDto;
  requestId: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(false);
  const listName =
    section.placement === 'pdp_complementary' ? 'Complete Your Look' : 'You May Also Like';
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    const emit = () => {
      if (seen.current || !visible) return;
      const consent = currentCommerceConsent();
      if (consent.analytics !== 'GRANTED') return;
      seen.current = true;
      publishCommerceEvent(
        createBrowserCommerceEvent({
          name: 'PRODUCT_LIST_VIEWED',
          consent,
          sessionId: storefrontAnalyticsSessionId(),
          data: {
            listId: section.placement,
            listName,
            items: section.items.map(commerceItem),
            recommendationRequestId: requestId,
            placement: section.placement,
            strategyVersion: section.strategyVersion,
          },
        }),
      );
      observer.disconnect();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        emit();
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    window.addEventListener('maevelle:consent-changed', emit);
    return () => {
      observer.disconnect();
      window.removeEventListener('maevelle:consent-changed', emit);
    };
  }, [section, requestId, listName]);
  function selected(item: RecommendationSectionDto['items'][number]) {
    const consent = currentCommerceConsent();
    if (consent.analytics !== 'GRANTED') return;
    publishCommerceEvent(
      createBrowserCommerceEvent({
        name: 'PRODUCT_SELECTED',
        consent,
        sessionId: storefrontAnalyticsSessionId(),
        data: {
          item: commerceItem(item),
          listId: section.placement,
          position: item.position,
          recommendationRequestId: requestId,
          placement: section.placement,
          strategyVersion: section.strategyVersion,
        },
      }),
    );
  }
  return (
    <section
      ref={ref}
      aria-labelledby={`recommendation-${section.placement}`}
      className="space-y-5"
    >
      <WishlistMembershipHydrator productIds={section.items.map((item) => item.productId)} />
      <div className="space-y-1">
        <h2
          id={`recommendation-${section.placement}`}
          className="font-serif text-2xl font-semibold text-on-surface sm:text-3xl"
        >
          {listName}
        </h2>
        <p className="text-sm text-on-surface-variant">
          {section.placement === 'pdp_complementary'
            ? 'Pieces to style together'
            : 'Explore other pieces you might love'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {section.items.map((item) => (
          <ProductCard
            key={item.productId}
            id={item.productId}
            href={`/products/${encodeURIComponent(item.handle)}`}
            title={item.title}
            price={item.price.amount}
            imageUrl={publicMediaPath(item.mediaAssetId, 'card')}
            imageAlt={item.imageAlt}
            onClick={() => selected(item)}
            variant="auto"
          />
        ))}
      </div>
    </section>
  );
}
