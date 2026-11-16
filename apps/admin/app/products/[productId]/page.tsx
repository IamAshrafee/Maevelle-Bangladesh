import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductDetails } from '@/components/products/product-details';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'Product Details' };

export default async function ProductDetailsPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense fallback={<PageSkeleton variant="detail" widthVariant="wide" />}>
      <ProductDetails productId={productId} />
    </Suspense>
  );
}
