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
        <div className="collection-heading">
          <p className="eyebrow">Find your next piece</p>
          <h1>Search Maevelle</h1>
          <p>Search by product name, SKU, or collection. Small typos are okay.</p>
        </div>
        <CatalogBrowser />
      </section>
    </main>
  );
}
