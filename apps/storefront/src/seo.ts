import type { StorefrontProductDto } from '@maevelle/contracts';

export function productJsonLd(
  product: StorefrontProductDto,
  canonicalUrl: string,
  publishedReviews?: readonly {
    authorName?: string;
    rating: number;
    title?: string | null;
    body?: string | null;
    datePublished?: string;
  }[],
) {
  const offers = product.variants.flatMap((variant) =>
    variant.price
      ? [
          {
            '@type': 'Offer',
            sku: variant.sku,
            price: variant.price.amount,
            priceCurrency: variant.price.currency,
            availability: variant.available
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: canonicalUrl,
          },
        ]
      : [],
  );

  const aggregateRating =
    product.ratingSummary &&
    product.ratingSummary.ratingCount > 0 &&
    product.ratingSummary.averageRating
      ? {
          '@type': 'AggregateRating',
          ratingValue:
            product.ratingSummary.formattedAverage ?? product.ratingSummary.averageRating,
          reviewCount: product.ratingSummary.ratingCount,
          bestRating: '5',
          worstRating: '1',
        }
      : undefined;

  const reviewMarkup = publishedReviews
    ?.filter((r) => r.rating >= 1 && r.rating <= 5)
    .slice(0, 10)
    .map((r) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: r.rating,
        bestRating: '5',
        worstRating: '1',
      },
      author: {
        '@type': 'Person',
        name: r.authorName ?? 'Verified customer',
      },
      ...(r.datePublished ? { datePublished: r.datePublished } : {}),
      ...(r.title || r.body
        ? { reviewBody: [r.title, r.body].filter(Boolean).join(' - ') }
        : {}),
    }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    image: product.media.map((asset) =>
      new URL(`/api/media/public/${asset.id}`, canonicalUrl).toString(),
    ),
    url: canonicalUrl,
    additionalProperty: product.details.map((detail) => ({
      '@type': 'PropertyValue',
      name: `${detail.group}: ${detail.label}`,
      value: detail.value,
    })),
    offers,
    ...(aggregateRating ? { aggregateRating } : {}),
    ...(reviewMarkup && reviewMarkup.length > 0 ? { review: reviewMarkup } : {}),
  };
}

export function faqJsonLd(faqs: StorefrontProductDto['faqs']) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
