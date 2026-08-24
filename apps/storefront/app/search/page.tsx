import type { Metadata } from 'next';
import { CatalogBrowser } from '@/components/catalog-browser';
export const metadata: Metadata = {
  title: 'Search',
  description: 'Search Maevelle products by title, SKU, category, price, and availability.',
  robots: { index: false, follow: true },
};
export default function SearchPage() {
  return (
    <main>
      <section className="shell wide">
        <p className="eyebrow">Catalog</p>
        <h1>Search products</h1>
        <CatalogBrowser />
      </section>
    </main>
  );
}
