import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductCard } from '@/features/catalog/components/product-card';
import {
  catalogHref,
  parseCatalogSearchParams,
  type StorefrontSearchParams,
} from '@/features/catalog/search-params';
import {
  loadPublicCategories,
  loadPublicStorefrontContext,
  searchPublicCatalog,
  type StorefrontSearchQuery,
} from '@/lib/api/server/catalog';

interface CatalogBrowserProps {
  readonly categoryPath?: string;
  readonly pathname?: string;
  readonly searchParams?: StorefrontSearchParams;
}

interface CatalogResultsProps extends CatalogBrowserProps {
  readonly mode: 'BROWSE' | 'FEATURED';
}

const filterKeys = ['query', 'minimumPrice', 'maximumPrice', 'availability'] as const;

function filterLabel(key: (typeof filterKeys)[number], value: string): string {
  if (key === 'query') return `Search: ${value}`;
  if (key === 'minimumPrice') return `From ৳${value}`;
  if (key === 'maximumPrice') return `Up to ৳${value}`;
  return value === 'IN_STOCK' ? 'In stock' : 'Out of stock';
}

async function CatalogResults({
  categoryPath,
  mode,
  pathname = '/categories',
  searchParams = {},
}: CatalogResultsProps) {
  const featured = mode === 'FEATURED';
  const context = await loadPublicStorefrontContext();
  const categories =
    categoryPath || !featured ? await loadPublicCategories(context.organizationId) : [];
  const currentCategory = categoryPath
    ? categories.find((category) => category.path === categoryPath)
    : undefined;
  if (categoryPath && !currentCategory) notFound();

  const parsed = featured ? ({ sort: 'NEWEST' } as const) : parseCatalogSearchParams(searchParams);
  const query: StorefrontSearchQuery = {
    ...parsed,
    ...(currentCategory ? { categoryId: currentCategory.id } : {}),
  };
  const result = await searchPublicCatalog(context.organizationId, query);
  const items = featured ? result.items.slice(0, 8) : result.items;

  if (featured)
    return (
      <div className="product-grid">
        {items.map((item) => (
          <ProductCard item={item} key={item.id} />
        ))}
      </div>
    );

  const children = categories.filter((category) =>
    currentCategory ? category.parentId === currentCategory.id : category.depth === 0,
  );
  const activeFilters = filterKeys.flatMap((key) => {
    const value = parsed[key];
    return value ? [{ key, label: filterLabel(key, String(value)) }] : [];
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <section className="catalog-browser" aria-label="Product collection">
      {children.length ? (
        <nav className="subcategory-row" aria-label="Subcategories">
          {children.map((category) => (
            <Link key={category.id} href={`/categories/${category.path}`}>
              {category.name}
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="catalog-toolbar">
        <p aria-live="polite">
          {result.total} product{result.total === 1 ? '' : 's'}
        </p>
        <details className="relative">
          <summary className="filter-trigger cursor-pointer list-none">Filter and sort</summary>
          <form
            action={pathname}
            className="absolute right-0 z-20 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-4 rounded border border-stone-200 bg-white p-4 shadow-lg"
            method="get"
          >
            <label>
              Search
              <input
                name="q"
                type="search"
                defaultValue={parsed.query ?? ''}
                placeholder="Product name or SKU"
              />
            </label>
            <div className="price-fields">
              <label>
                Minimum price
                <input
                  inputMode="decimal"
                  name="minimumPrice"
                  defaultValue={parsed.minimumPrice ?? ''}
                />
              </label>
              <label>
                Maximum price
                <input
                  inputMode="decimal"
                  name="maximumPrice"
                  defaultValue={parsed.maximumPrice ?? ''}
                />
              </label>
            </div>
            <label>
              Availability
              <select name="availability" defaultValue={parsed.availability ?? ''}>
                <option value="">All products</option>
                <option value="IN_STOCK">In stock</option>
                <option value="OUT_OF_STOCK">Out of stock</option>
              </select>
            </label>
            <label>
              Sort
              <select
                name="sort"
                defaultValue={parsed.sort ?? (parsed.query ? 'RELEVANCE' : 'NEWEST')}
              >
                <option value="RELEVANCE">Relevance</option>
                <option value="NEWEST">Newest</option>
                <option value="PRICE_ASC">Price: low to high</option>
                <option value="PRICE_DESC">Price: high to low</option>
              </select>
            </label>
            <button type="submit">Show results</button>
          </form>
        </details>
      </div>

      {activeFilters.length ? (
        <div className="filter-chips" aria-label="Applied filters">
          {activeFilters.map((filter) => (
            <Link
              key={filter.key}
              href={catalogHref(pathname, parsed, { [filter.key]: undefined, page: undefined })}
            >
              {filter.label} <span aria-hidden="true">×</span>
            </Link>
          ))}
          <Link href={pathname}>Clear all</Link>
        </div>
      ) : null}

      {items.length ? (
        <div className="product-grid">
          {items.map((item) => (
            <ProductCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <div className="catalog-message empty-state">
          <h2>No products matched</h2>
          <p>Try a broader search, remove a filter, or browse all categories.</p>
          <div>
            <Link className="button-link" href={pathname}>
              Clear filters
            </Link>
            <Link className="button-secondary" href="/categories">
              Browse categories
            </Link>
          </div>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="Product pages">
          {result.page > 1 ? (
            <Link href={catalogHref(pathname, parsed, { page: result.page - 1 })}>Previous</Link>
          ) : (
            <span aria-disabled="true">Previous</span>
          )}
          <span>
            Page {result.page} of {totalPages}
          </span>
          {result.page < totalPages ? (
            <Link href={catalogHref(pathname, parsed, { page: result.page + 1 })}>Next</Link>
          ) : (
            <span aria-disabled="true">Next</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}

export function CatalogBrowser(props: CatalogBrowserProps) {
  return <CatalogResults {...props} mode="BROWSE" />;
}

export function FeaturedCatalog() {
  return <CatalogResults mode="FEATURED" />;
}
