import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductList } from '@/components/products/product-list';
import { ModuleLayout } from '@/components/ui/module-nav';
import { PageSkeleton } from '@/components/ui/page-shell';

export const metadata: Metadata = { title: 'Products' };

export default function ProductsPage() {
  return (
    <ModuleLayout moduleId="products" widthVariant="wide" ariaLabel="Catalog navigation">
      <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
        <ProductList />
      </Suspense>
    </ModuleLayout>
  );
}
