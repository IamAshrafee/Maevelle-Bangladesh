import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProductList } from '@/components/products/product-list';

export const metadata: Metadata = { title: 'Products' };

export default function ProductsPage() {
  return (
    <Suspense
      fallback={<main className="px-8 py-12 text-sm text-muted-foreground">Loading Products…</main>}
    >
      <ProductList />
    </Suspense>
  );
}
