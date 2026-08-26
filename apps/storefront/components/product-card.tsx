import Link from 'next/link';

export interface StorefrontCardItem {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly minimumPrice: string | null;
  readonly currency: string | null;
  readonly available: boolean;
  readonly primaryMediaAssetId: string | null;
  readonly secondaryMediaAssetId: string | null;
  readonly averageRating: string | null;
  readonly reviewCount: number;
}

function money(amount: string, currency = 'BDT') {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function ProductCard({ item }: { readonly item: StorefrontCardItem }) {
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
              src={`/api/media/public/${item.primaryMediaAssetId}`}
              width="480"
            />
            {item.secondaryMediaAssetId ? (
              <img
                alt=""
                className="product-card-image secondary"
                decoding="async"
                height="640"
                loading="lazy"
                src={`/api/media/public/${item.secondaryMediaAssetId}`}
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
            ? `From ${money(item.minimumPrice, item.currency)}`
            : 'Price coming soon'}
        </p>
      </div>
    </article>
  );
}
