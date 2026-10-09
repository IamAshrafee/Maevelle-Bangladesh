import { describe, expect, it } from 'vitest';
import type { StorefrontCategoryDto } from '@maevelle/contracts';

import { buildProductBreadcrumbs } from './breadcrumbs';

describe('buildProductBreadcrumbs', () => {
  it('builds a fallback trail starting from Shop when no category is specified', () => {
    const crumbs = buildProductBreadcrumbs({
      title: 'Silk Velvet Scrunchie',
      handle: 'silk-velvet-scrunchie',
    });

    expect(crumbs).toEqual([
      { label: 'Shop', href: '/categories' },
      { label: 'Silk Velvet Scrunchie', current: true },
    ]);
  });

  it('includes primary category in the trail when present', () => {
    const crumbs = buildProductBreadcrumbs({
      title: 'Moonlight Pearl Drops',
      handle: 'moonlight-pearl-drops',
      primaryCategory: {
        name: 'Earrings',
        path: 'earrings',
      },
    });

    expect(crumbs).toEqual([
      { label: 'Shop', href: '/categories' },
      { label: 'Earrings', href: '/categories/earrings' },
      { label: 'Moonlight Pearl Drops', current: true },
    ]);
  });

  it('unrolls full ancestor hierarchy when category tree is available', () => {
    const categories: readonly StorefrontCategoryDto[] = [
      {
        id: 'cat-1',
        name: 'Jewelry & Accessories',
        handle: 'jewelry-accessories',
        path: 'jewelry-accessories',
        parentId: null,
        depth: 0,
      },
      {
        id: 'cat-2',
        name: 'Earrings',
        handle: 'earrings',
        path: 'jewelry-accessories/earrings',
        parentId: 'cat-1',
        depth: 1,
      },
    ];

    const crumbs = buildProductBreadcrumbs(
      {
        title: 'Golden Lotus Drops',
        handle: 'golden-lotus-drops',
        primaryCategory: {
          name: 'Earrings',
          path: 'jewelry-accessories/earrings',
        },
      },
      categories,
    );

    expect(crumbs).toEqual([
      { label: 'Shop', href: '/categories' },
      { label: 'Jewelry & Accessories', href: '/categories/jewelry-accessories' },
      { label: 'Earrings', href: '/categories/jewelry-accessories/earrings' },
      { label: 'Golden Lotus Drops', current: true },
    ]);
  });
});
