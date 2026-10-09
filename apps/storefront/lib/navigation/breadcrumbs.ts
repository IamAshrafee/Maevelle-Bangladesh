import type { StorefrontCategoryDto } from '@maevelle/contracts';
import type { BreadcrumbItemDef } from '@/components/ui/breadcrumb';

export interface ProductBreadcrumbSource {
  readonly title: string;
  readonly handle?: string;
  readonly primaryCategory?: {
    readonly name: string;
    readonly path: string;
  } | null;
}

/**
 * Builds an accessible, hierarchical breadcrumb trail for a product details page.
 * Uses the product's primary category and full catalog categories tree when available,
 * and falls back cleanly to Shop > Product Title.
 */
export function buildProductBreadcrumbs(
  product: ProductBreadcrumbSource,
  categories?: readonly StorefrontCategoryDto[],
): BreadcrumbItemDef[] {
  const items: BreadcrumbItemDef[] = [
    { label: 'Shop', href: '/categories' },
  ];

  if (product.primaryCategory) {
    const rawPath = product.primaryCategory.path.replace(/^\/+|\/+$/g, '');
    const segments = rawPath.split('/').filter(Boolean);

    if (categories && categories.length > 0) {
      let cumulativePath = '';
      for (const segment of segments) {
        cumulativePath = cumulativePath ? `${cumulativePath}/${segment}` : segment;
        const matched = categories.find((cat) => cat.path === cumulativePath);
        if (matched) {
          items.push({
            label: matched.name,
            href: `/categories/${matched.path}`,
          });
        }
      }
    }

    // If segments didn't match any known category entries, still include the primaryCategory
    if (items.length === 1) {
      items.push({
        label: product.primaryCategory.name,
        href: `/categories/${rawPath}`,
      });
    }
  }

  items.push({
    label: product.title,
    current: true,
  });

  return items;
}
