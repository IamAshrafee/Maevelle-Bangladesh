import { describe, expect, it } from 'vitest';

import { storefrontSeoPolicy } from './route-policy.js';
import { faqJsonLd, productJsonLd, safeJsonLd } from './structured-data.js';

describe('Storefront SEO foundation', () => {
  it('keeps private workflow routes out of the index and sitemap', () => {
    for (const route of [
      'CHECKOUT',
      'ORDER_CONFIRMATION',
      'ORDER_TRACKING',
      'REVIEW_SUBMISSION',
    ] as const) {
      expect(storefrontSeoPolicy[route]).toMatchObject({ index: false, includeInSitemap: false });
    }
  });

  it('uses stable product identity and authoritative variant offers', () => {
    const data = productJsonLd(
      {
        id: 'p1',
        handle: 'linen-dress',
        title: 'Linen Dress',
        description: '<script>alert(1)</script>',
        seoTitle: null,
        seoDescription: null,
        options: [],
        variants: [
          {
            id: 'v1',
            sku: 'DRESS-1',
            optionValueIds: [],
            price: { amount: '1290.0000', compareAtAmount: null, currency: 'BDT' },
            available: true,
          },
        ],
        media: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            variantId: null,
            optionValueId: null,
            role: 'PRIMARY',
            altText: 'Linen dress',
            isPrimary: true,
          },
        ],
        details: [],
        faqs: [],
      },
      'https://shop.example/products/linen-dress',
    );
    expect(data).toMatchObject({ productID: 'p1' });
    expect(data.offers[0]).toMatchObject({ sku: 'DRESS-1', priceCurrency: 'BDT' });
    expect(data.image).toEqual([
      'https://shop.example/api/media/public/11111111-1111-4111-8111-111111111111?rendition=pdp',
    ]);
    expect(safeJsonLd(data)).not.toContain('<script>');
  });

  it('escapes FAQ markup before embedding JSON', () => {
    const faq = faqJsonLd([{ question: 'Is it safe?', answer: 'Yes <script>alert(1)</script>' }]);
    expect(safeJsonLd(faq)).not.toContain('<script>');
  });
});
