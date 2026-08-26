'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';
import { ProductCard, type StorefrontCardItem } from './product-card';
import { useStorefrontContext } from './storefront-context';

interface Category {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  depth: number;
}
interface Result {
  items: readonly StorefrontCardItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    minimumPrice: string | null;
    maximumPrice: string | null;
    availability: readonly string[];
  };
}

const filterKeys = ['q', 'minimumPrice', 'maximumPrice', 'availability', 'sort'] as const;

export function CatalogBrowser({
  categoryPath,
  featured = false,
}: {
  readonly categoryPath?: string;
  readonly featured?: boolean;
}) {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <CatalogBrowserContent {...(categoryPath ? { categoryPath } : {})} featured={featured} />
    </Suspense>
  );
}

function CatalogBrowserContent({
  categoryPath,
  featured = false,
}: {
  readonly categoryPath?: string;
  readonly featured?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { context, loading: contextLoading, error: contextError } = useStorefrontContext();
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [result, setResult] = useState<Result>();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryString = search.toString();
  useEffect(() => {
    if (!context) return;
    const controller = new AbortController();
    setLoading(true);
    setMessage('');
    void (async () => {
      try {
        const categoryResponse = await fetch(
          `/api/storefront/v1/categories?organizationId=${context.organizationId}`,
          { signal: controller.signal },
        );
        if (!categoryResponse.ok) throw new Error('Categories are temporarily unavailable.');
        const categoryData = ((await categoryResponse.json()) as ApiEnvelope<readonly Category[]>)
          .data;
        setCategories(categoryData);
        const category = categoryPath
          ? categoryData.find((entry) => entry.path === categoryPath)
          : undefined;
        if (categoryPath && !category) throw new Error('This category is no longer available.');
        const query = new URLSearchParams({ organizationId: context.organizationId });
        for (const key of filterKeys) {
          const value = search.get(key);
          if (value) query.set(key, value);
        }
        const page = search.get('page');
        if (page) query.set('page', page);
        if (category) query.set('categoryId', category.id);
        const response = await fetch(`/api/storefront/v1/search?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Products are temporarily unavailable.');
        setResult(((await response.json()) as ApiEnvelope<Result>).data);
      } catch (error) {
        if (!controller.signal.aborted)
          setMessage(error instanceof Error ? error.message : 'Unable to browse the collection.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [categoryPath, context, queryString, search]);

  const currentCategory = categoryPath
    ? categories.find((category) => category.path === categoryPath)
    : undefined;
  const children = categories.filter((category) => category.parentId === currentCategory?.id);
  const activeFilters = useMemo(
    () =>
      filterKeys.flatMap((key) => {
        const value = search.get(key);
        if (!value || key === 'sort') return [];
        const label =
          key === 'q'
            ? `Search: ${value}`
            : key === 'minimumPrice'
              ? `From ৳${value}`
              : key === 'maximumPrice'
                ? `Up to ৳${value}`
                : value === 'IN_STOCK'
                  ? 'In stock'
                  : 'Out of stock';
        return [{ key, label }];
      }),
    [search, queryString],
  );

  function navigate(values: URLSearchParams) {
    const suffix = values.toString();
    router.push(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(search.toString());
    next.delete('page');
    for (const key of filterKeys) next.delete(key);
    for (const [key, value] of new FormData(event.currentTarget))
      if (String(value).trim()) next.set(key, String(value).trim());
    navigate(next);
    setFiltersOpen(false);
  }
  function removeFilter(key: string) {
    const next = new URLSearchParams(search.toString());
    next.delete(key);
    next.delete('page');
    navigate(next);
  }

  if (contextLoading) return <ProductGridSkeleton />;
  if (contextError || !context)
    return (
      <div className="catalog-message error-state">
        <h2>We cannot load the collection right now</h2>
        <p>{contextError ?? 'Store configuration is unavailable.'}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );

  if (featured)
    return loading ? (
      <ProductGridSkeleton />
    ) : message ? (
      <p role="alert">{message}</p>
    ) : (
      <div className="product-grid">
        {result?.items.slice(0, 8).map((item) => (
          <ProductCard item={item} key={item.id} />
        ))}
      </div>
    );

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
          {loading
            ? 'Loading products…'
            : `${result?.total ?? 0} product${result?.total === 1 ? '' : 's'}`}
        </p>
        <div>
          <button
            className="filter-trigger"
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(true)}
          >
            Filter
          </button>
          <label className="sort-control">
            <span>Sort</span>
            <select
              value={search.get('sort') ?? (search.get('q') ? 'RELEVANCE' : 'NEWEST')}
              onChange={(event) => {
                const next = new URLSearchParams(search.toString());
                next.set('sort', event.target.value);
                next.delete('page');
                navigate(next);
              }}
            >
              <option value="RELEVANCE">Relevance</option>
              <option value="NEWEST">Newest</option>
              <option value="PRICE_ASC">Price: low to high</option>
              <option value="PRICE_DESC">Price: high to low</option>
            </select>
          </label>
        </div>
      </div>
      {activeFilters.length ? (
        <div className="filter-chips" aria-label="Applied filters">
          {activeFilters.map((filter) => (
            <button key={filter.key} type="button" onClick={() => removeFilter(filter.key)}>
              {filter.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" onClick={() => navigate(new URLSearchParams())}>
            Clear all
          </button>
        </div>
      ) : null}
      <div
        className={`filter-backdrop ${filtersOpen ? 'open' : ''}`}
        role="presentation"
        onMouseDown={() => setFiltersOpen(false)}
      >
        <form
          className="filter-panel"
          onSubmit={submit}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header>
            <h2>Filter products</h2>
            <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
              ✕
            </button>
          </header>
          <label>
            Search{' '}
            <input
              name="q"
              type="search"
              defaultValue={search.get('q') ?? ''}
              placeholder="Product name or SKU"
            />
          </label>
          <div className="price-fields">
            <label>
              Minimum price{' '}
              <input
                inputMode="decimal"
                name="minimumPrice"
                defaultValue={search.get('minimumPrice') ?? ''}
              />
            </label>
            <label>
              Maximum price{' '}
              <input
                inputMode="decimal"
                name="maximumPrice"
                defaultValue={search.get('maximumPrice') ?? ''}
              />
            </label>
          </div>
          <fieldset>
            <legend>Availability</legend>
            <label>
              <input
                type="radio"
                name="availability"
                value=""
                defaultChecked={!search.get('availability')}
              />{' '}
              All products
            </label>
            <label>
              <input
                type="radio"
                name="availability"
                value="IN_STOCK"
                defaultChecked={search.get('availability') === 'IN_STOCK'}
              />{' '}
              In stock
            </label>
            <label>
              <input
                type="radio"
                name="availability"
                value="OUT_OF_STOCK"
                defaultChecked={search.get('availability') === 'OUT_OF_STOCK'}
              />{' '}
              Out of stock
            </label>
          </fieldset>
          <input
            type="hidden"
            name="sort"
            value={search.get('sort') ?? (search.get('q') ? 'RELEVANCE' : 'NEWEST')}
          />
          <footer>
            <button
              className="button-secondary"
              type="button"
              onClick={() => navigate(new URLSearchParams())}
            >
              Clear
            </button>
            <button type="submit">Show results</button>
          </footer>
        </form>
      </div>
      {message ? (
        <div className="catalog-message error-state" role="alert">
          <h2>Products could not be loaded</h2>
          <p>{message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      ) : null}
      {loading ? <ProductGridSkeleton /> : null}
      {!loading && !message && result?.items.length ? (
        <div className="product-grid">
          {result.items.map((item) => (
            <ProductCard item={item} key={item.id} />
          ))}
        </div>
      ) : null}
      {!loading && !message && result?.total === 0 ? (
        <div className="catalog-message empty-state">
          <h2>No products matched</h2>
          <p>Try a broader search, remove a filter, or browse all categories.</p>
          <div>
            <button type="button" onClick={() => navigate(new URLSearchParams())}>
              Clear filters
            </button>
            <Link className="button-secondary" href="/categories">
              Browse categories
            </Link>
          </div>
        </div>
      ) : null}
      {result && result.total > result.pageSize ? (
        <nav className="pagination" aria-label="Product pages">
          <button
            type="button"
            disabled={result.page <= 1}
            onClick={() => {
              const next = new URLSearchParams(search.toString());
              next.set('page', String(result.page - 1));
              navigate(next);
            }}
          >
            Previous
          </button>
          <span>
            Page {result.page} of {Math.ceil(result.total / result.pageSize)}
          </span>
          <button
            type="button"
            disabled={result.page >= Math.ceil(result.total / result.pageSize)}
            onClick={() => {
              const next = new URLSearchParams(search.toString());
              next.set('page', String(result.page + 1));
              navigate(next);
            }}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="product-grid skeleton-grid" aria-label="Loading products" aria-busy="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="product-card-skeleton" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
