import type { Metadata } from 'next';

import { CategoryConsole } from '@/components/category-console';

export const metadata: Metadata = { title: 'Categories' };

export default function CategoriesPage() {
  return <CategoryConsole />;
}
