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
            availability: variant.available
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
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
