import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProductEditor } from '@/components/products/product-editor';

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
      <ProductEditor productId={productId} />
    </Suspense>
  );
}
