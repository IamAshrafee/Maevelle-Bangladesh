import type { Metadata } from 'next';
import { ProductCreator } from '@/components/products/product-creator';

export const metadata: Metadata = { title: 'Edit Product' };

export default async function ProductEditorPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductCreator productId={productId} />;
}
