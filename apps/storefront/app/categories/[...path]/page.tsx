import type { Metadata } from 'next';
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
        <nav aria-label="Breadcrumb">Home / {path.join(' / ')}</nav>
        <h1>{path.at(-1)?.replaceAll('-', ' ')}</h1>
        <CatalogBrowser categoryPath={path.join('/')} />
      </section>
    </main>
  );
}
