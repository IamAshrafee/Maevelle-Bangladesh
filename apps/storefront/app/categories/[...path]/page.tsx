import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CatalogBrowser } from '@/features/catalog/components/catalog-browser';
import type { StorefrontSearchParams } from '@/features/catalog/search-params';
import { loadPublicCategories, loadPublicStorefrontContext } from '@/lib/api/server/catalog';

type CategoryRoute = {
  readonly params: Promise<{ path: string[] }>;
  readonly searchParams: Promise<StorefrontSearchParams>;
};

async function resolveCategory(path: readonly string[]) {
  const context = await loadPublicStorefrontContext();
  const categories = await loadPublicCategories(context.organizationId);
  const categoryPath = path.join('/');
  return {
    categoryPath,
    category: categories.find((entry) => entry.path === categoryPath),
  };
}

export async function generateMetadata({ params }: CategoryRoute): Promise<Metadata> {
  const { path } = await params;
  const { category, categoryPath } = await resolveCategory(path);
  if (!category) return { title: 'Category unavailable', robots: { index: false, follow: true } };

  return {
    title: category.name,
    description: `Browse published products in ${category.name}.`,
    alternates: { canonical: `/categories/${categoryPath}` },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryRoute) {
  const { path } = await params;
  const { category, categoryPath } = await resolveCategory(path);
  if (!category) notFound();

  return (
    <main>
      <section className="shell wide">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/categories">Shop</Link>
          <span aria-hidden="true">/</span>
          <span>{category.name}</span>
        </nav>
        <div className="collection-heading">
          <p className="eyebrow">Collection</p>
          <h1>{category.name}</h1>
          <p>Explore current styles and available variants in this collection.</p>
        </div>
        <CatalogBrowser
          categoryPath={categoryPath}
          pathname={`/categories/${categoryPath}`}
          searchParams={await searchParams}
        />
      </section>
    </main>
  );
}
