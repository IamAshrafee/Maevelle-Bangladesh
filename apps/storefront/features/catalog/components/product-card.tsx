import type { StorefrontSearchItemDto } from '@maevelle/contracts';

import { ProductCard as CommerceProductCard } from '@/components/commerce/product-card';
import { publicMediaPath } from '@/lib/media/url';

export function ProductCard({ item }: { readonly item: StorefrontSearchItemDto }) {
  const imageUrl = item.primaryMediaAssetId
    ? publicMediaPath(item.primaryMediaAssetId, 'card')
    : '';
  const secondaryImageUrl = item.secondaryMediaAssetId
    ? publicMediaPath(item.secondaryMediaAssetId, 'card')
    : undefined;

  const rating =
    item.averageRating && item.reviewCount > 0
      ? {
          score: Number(item.averageRating),
          count: item.reviewCount,
        }
      : undefined;

  return (
    <CommerceProductCard
      href={`/products/${item.handle}`}
      id={item.id}
      imageUrl={imageUrl}
      isSoldOut={!item.available}
      price={item.minimumPrice ?? 0}
      rating={rating}
      secondaryImageUrl={secondaryImageUrl}
      subtitle={item.description ?? undefined}
      title={item.title}
    />
  );
}
