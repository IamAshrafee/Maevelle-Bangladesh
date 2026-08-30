'use client';

import {
  Archive,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ImageIcon,
  PackagePlus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import type {
  CatalogProductWorkItemDto,
  CatalogProductWorklistDto,
  CatalogProductTypeDefinitionDto,
} from '@maevelle/contracts';

import { ProductTypeManager } from '@/components/catalog-product-types/product-type-manager';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { catalogData, formatCatalogMoney } from '@/lib/catalog/api';

const statuses = ['ALL', 'DRAFT', 'ACTIVE', 'PUBLISHED', 'ARCHIVED'] as const;
const readinessStates = ['ALL', 'READY', 'BLOCKED', 'ATTENTION'] as const;

function productDate(value?: string): string {
  return value
    ? new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(new Date(value))
    : '—';
}

function productPrice(product: CatalogProductWorkItemDto): string {
  if (!product.priceRange) return 'Not priced';
  const { minimum, maximum, currency } = product.priceRange;
  return minimum === maximum
    ? formatCatalogMoney(minimum, currency)
    : `${formatCatalogMoney(minimum, currency)}–${formatCatalogMoney(maximum, currency)}`;
}

export function ProductList() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const [query, setQuery] = useState(searchParameters.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const [worklist, setWorklist] = useState<CatalogProductWorklistDto>();
  const [types, setTypes] = useState<readonly CatalogProductTypeDefinitionDto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const status = statuses.includes(searchParameters.get('status') as (typeof statuses)[number])
    ? (searchParameters.get('status') as (typeof statuses)[number])
    : 'ALL';
  const readiness = readinessStates.includes(
    searchParameters.get('readiness') as (typeof readinessStates)[number],
  )
    ? (searchParameters.get('readiness') as (typeof readinessStates)[number])
    : 'ALL';
  const productTypeId = searchParameters.get('type') ?? 'ALL';
  const page = Math.max(1, Number(searchParameters.get('page') ?? 1) || 1);

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'ALL' || (key === 'page' && value === '1')) next.delete(key);
      else next.set(key, value);
    }
    router.replace(next.size ? `/products?${next.toString()}` : '/products', { scroll: false });
  }

  useEffect(() => {
    const current = searchParameters.get('q') ?? '';
    if (current !== deferredQuery) replaceQuery({ q: deferredQuery || undefined, page: '1' });
  }, [deferredQuery]);

  async function load(signal?: AbortSignal, reloadTypes = false) {
    setState('loading');
    const parameters = new URLSearchParams({
      status,
      readiness,
      page: String(page),
      pageSize: '25',
    });
    if (deferredQuery) parameters.set('q', deferredQuery);
    if (productTypeId !== 'ALL') parameters.set('productTypeId', productTypeId);
    try {
      const [products, productTypes] = await Promise.all([
        catalogData<CatalogProductWorklistDto>(
          `/admin/catalog/product-work-items?${parameters.toString()}`,
          signal ? { signal } : undefined,
        ),
        reloadTypes || types.length === 0
          ? catalogData<readonly CatalogProductTypeDefinitionDto[]>(
              '/admin/catalog/product-type-definitions',
              signal ? { signal } : undefined,
            )
          : Promise.resolve(types),
      ]);
      setWorklist(products);
      setTypes(productTypes);
      setSelected(new Set());
      setMessage('');
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Products could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [deferredQuery, status, readiness, productTypeId, page]);

  const visibleIds = useMemo(() => worklist?.items.map((product) => product.id) ?? [], [worklist]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((productId) => selected.has(productId));

  function toggleProduct(productId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function bulkAction(action: 'publish' | 'archive') {
    const products = worklist?.items.filter((product) => selected.has(product.id)) ?? [];
    if (products.length === 0 || busy) return;
    if (
      action === 'archive' &&
      !window.confirm(
        `Archive ${products.length} selected Product${products.length === 1 ? '' : 's'}? Published Products will leave the Storefront. Historical records remain available.`,
      )
    )
      return;
    setBusy(true);
    setMessage('');
    const results = await Promise.allSettled(
      products.map((product) =>
        catalogData(`/admin/catalog/products/${product.id}/${action}`, {
          method: 'POST',
          body: JSON.stringify({ version: product.version }),
        }),
      ),
    );
    const failures = results.filter((result) => result.status === 'rejected').length;
    setMessage(
      failures === 0
        ? `${products.length} Product${products.length === 1 ? '' : 's'} ${action === 'publish' ? 'published' : 'archived'}.`
        : `${products.length - failures} updated; ${failures} need individual review.`,
    );
    setBusy(false);
    await load();
  }

  const hasFilters =
    Boolean(deferredQuery) || status !== 'ALL' || readiness !== 'ALL' || productTypeId !== 'ALL';
  const summary = worklist?.summary;

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <nav className="mb-2 text-xs font-medium text-muted-foreground" aria-label="Breadcrumb">
            Catalog <span aria-hidden="true">/</span> Products
          </nav>
          <h1 className="text-balance text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
            Create, prepare, publish, and maintain every sellable item from one catalog.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductTypeManager compact onChanged={() => load(undefined, true)} />
          <Button variant="outline" disabled={state === 'loading'} onClick={() => void load()}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
          <Button render={<Link href="/products/new" />}>
            <PackagePlus aria-hidden="true" /> Create Product
          </Button>
        </div>
      </header>

      {message ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Catalog summary">
        {[
          ['All Products', summary?.total ?? '—'],
          ['Published', summary?.published ?? '—'],
          ['Drafts', summary?.drafts ?? '—'],
          ['Archived', summary?.archived ?? '—'],
        ].map(([label, value]) => (
          <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10" key={label}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3" aria-label="Product filters">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search Products</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              name="productSearch"
              autoComplete="off"
              placeholder="Search name, handle, SKU, or Product Type…"
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm">
              <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Product Type</span>
              <select
                className="bg-transparent outline-none"
                name="productType"
                value={productTypeId}
                onChange={(event) => replaceQuery({ type: event.target.value, page: '1' })}
              >
                <option value="ALL">All Product Types</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center rounded-lg border bg-card px-3 text-sm">
              <span className="sr-only">Publishing Status</span>
              <select
                className="bg-transparent outline-none"
                name="status"
                value={status}
                onChange={(event) => replaceQuery({ status: event.target.value, page: '1' })}
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {value === 'ALL' ? 'Any Catalog State' : value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center rounded-lg border bg-card px-3 text-sm">
              <span className="sr-only">Publishing Readiness</span>
              <select
                className="bg-transparent outline-none"
                name="readiness"
                value={readiness}
                onChange={(event) => replaceQuery({ readiness: event.target.value, page: '1' })}
              >
                {readinessStates.map((value) => (
                  <option key={value} value={value}>
                    {value === 'ALL' ? 'Any Readiness' : value}
                  </option>
                ))}
              </select>
            </label>
            {hasFilters ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery('');
                  router.replace('/products');
                }}
              >
                Clear Filters
              </Button>
            ) : null}
          </div>
        </div>
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
            <strong className="mr-auto tabular-nums">{selected.size} selected on this page</strong>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void bulkAction('publish')}
            >
              <CheckCircle2 aria-hidden="true" /> Publish Selected
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void bulkAction('archive')}
            >
              <Archive aria-hidden="true" /> Archive Selected
            </Button>
          </div>
        ) : null}
      </section>

      <section
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
        aria-busy={state === 'loading'}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="border-b bg-muted/55 text-xs text-muted-foreground">
              <tr>
                <th className="w-11 px-3 py-2.5">
                  <input
                    aria-label="Select all Products on this page"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) =>
                      setSelected(event.target.checked ? new Set(visibleIds) : new Set())
                    }
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium">Variants</th>
                <th className="px-3 py-2.5 font-medium">Price</th>
                <th className="px-3 py-2.5 font-medium">Available</th>
                <th className="px-3 py-2.5 font-medium">Readiness</th>
                <th className="px-3 py-2.5 font-medium">Catalog State</th>
                <th className="px-3 py-2.5 font-medium">Updated</th>
                <th className="w-12 px-3 py-2.5">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {worklist?.items.map((product) => (
                <tr className="group hover:bg-muted/35" key={product.id}>
                  <td className="px-3 py-2.5">
                    <input
                      aria-label={`Select ${product.title}`}
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleProduct(product.id)}
                    />
                  </td>
                  <td className="max-w-sm px-3 py-2.5">
                    <Link
                      className="flex min-w-0 items-center gap-3 rounded focus-visible:ring-3 focus-visible:ring-ring/40"
                      href={`/products/${product.id}`}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
                        {product.primaryMediaId ? (
                          <img
                            alt=""
                            className="size-full object-cover"
                            height={44}
                            loading="lazy"
                            src={`/api/admin/media/${product.primaryMediaId}`}
                            width={44}
                          />
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate font-medium text-foreground">
                          {product.title}
                        </strong>
                        <small className="block truncate text-xs text-muted-foreground">
                          {product.productTypeName ?? 'No Product Type'} · /{product.handle}
                        </small>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{product.variantCount ?? 0}</td>
                  <td className="px-3 py-2.5 font-medium tabular-nums">{productPrice(product)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{product.availableQuantity}</td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-1">
                      <StatusBadge status={product.readinessState} />
                      <p className="text-xs text-muted-foreground">
                        {product.blockerCount > 0
                          ? `${product.blockerCount} blocker${product.blockerCount === 1 ? '' : 's'}`
                          : product.warningCount > 0
                            ? `${product.warningCount} warning${product.warningCount === 1 ? '' : 's'}`
                            : 'Ready'}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={product.status} />
                      <StatusBadge status={product.publicationStatus} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    {productDate(product.updatedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Button
                      aria-label={`Open ${product.title}`}
                      size="icon-sm"
                      variant="ghost"
                      render={<Link href={`/products/${product.id}`} />}
                    >
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state === 'loading' ? (
          <div className="px-4 py-14 text-center text-sm text-muted-foreground" role="status">
            Loading Products…
          </div>
        ) : null}
        {state === 'ready' && worklist?.items.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center px-5 py-14 text-center">
            <PackagePlus className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-semibold">
              {hasFilters ? 'No Products Match' : 'Create Your First Product'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters
                ? 'Clear or change the filters to see more of the catalog.'
                : 'The guided builder covers identity, variants, images, prices, inventory, and publishing.'}
            </p>
            <Button
              className="mt-4"
              render={hasFilters ? undefined : <Link href="/products/new" />}
              onClick={hasFilters ? () => router.replace('/products') : undefined}
            >
              {hasFilters ? 'Clear Filters' : 'Create Product'}
            </Button>
          </div>
        ) : null}
        {state === 'error' ? (
          <div className="px-5 py-14 text-center">
            <p className="font-medium">Products could not be loaded.</p>
            <Button className="mt-3" variant="outline" onClick={() => void load()}>
              Try Again
            </Button>
          </div>
        ) : null}
        {worklist && worklist.pagination.totalPages > 1 ? (
          <footer className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {worklist.pagination.totalItems} Products · Page {worklist.pagination.page} of{' '}
              {worklist.pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => replaceQuery({ page: String(page - 1) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= worklist.pagination.totalPages}
                onClick={() => replaceQuery({ page: String(page + 1) })}
              >
                Next
              </Button>
            </div>
          </footer>
        ) : null}
      </section>
    </main>
  );
}
