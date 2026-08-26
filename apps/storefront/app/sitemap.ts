import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.STOREFRONT_BASE_URL ?? 'http://localhost:8080';
  return [
    '',
    '/categories',
    '/policies/shipping',
    '/policies/returns',
    '/policies/privacy',
    '/policies/terms',
  ].map((path) => ({
    url: `${origin}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: path ? 0.4 : 1,
  }));
}
