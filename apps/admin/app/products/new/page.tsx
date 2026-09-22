import type { Metadata } from 'next';

import { Suspense } from 'react';
import { ProductCreator } from '@/components/products/product-creator';

export const metadata: Metadata = { title: 'New Product' };

export default function CreateProductPage() {
  return (
    <Suspense fallback={<main className="px-8 py-12 text-sm text-muted-foreground">Loading Product creator…</main>}>
      <ProductCreator />
    </Suspense>
  );
}
