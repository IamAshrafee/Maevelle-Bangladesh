import type { Metadata } from 'next';

import { CatalogConsole } from '@/components/catalog-console';

export const metadata: Metadata = { title: 'Products' };

export default function ProductsPage() {
  return <CatalogConsole />;
}
