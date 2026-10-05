import type { MetadataRoute } from 'next';

import { loadPublicCategories, loadPublicStorefrontContext } from '@/lib/api/server/catalog';
import { absoluteStorefrontUrl } from '@/lib/seo/url';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    '',
    '/categories',
    '/policies/shipping',
    '/policies/returns',
    '/policies/privacy',
    '/policies/terms',
  ].map((path) => ({
    url: absoluteStorefrontUrl(path || '/'),
    changeFrequency: 'weekly',
    priority: path ? 0.4 : 1,
  }));

  try {
    const context = await loadPublicStorefrontContext();
    const categories = await loadPublicCategories(context.organizationId);
    return [
      ...staticEntries,
      ...categories.map((category) => ({
        url: absoluteStorefrontUrl(`/categories/${category.path}`),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
