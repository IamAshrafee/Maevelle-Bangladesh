import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductCreator } from '@/components/products/product-creator';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'Edit Product' };

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense fallback={<PageSkeleton variant="form" widthVariant="standard" />}>
      <ProductCreator productId={productId} />
    </Suspense>
  );
}
