import type { Metadata } from 'next';
import { CatalogBrowser } from '@/features/catalog/components/catalog-browser';
import type { StorefrontSearchParams } from '@/features/catalog/search-params';

export const metadata: Metadata = {
  title: 'Categories',
  description: 'Browse the Maevelle product category hierarchy.',
  alternates: { canonical: '/categories' },
};
export default async function CategoriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<StorefrontSearchParams>;
}) {
  return (
    <main>
      <section className="collection-hero shell wide">
        <p className="eyebrow">The full collection</p>
        <h1>Shop Maevelle</h1>
        <p>
          Explore every published piece, refine by price and availability, and find the right fit.
        </p>
        <CatalogBrowser pathname="/categories" searchParams={await searchParams} />
      </section>
    </main>
  );
}
