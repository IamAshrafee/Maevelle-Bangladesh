import type { Metadata } from 'next';
import { CatalogBrowser } from '@/components/catalog-browser';
export const metadata: Metadata = {
  title: 'Categories',
  description: 'Browse the Maevelle product category hierarchy.',
};
export default function CategoriesPage() {
  return (
    <main>
      <section className="collection-hero shell wide">
        <p className="eyebrow">The full collection</p>
        <h1>Shop Maevelle</h1>
        <p>
          Explore every published piece, refine by price and availability, and find the right fit.
        </p>
        <CatalogBrowser />
      </section>
    </main>
  );
}
