import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    '',
    '/policies/shipping',
    '/policies/returns',
    '/policies/privacy',
    '/policies/terms',
  ].map((path) => ({
    url: `http://localhost:8080${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: path ? 0.4 : 1,
  }));
}
