import type { Metadata } from 'next';

import { ProductCreate } from '@/components/products/product-create';

export const metadata: Metadata = { title: 'Create Product' };

export default function CreateProductPage() {
  return <ProductCreate />;
}
