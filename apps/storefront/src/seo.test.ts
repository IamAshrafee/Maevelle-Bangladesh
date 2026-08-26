import { describe, expect, it } from 'vitest';
import { productJsonLd, safeJsonLd } from './seo.js';

describe('Storefront structured data', () => {
  it('matches authoritative public product price and excludes executable markup', () => {
    const data = productJsonLd(
      {
        id: 'p1',
        handle: 'linen-dress',
        title: 'Linen Dress',
        description: '<script>alert(1)</script>',
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
            role: 'PRIMARY',
            altText: 'Linen dress',
          },
        ],
        details: [],
        faqs: [],
      },
      'https://shop.example/products/linen-dress',
    );
    expect(data.offers[0]).toMatchObject({
      price: '1290.0000',
      priceCurrency: 'BDT',
      sku: 'DRESS-1',
      availability: 'https://schema.org/InStock',
    });
    expect(data.image).toEqual([
      'https://shop.example/api/media/public/11111111-1111-4111-8111-111111111111',
    ]);
    expect(safeJsonLd(data)).not.toContain('<script>');
  });
});
