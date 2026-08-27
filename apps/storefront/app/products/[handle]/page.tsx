import type { Metadata } from 'next';

import { ProductPageClient } from '@/components/product-page-client';
import { faqJsonLd, productJsonLd, safeJsonLd } from '@/src/seo';
import { loadPublicProduct, storefrontPublicBaseUrl } from '@/src/server-catalog';

type ProductRoute = { readonly params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: ProductRoute): Promise<Metadata> {
  const { handle } = await params;
  const product = await loadPublicProduct(handle);
  const canonical = `${storefrontPublicBaseUrl}/products/${encodeURIComponent(handle)}`;
  if (!product)
    return {
      title: 'Product unavailable',
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  const title = product.seoTitle?.trim() || product.title;
  const description =
    product.seoDescription?.trim() ||
    product.description?.trim() ||
    `Shop ${product.title} from Maevelle Bangladesh.`;
  const images = product.media.map(
    (asset) => `${storefrontPublicBaseUrl}/api/media/public/${asset.id}`,
  );
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      ...(images.length > 0 ? { images } : {}),
    },
  };
}

export default async function ProductPage({ params }: ProductRoute) {
  const { handle } = await params;
  const product = await loadPublicProduct(handle);
  const canonical = `${storefrontPublicBaseUrl}/products/${encodeURIComponent(handle)}`;
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: storefrontPublicBaseUrl },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Shop',
        item: `${storefrontPublicBaseUrl}/categories`,
      },
      ...(product
        ? [{ '@type': 'ListItem', position: 3, name: product.title, item: canonical }]
        : []),
    ],
  };
  return (
    <>
      {product ? (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd(product, canonical)) }}
          />
          {product.faqs.length > 0 ? (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(product.faqs)) }}
            />
          ) : null}
        </>
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
      <ProductPageClient />
    </>
  );
}
