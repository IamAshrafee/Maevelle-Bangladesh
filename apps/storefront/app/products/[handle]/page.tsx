import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { ProductPageClient } from '@/components/product-page-client';
import { publicMediaPath } from '@/lib/media/url';
import { absoluteStorefrontUrl } from '@/lib/seo/url';
import { breadcrumbJsonLd, faqJsonLd, productJsonLd, safeJsonLd } from '@/lib/seo/structured-data';
import {
  loadPublicCategories,
  loadPublicProduct,
  loadPublicProductReviews,
  loadPublicSizeGuide,
  loadPublicStorefrontContext,
  searchPublicCatalog,
} from '@/lib/api/server/catalog';
import { buildProductBreadcrumbs } from '@/lib/navigation/breadcrumbs';

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

  const [reviewsData, sizeGuide, searchResult, categories] = await Promise.all([
    loadPublicProductReviews(product.id, context.organizationId, 5),
    loadPublicSizeGuide(product.handle, context.organizationId),
    searchPublicCatalog(context.organizationId, {
      sort: 'RELEVANCE',
      page: 1,
    }).catch(() => null),
    loadPublicCategories(context.organizationId).catch(() => []),
  ]);

  const crossSells = (searchResult?.items ?? [])
    .filter((item) => item.id !== product.id)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      handle: item.handle,
      title: item.title,
      price: item.minimumPrice ?? '0',
      currency: item.currency ?? context.currency,
      imageUrl: item.primaryMediaAssetId
        ? publicMediaPath(item.primaryMediaAssetId, 'thumbnail')
        : '',
      imageAlt: item.title,
      badge: 'Curated',
    }));

  const canonical = absoluteStorefrontUrl(`/products/${encodeURIComponent(product.handle)}`);

  const publishedReviewsForSeo = reviewsData?.reviews.map((r) => ({
    authorName: r.publicDisplayName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    datePublished: r.submittedAt,
  }));

  const breadcrumbItems = buildProductBreadcrumbs(product, categories);

  const breadcrumb = breadcrumbJsonLd(
    breadcrumbItems.map((item) => ({
      name: item.label,
      url: item.href ? absoluteStorefrontUrl(item.href) : canonical,
    })),
  );

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
        crossSells={crossSells}
        breadcrumbs={breadcrumbItems}
      />
    </>
  );
}
