'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

interface Category {
  id: string;
  name: string;
  path: string;
  depth: number;
}
interface Item {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  minimumPrice: string | null;
  currency: string | null;
  available: boolean;
}
interface Result {
  items: readonly Item[];
  total: number;
  filters: {
    minimumPrice: string | null;
    maximumPrice: string | null;
    availability: readonly string[];
  };
}

export function CatalogBrowser({ categoryPath }: { readonly categoryPath?: string }) {
  const [organizationId, setOrganizationId] = useState('');
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [result, setResult] = useState<Result>();
  const [message, setMessage] = useState('Enter your store organization to browse.');

  async function browse(values: URLSearchParams) {
    const organization = values.get('organizationId')?.trim() ?? '';
    if (!organization) return;
    setMessage('Loading public catalog…');
    const categoryResponse = await fetch(
      `/api/storefront/v1/categories?organizationId=${encodeURIComponent(organization)}`,
    );
    if (!categoryResponse.ok) throw new Error('Categories are temporarily unavailable.');
    const categoryData = ((await categoryResponse.json()) as ApiEnvelope<readonly Category[]>).data;
    setCategories(categoryData);
    const category = categoryPath
      ? categoryData.find((entry) => entry.path === categoryPath)
      : undefined;
    if (categoryPath && !category) throw new Error('This category is unavailable.');
    const query = new URLSearchParams({ organizationId: organization });
    for (const key of ['q', 'minimumPrice', 'maximumPrice', 'availability', 'sort']) {
      const value = values.get(key);
      if (value) query.set(key, value);
    }
    if (category) query.set('categoryId', category.id);
    const response = await fetch(`/api/storefront/v1/search?${query}`);
    if (!response.ok) throw new Error('Search is temporarily unavailable.');
    setResult(((await response.json()) as ApiEnvelope<Result>).data);
    setOrganizationId(organization);
    setMessage('');
  }

  useEffect(() => {
    const values = new URLSearchParams(window.location.search);
    if (values.has('organizationId'))
      void browse(values).catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Unable to browse.'),
      );
  }, [categoryPath]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget))
      if (String(value).trim()) values.set(key, String(value));
    void browse(values).catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : 'Unable to browse.'),
    );
  }

  return (
    <section className="catalog-browser" aria-label="Catalog browser">
      <form className="filter-grid" onSubmit={submit}>
        <label>
          Store organization
          <input
            name="organizationId"
            defaultValue={
              organizationId ||
              new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get(
                'organizationId',
              ) ||
              ''
            }
            required
          />
        </label>
        <label>
          Search
          <input name="q" placeholder="Title, SKU, or category" />
        </label>
        <label>
          Minimum price
          <input inputMode="decimal" name="minimumPrice" />
        </label>
        <label>
          Maximum price
          <input inputMode="decimal" name="maximumPrice" />
        </label>
        <label>
          Availability
          <select name="availability">
            <option value="">All</option>
            <option value="IN_STOCK">In stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
          </select>
        </label>
        <label>
          Sort
          <select name="sort">
            <option value="RELEVANCE">Relevance</option>
            <option value="NEWEST">Newest</option>
            <option value="PRICE_ASC">Price low to high</option>
            <option value="PRICE_DESC">Price high to low</option>
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      {categories.length > 0 ? (
        <nav className="category-nav" aria-label="Category hierarchy">
          {categories.map((category) => (
            <Link
              key={category.id}
              style={{ marginInlineStart: `${category.depth * 0.75}rem` }}
              href={`/categories/${category.path}?organizationId=${encodeURIComponent(organizationId)}`}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <p role="status">{message || `${result?.total ?? 0} products`}</p>
      <div className="product-grid">
        {result?.items.map((item) => (
          <article className="product-card" key={item.id}>
            <p className="eyebrow">{item.available ? 'In stock' : 'Currently unavailable'}</p>
            <h2>
              <Link
                href={`/products/${item.handle}?organizationId=${encodeURIComponent(organizationId)}`}
              >
                {item.title}
              </Link>
            </h2>
            <p>{item.description ?? 'Explore product details.'}</p>
            <strong>
              {item.minimumPrice
                ? `${item.currency === 'BDT' ? '৳' : `${item.currency} `}${item.minimumPrice}`
                : 'Price unavailable'}
            </strong>
          </article>
        ))}
      </div>
      {result?.total === 0 ? <p>No published products match these filters.</p> : null}
    </section>
  );
}
