import { describe, expect, it } from 'vitest';

import { catalogHref, parseCatalogSearchParams } from './search-params.js';

describe('catalog search parameters', () => {
  it('keeps only bounded, supported public filters', () => {
    expect(
      parseCatalogSearchParams({
        q: '  dress  ',
        minimumPrice: '-2',
        maximumPrice: '2500.00',
        availability: 'IN_STOCK',
        sort: 'PRICE_ASC',
        page: '3',
        ignored: 'value',
      }),
    ).toEqual({
      query: 'dress',
      maximumPrice: '2500.00',
      availability: 'IN_STOCK',
      sort: 'PRICE_ASC',
      page: 3,
    });
  });

  it('builds stable URLs without marketing or unknown parameters', () => {
    expect(
      catalogHref('/search', { query: 'bag', sort: 'NEWEST', page: 4 }, { page: undefined }),
    ).toBe('/search?q=bag&sort=NEWEST');
  });
});
