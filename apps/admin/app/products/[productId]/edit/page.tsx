import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProductCreator } from '@/components/products/product-creator';

export const metadata: Metadata = { title: 'Edit Product' };

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense
      fallback={
        <main className="px-8 py-12 text-sm text-muted-foreground">Loading Product editor…</main>
      }
    >
      <ProductCreator productId={productId} />
    </Suspense>
  );
}
