import type { Metadata } from 'next';
import { CatalogBrowser } from '@/features/catalog/components/catalog-browser';
import type { StorefrontSearchParams } from '@/features/catalog/search-params';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search Maevelle products by title, SKU, category, price, and availability.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/search' },
};
export default async function SearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<StorefrontSearchParams>;
}) {
  return (
    <main>
      <section className="shell wide">
        <div className="collection-heading">
          <p className="eyebrow">Find your next piece</p>
          <h1>Search Maevelle</h1>
          <p>Search by product name, SKU, or collection. Small typos are okay.</p>
        </div>
        <CatalogBrowser pathname="/search" searchParams={await searchParams} />
      </section>
    </main>
  );
}
