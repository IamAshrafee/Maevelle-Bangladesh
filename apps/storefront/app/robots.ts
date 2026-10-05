import type { MetadataRoute } from 'next';

import { absoluteStorefrontUrl } from '@/lib/seo/url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/'],
    },
    sitemap: absoluteStorefrontUrl('/sitemap.xml'),
  };
}
