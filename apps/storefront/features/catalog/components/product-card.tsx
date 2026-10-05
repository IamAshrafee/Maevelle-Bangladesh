import Link from 'next/link';

import type { StorefrontSearchItemDto } from '@maevelle/contracts';

import { formatMoney } from '@/lib/format/money';
import { publicMediaPath } from '@/lib/media/url';

export function ProductCard({ item }: { readonly item: StorefrontSearchItemDto }) {
  return (
    <article className="product-card">
      <Link
        className="product-card-media"
        href={`/products/${item.handle}`}
        aria-label={item.title}
      >
        {item.primaryMediaAssetId ? (
          <>
            <img
              alt=""
              className="product-card-image primary"
              decoding="async"
              height="640"
              loading="lazy"
              src={publicMediaPath(item.primaryMediaAssetId, 'card')}
              width="480"
            />
            {item.secondaryMediaAssetId ? (
              <img
                alt=""
                className="product-card-image secondary"
                decoding="async"
                height="640"
                loading="lazy"
                src={publicMediaPath(item.secondaryMediaAssetId, 'card')}
                width="480"
              />
            ) : null}
          </>
        ) : (
          <span className="product-image-fallback" aria-hidden="true">
            M
          </span>
        )}
        {!item.available ? <span className="product-badge">Out of stock</span> : null}
      </Link>
      <div className="product-card-copy">
        {item.averageRating && item.reviewCount > 0 ? (
          <p
            className="rating"
            aria-label={`${Number(item.averageRating).toFixed(1)} out of 5 from ${item.reviewCount} reviews`}
          >
            <span aria-hidden="true">★</span> {Number(item.averageRating).toFixed(1)}{' '}
            <small>({item.reviewCount})</small>
          </p>
        ) : (
          <p className="rating muted">New arrival</p>
        )}
        <h3>
          <Link href={`/products/${item.handle}`}>{item.title}</Link>
        </h3>
        <p className="product-card-description">
          {item.description ?? 'Discover the details and available options.'}
        </p>
        <p className="product-price">
          {item.minimumPrice && item.currency
            ? `From ${formatMoney(item.minimumPrice, item.currency)}`
            : 'Price coming soon'}
        </p>
      </div>
    </article>
  );
}
