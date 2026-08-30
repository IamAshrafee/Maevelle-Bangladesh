import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProductDetails } from '@/components/products/product-details';

export const metadata: Metadata = { title: 'Product Details' };

export default async function ProductDetailsPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense
      fallback={<main className="px-8 py-12 text-sm text-muted-foreground">Loading Product…</main>}
    >
      <ProductDetails productId={productId} />
    </Suspense>
  );
}
