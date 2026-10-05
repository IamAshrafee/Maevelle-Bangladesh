import { describe, expect, it } from 'vitest';

import { commerceItemDestinationIdentity, commerceItemFromProduct } from './commerce-item.js';
import { unknownConsentState } from './consent.js';

describe('commerce measurement foundation', () => {
  it('maps every destination to the stable sellable SKU identity', () => {
    const product = {
      id: 'product-1',
      handle: 'silk-scarf',
      title: 'Silk Scarf',
      description: null,
      seoTitle: null,
      seoDescription: null,
      options: [
        {
          id: 'colour',
          code: 'colour',
          name: 'Colour',
          isVisual: true,
          values: [{ id: 'rose', code: 'rose', label: 'Rose' }],
        },
      ],
      variants: [
        {
          id: 'sku-1',
          sku: 'SCARF-ROSE',
          optionValueIds: ['rose'],
          available: true,
          price: { amount: '990.0000', compareAtAmount: null, currency: 'BDT' },
        },
      ],
      media: [],
      details: [],
      faqs: [],
    } as const;
    const item = commerceItemFromProduct(product, product.variants[0], { quantity: 1 });
    expect(item).toMatchObject({
      productId: 'product-1',
      skuId: 'sku-1',
      variantName: 'Colour: Rose',
    });
    expect(commerceItemDestinationIdentity(item)).toMatchObject({
      ga4ItemId: 'sku-1',
      metaContentId: 'sku-1',
      merchantOfferId: 'sku-1',
      orderLineMerchandiseId: 'sku-1',
    });
  });

  it('defaults optional tracking consent to unknown rather than granted', () => {
    expect(unknownConsentState('2026-10-05T00:00:00.000Z')).toEqual({
      necessary: 'GRANTED',
      analytics: 'UNKNOWN',
      marketing: 'UNKNOWN',
      preferences: 'UNKNOWN',
      recordedAt: '2026-10-05T00:00:00.000Z',
    });
  });
});
