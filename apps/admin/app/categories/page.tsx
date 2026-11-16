import type { Metadata } from 'next';
import { CategoryConsole } from '@/components/category-console';
import { ModuleLayout } from '@/components/ui/module-nav';

export const metadata: Metadata = { title: 'Categories' };

export default function CategoriesPage() {
  return (
    <ModuleLayout moduleId="products" widthVariant="wide" ariaLabel="Catalog navigation">
      <CategoryConsole />
    </ModuleLayout>
  );
}
