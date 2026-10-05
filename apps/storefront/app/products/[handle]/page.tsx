import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { ProductPageClient } from '@/components/product-page-client';
import { publicMediaPath } from '@/lib/media/url';
import { absoluteStorefrontUrl } from '@/lib/seo/url';
import { breadcrumbJsonLd, faqJsonLd, productJsonLd, safeJsonLd } from '@/lib/seo/structured-data';
import {
  loadPublicProduct,
  loadPublicProductReviews,
  loadPublicSizeGuide,
  loadPublicStorefrontContext,
} from '@/lib/api/server/catalog';

type ProductRoute = { readonly params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: ProductRoute): Promise<Metadata> {
  const { handle } = await params;
  const product = await loadPublicProduct(handle);
  const canonical = absoluteStorefrontUrl(
    `/products/${encodeURIComponent(product?.handle ?? handle)}`,
  );
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
  const images = product.media.map((asset) =>
    new URL(publicMediaPath(asset.id, 'pdp'), canonical).toString(),
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
  const [context, product] = await Promise.all([
    loadPublicStorefrontContext(),
    loadPublicProduct(handle),
  ]);
  if (!product) notFound();
  if (product.handle !== handle) permanentRedirect(`/products/${product.handle}`);

  const [reviewsData, sizeGuide] = await Promise.all([
    loadPublicProductReviews(product.id, context.organizationId, 5),
    loadPublicSizeGuide(product.handle, context.organizationId),
  ]);

  const canonical = absoluteStorefrontUrl(`/products/${encodeURIComponent(product.handle)}`);

  const publishedReviewsForSeo = reviewsData?.reviews.map((r) => ({
    authorName: r.publicDisplayName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    datePublished: r.submittedAt,
  }));

  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', url: absoluteStorefrontUrl('/') },
    { name: 'Shop', url: absoluteStorefrontUrl('/categories') },
    { name: product.title, url: canonical },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(productJsonLd(product, canonical, publishedReviewsForSeo)),
        }}
      />
      {product.faqs.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(product.faqs)) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
      <ProductPageClient
        initialProduct={product}
        initialGuide={sizeGuide}
        organizationId={context.organizationId}
        currency={context.currency}
        initialReviews={reviewsData?.reviews}
        initialSummary={reviewsData?.summary ?? product?.ratingSummary ?? undefined}
      />
    </>
  );
}
