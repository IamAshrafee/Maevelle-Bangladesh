import type { StorefrontProductDto } from '@maevelle/contracts';

import { publicMediaPath } from '../media/url';

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
    ?.filter((review) => review.rating >= 1 && review.rating <= 5)
    .slice(0, 10)
    .map((review) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating,
        bestRating: '5',
        worstRating: '1',
      },
      author: { '@type': 'Person', name: review.authorName ?? 'Verified customer' },
      ...(review.datePublished ? { datePublished: review.datePublished } : {}),
      ...(review.title || review.body
        ? { reviewBody: [review.title, review.body].filter(Boolean).join(' - ') }
        : {}),
    }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    image: product.media.map((asset) =>
      new URL(publicMediaPath(asset.id, 'pdp'), canonicalUrl).toString(),
    ),
    url: canonicalUrl,
    sku: product.variants.length === 1 ? product.variants[0]?.sku : undefined,
    productID: product.id,
    additionalProperty: product.details.map((detail) => ({
      '@type': 'PropertyValue',
      name: `${detail.group}: ${detail.label}`,
      value: detail.value,
    })),
    offers,
    ...(aggregateRating ? { aggregateRating } : {}),
    ...(reviewMarkup?.length ? { review: reviewMarkup } : {}),
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

export function breadcrumbJsonLd(
  items: readonly { readonly name: string; readonly url: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
