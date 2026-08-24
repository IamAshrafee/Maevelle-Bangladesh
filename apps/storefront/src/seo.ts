import type { StorefrontProductDto } from '@maevelle/contracts';

export function productJsonLd(product: StorefrontProductDto, canonicalUrl: string) {
  const offers = product.variants.flatMap((variant) =>
    variant.price
      ? [
          {
            '@type': 'Offer',
            sku: variant.sku,
            price: variant.price.amount,
            priceCurrency: variant.price.currency,
            availability: 'https://schema.org/InStock',
            url: canonicalUrl,
          },
        ]
      : [],
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    url: canonicalUrl,
    offers,
  };
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
