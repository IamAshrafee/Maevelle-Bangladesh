import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductCreator } from '@/components/products/product-creator';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'New Product' };

export default function CreateProductPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" widthVariant="standard" />}>
      <ProductCreator />
    </Suspense>
  );
}
