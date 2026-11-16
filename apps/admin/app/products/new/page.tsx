import type { Metadata } from 'next';
import { ProductCreator } from '@/components/products/product-creator';

export const metadata: Metadata = { title: 'New Product' };

export default function CreateProductPage() {
  return <ProductCreator />;
}
