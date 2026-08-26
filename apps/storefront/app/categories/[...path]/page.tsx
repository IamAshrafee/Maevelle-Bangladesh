import type { Metadata } from 'next';
import Link from 'next/link';
import { CatalogBrowser } from '@/components/catalog-browser';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}): Promise<Metadata> {
  const { path } = await params;
  const name = path.at(-1)?.replaceAll('-', ' ') ?? 'Category';
  return {
    title: name,
    description: `Browse published products in ${name}.`,
    alternates: { canonical: `/categories/${path.join('/')}` },
  };
}
export default async function CategoryPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return (
    <main>
      <section className="shell wide">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/categories">Shop</Link>
          <span aria-hidden="true">/</span>
          <span>{path.at(-1)?.replaceAll('-', ' ')}</span>
        </nav>
        <div className="collection-heading">
          <p className="eyebrow">Collection</p>
          <h1>{path.at(-1)?.replaceAll('-', ' ')}</h1>
          <p>Explore current styles and available variants in this collection.</p>
        </div>
        <CatalogBrowser categoryPath={path.join('/')} />
      </section>
    </main>
  );
}
