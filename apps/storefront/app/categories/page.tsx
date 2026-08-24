import type { Metadata } from 'next';
import { CatalogBrowser } from '@/components/catalog-browser';
export const metadata: Metadata = {
  title: 'Categories',
  description: 'Browse the Maevelle product category hierarchy.',
};
export default function CategoriesPage() {
  return (
    <main>
      <section className="shell wide">
        <h1>Categories</h1>
        <CatalogBrowser />
      </section>
    </main>
  );
}
