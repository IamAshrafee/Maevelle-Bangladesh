import { describe, expect, it } from 'vitest';

import {
  productReadinessResolutionHref,
  storefrontProductHref,
} from '../components/products/product-workspace-links';

describe('Product workspace links', () => {
  it('takes worklist attention directly to the owning Product editor section', () => {
    expect(productReadinessResolutionHref('product id', 'PUBLIC_MEDIA')).toBe(
      '/products/product%20id/edit?section=media',
    );
    expect(productReadinessResolutionHref('product-id', 'CURRENT_PRICE')).toBe(
      '/products/product-id/edit?section=variants',
    );
  });

  it('keeps the customer product handoff at the deployment root, outside Admin basePath', () => {
    expect(storefrontProductHref('linen & wrap')).toBe('/products/linen%20%26%20wrap');
  });
});
