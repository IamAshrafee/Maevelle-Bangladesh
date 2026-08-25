'use client';

import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Grid2X2,
  Image,
  PackageSearch,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Tags,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type {
  ApiEnvelope,
  CatalogProductSummaryDto,
  CatalogProductWorkspaceDto,
} from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductMediaWorkspace } from '@/components/catalog/product-media-workspace';
import { ProductSizingWorkspace } from '@/components/catalog/product-sizing-workspace';

interface ProductType {
  id: string;
  code: string;
  name: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string } | string;
    };
    const detail =
      typeof body.error === 'object' ? (body.error.message ?? body.error.code) : body.error;
    throw new Error(detail ?? 'The requested catalog operation could not be completed.');
  }
  return response.json() as Promise<T>;
}

export function CatalogConsole() {
  const [products, setProducts] = useState<readonly CatalogProductSummaryDto[]>([]);
  const [types, setTypes] = useState<readonly ProductType[]>([]);
  const [message, setMessage] = useState('Loading Products…');
  const [typeId, setTypeId] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogProductSummaryDto>();
  const [workspace, setWorkspace] = useState<CatalogProductWorkspaceDto>();
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const [productResult, typeResult] = await Promise.all([
        request<ApiEnvelope<readonly CatalogProductSummaryDto[]>>('/admin/catalog/products'),
        request<ApiEnvelope<readonly ProductType[]>>('/admin/catalog/product-types'),
      ]);
      setProducts(productResult.data);
      setTypes(typeResult.data);
      setTypeId((current) => current || typeResult.data[0]?.id || '');
      setMessage('');
      return productResult.data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load the Product catalog.');
      return [];
    }
  };

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    setCreateOpen(parameters.get('create') === 'product');
    void reload().then((loadedProducts) => {
      const productId = parameters.get('product');
      const product = loadedProducts.find((candidate) => candidate.id === productId);
      if (product) void openProduct(product);
    });
  }, []);

  async function openProduct(product: CatalogProductSummaryDto) {
    setSelected(product);
    setWorkspace(undefined);
    setWorkspaceLoading(true);
    try {
      const result = await request<ApiEnvelope<CatalogProductWorkspaceDto>>(
        `/admin/catalog/products/${product.id}`,
      );
      setWorkspace(result.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Product setup.');
    } finally {
      setWorkspaceLoading(false);
    }
  }

  const visible = useMemo(
    () =>
      products.filter(
        (product) =>
          (status === 'ALL' ||
            (status === 'PUBLISHED'
              ? product.publicationStatus === 'PUBLISHED'
              : product.status === status)) &&
          `${product.title} ${product.handle} ${product.skuPreview ?? ''} ${product.productTypeName ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [products, query, status],
  );

  async function createType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request('/admin/catalog/product-types', {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), name: data.get('name') }),
      });
      event.currentTarget.reset();
      setMessage('Product type created.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Product type.');
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request('/admin/catalog/products', {
        method: 'POST',
        body: JSON.stringify({
          productTypeId: typeId,
          title: data.get('title'),
          handle: data.get('handle'),
          description: data.get('description') || undefined,
        }),
      });
      event.currentTarget.reset();
      setCreateOpen(false);
      setMessage('Draft created. Continue through media, sizing, pricing, variants, and stock.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Product.');
    }
  }

  async function publication(product: CatalogProductSummaryDto) {
    setBusy(true);
    const action = product.publicationStatus === 'PUBLISHED' ? 'unpublish' : 'publish';
    try {
      await request(`/admin/catalog/products/${product.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: product.version }),
      });
      setMessage(
        action === 'publish'
          ? `${product.title} is published.`
          : `${product.title} is no longer publicly discoverable.`,
      );
      setSelected(undefined);
      await reload();
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : 'Publication was rejected.'} Resolve the publishing checklist and retry.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function createAxis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/admin/catalog/products/${selected.id}/option-axes`, {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), name: data.get('name') }),
      });
      form.reset();
      setMessage('Option added. Add its customer-facing values next.');
      await openProduct(selected);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create option.');
    }
  }

  async function createOptionValue(event: FormEvent<HTMLFormElement>, axisId: string) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/admin/catalog/option-axes/${axisId}/values`, {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), displayValue: data.get('displayValue') }),
      });
      form.reset();
      setMessage('Option value added.');
      await openProduct(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add option value.');
    }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !workspace) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const optionValueIds = data.getAll('optionValueId').map(String);
    if (optionValueIds.length !== workspace.options.length) {
      setMessage('Choose exactly one value from every option before creating a Variant.');
      return;
    }
    try {
      await request(`/admin/catalog/products/${selected.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({ sku: data.get('sku'), optionValueIds }),
      });
      form.reset();
      setMessage('Sellable Variant created. Continue with price, media, and inventory.');
      await openProduct(selected);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Variant.');
    }
  }

  return (
    <main className="admin-page products-v2">
      <header className="page-header">
        <div>
          <p className="eyebrow">Catalog / Products</p>
          <h1>Products</h1>
          <p>Build, validate, publish, and maintain the sellable catalog.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" type="button" onClick={() => void reload()}>
            <RefreshCw /> Refresh
          </button>
          <button className="button primary" type="button" onClick={() => setCreateOpen(true)}>
            <Plus /> Create Product
          </button>
        </div>
      </header>
      {message ? (
        <div className="notice notice-warning" role="status">
          <AlertTriangle /> {message}
        </div>
      ) : null}
      <section className="catalog-summary" aria-label="Catalog summary">
        <article>
          <span>All Products</span>
          <strong>{products.length}</strong>
        </article>
        <article>
          <span>Published</span>
          <strong>
            {products.filter((product) => product.publicationStatus === 'PUBLISHED').length}
          </strong>
        </article>
        <article>
          <span>Drafts</span>
          <strong>{products.filter((product) => product.status === 'DRAFT').length}</strong>
        </article>
        <article>
          <span>Product types</span>
          <strong>{types.length}</strong>
        </article>
      </section>
      <section className="orders-filterbar" aria-label="Product filters">
        <label className="table-search">
          <Search />
          <span className="sr-only">Search Products</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, handle, SKU, or type…"
          />
        </label>
        <div className="filter-chips" role="group" aria-label="Product status">
          {['ALL', 'DRAFT', 'ACTIVE', 'PUBLISHED', 'ARCHIVED'].map((item) => (
            <button
              aria-pressed={status === item}
              key={item}
              type="button"
              onClick={() => setStatus(item)}
            >
              {item === 'ALL' ? 'All Products' : item}
            </button>
          ))}
        </div>
        <span className="result-count">{visible.length} results</span>
      </section>
      <div className={`product-workspace ${selected ? 'detail-open' : ''}`}>
        <section className="panel product-list-panel">
          <div className="data-table-shell">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Variants</th>
                  <th>Catalog state</th>
                  <th>Updated</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => (
                  <tr
                    className={selected?.id === product.id ? 'selected-row' : ''}
                    key={product.id}
                  >
                    <td>
                      <div className="product-identity">
                        <span>
                          <PackageSearch />
                        </span>
                        <div>
                          <strong>{product.title}</strong>
                          <small>
                            /{product.handle}
                            {product.skuPreview ? ` · ${product.skuPreview}` : ''}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{product.productTypeName ?? '—'}</td>
                    <td>{product.variantCount ?? 0}</td>
                    <td>
                      <div className="inline-status">
                        <StatusBadge status={product.status} />
                        <StatusBadge status={product.publicationStatus} />
                      </div>
                    </td>
                    <td>
                      {product.updatedAt
                        ? new Date(product.updatedAt).toLocaleDateString('en-BD', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td>
                      <button
                        className="row-link"
                        type="button"
                        onClick={() => void openProduct(product)}
                      >
                        Open workspace <ArrowRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 ? (
              <div className="empty-state">
                <PackageSearch />
                <strong>No matching Products</strong>
                <p>Create a draft or clear the current filters.</p>
                <button type="button" onClick={() => setCreateOpen(true)}>
                  Create Product
                </button>
              </div>
            ) : null}
          </div>
        </section>
        {selected ? (
          <aside className="product-detail-panel">
            <header className="detail-header">
              <div>
                <p className="eyebrow">Product workspace</p>
                <h2>{selected.title}</h2>
                <div className="inline-status">
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.publicationStatus} />
                </div>
              </div>
              <button
                aria-label="Close Product workspace"
                type="button"
                onClick={() => setSelected(undefined)}
              >
                <X />
              </button>
            </header>
            <section className="publish-readiness">
              <div>
                <strong>Publishing readiness</strong>
                <p>The server validates every authoritative requirement when you publish.</p>
              </div>
              <ul>
                <li>
                  <CheckCircle2 /> Product identity
                </li>
                <li className={Number(selected.variantCount) ? '' : 'incomplete'}>
                  <CheckCircle2 /> Sellable Variant
                </li>
                <li>
                  <Tags /> Active price
                </li>
                <li>
                  <Image /> Product media
                </li>
                <li>
                  <Boxes /> Available inventory
                </li>
              </ul>
              <button disabled={busy} type="button" onClick={() => void publication(selected)}>
                {selected.publicationStatus === 'PUBLISHED' ? <Archive /> : <CheckCircle2 />}
                {selected.publicationStatus === 'PUBLISHED'
                  ? 'Unpublish Product'
                  : 'Validate & publish'}
              </button>
            </section>
            <section className="variant-workspace">
              <div className="section-heading">
                <div>
                  <h3>Options & Variants</h3>
                  <p>
                    Define customer choices, then create each sellable SKU from one value per
                    option.
                  </p>
                </div>
                <StatusBadge status={`${workspace?.variants.length ?? 0} variants`} />
              </div>
              {workspaceLoading ? (
                <p className="loading-line">Loading Product configuration…</p>
              ) : null}
              {!workspaceLoading && workspace ? (
                <>
                  <div className="option-axis-grid">
                    {workspace.options.map((axis) => (
                      <article key={axis.id}>
                        <header>
                          <strong>{axis.name}</strong>
                          <small>{axis.code}</small>
                        </header>
                        <div className="option-pills">
                          {axis.values.map((value) => (
                            <span key={value.id}>{value.label}</span>
                          ))}
                          {axis.values.length === 0 ? <em>No values yet</em> : null}
                        </div>
                        <form
                          className="inline-create-form"
                          onSubmit={(event) => void createOptionValue(event, axis.id)}
                        >
                          <input name="displayValue" placeholder="Display value" required />
                          <input
                            name="code"
                            placeholder="code"
                            pattern="[a-z0-9]+(-[a-z0-9]+)*"
                            required
                          />
                          <button type="submit">Add value</button>
                        </form>
                      </article>
                    ))}
                  </div>
                  <details className="compact-disclosure" open={workspace.options.length === 0}>
                    <summary>Add Product option</summary>
                    <form className="inline-create-form" onSubmit={createAxis}>
                      <input name="name" placeholder="Option name (e.g. Color)" required />
                      <input
                        name="code"
                        placeholder="color"
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        required
                      />
                      <button type="submit">Add option</button>
                    </form>
                  </details>
                  {workspace.options.length > 0 &&
                  workspace.options.every((axis) => axis.values.length > 0) ? (
                    <form className="variant-create-form" onSubmit={createVariant}>
                      <div>
                        <strong>Create a sellable Variant</strong>
                        <small>
                          Choose one value from every option. SKU is normalized by the server.
                        </small>
                      </div>
                      <input name="sku" placeholder="SKU" required />
                      {workspace.options.map((axis) => (
                        <label key={axis.id}>
                          <span>{axis.name}</span>
                          <select name="optionValueId" required defaultValue="">
                            <option value="" disabled>
                              Choose {axis.name}
                            </option>
                            {axis.values.map((value) => (
                              <option key={value.id} value={value.id}>
                                {value.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <button type="submit">
                        <Grid2X2 /> Create Variant
                      </button>
                    </form>
                  ) : null}
                  <div className="variant-matrix">
                    <div className="variant-matrix-row header">
                      <span>SKU</span>
                      <span>Configuration</span>
                      <span>Status</span>
                    </div>
                    {workspace.variants.map((variant) => (
                      <div className="variant-matrix-row" key={variant.id}>
                        <strong>{variant.sku}</strong>
                        <span>
                          {variant.optionValueIds
                            .map(
                              (valueId) =>
                                workspace.options
                                  .flatMap((axis) => axis.values)
                                  .find((value) => value.id === valueId)?.label ?? 'Unknown',
                            )
                            .join(' / ')}
                        </span>
                        <StatusBadge status={variant.status} />
                      </div>
                    ))}
                    {workspace.variants.length === 0 ? (
                      <div className="empty-inline">
                        No Variants yet. Create options and the first SKU.
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </section>
            {workspace ? (
               <div className="mt-8 border-t pt-8 space-y-8">
                 <ProductMediaWorkspace product={workspace} onRefresh={() => void openProduct(selected)} />
                 <ProductSizingWorkspace product={workspace} onRefresh={() => void openProduct(selected)} />
               </div>
            ) : null}
            <section className="product-setup-nav mt-8">
              <h3>Product setup</h3>

              <Link href="/pricing">
                <Tags />
                <span>
                  <strong>Pricing</strong>
                  <small>Authoritative Variant price lists</small>
                </span>
                <ArrowRight />
              </Link>
              <Link href="/inventory/stock">
                <Boxes />
                <span>
                  <strong>Inventory</strong>
                  <small>Warehouse stock and availability</small>
                </span>
                <ArrowRight />
              </Link>
            </section>
            <footer className="detail-actions">
              <small>
                Version {selected.version} · /{selected.handle}
              </small>
            </footer>
          </aside>
        ) : null}
      </div>
      {createOpen ? (
        <div
          className="drawer-backdrop"
          role="presentation"
          onMouseDown={() => setCreateOpen(false)}
        >
          <aside
            aria-label="Create Product"
            aria-modal="true"
            className="form-drawer"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">New catalog item</p>
                <h2>Create a draft Product</h2>
                <p>
                  Start with identity. Variants, media, pricing, sizing, and stock remain controlled
                  steps.
                </p>
              </div>
              <button
                aria-label="Close create Product"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                <X />
              </button>
            </header>
            <form onSubmit={createProduct}>
              <div className="form-section">
                <h3>Product identity</h3>
                <Label>Product type</Label>
                <Select value={typeId} onValueChange={(value) => setTypeId(value ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="title">Product name</Label>
                <Input id="title" name="title" required placeholder="Linen wrap dress" />
                <Label htmlFor="handle">Storefront handle</Label>
                <Input
                  id="handle"
                  name="handle"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="linen-wrap-dress"
                />
                <small>
                  Lowercase letters, numbers, and hyphens. Later changes preserve redirect history.
                </small>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  rows={5}
                  placeholder="Describe material, cut, use, and customer value."
                />
              </div>
              <footer>
                <button type="button" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <Button type="submit" disabled={!typeId}>
                  Create draft <ArrowRight />
                </Button>
              </footer>
            </form>
            <details className="type-creator">
              <summary>Need another Product type?</summary>
              <form onSubmit={createType}>
                <Label htmlFor="type-code">Type code</Label>
                <Input
                  id="type-code"
                  name="code"
                  placeholder="dress"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                />
                <Label htmlFor="type-name">Type name</Label>
                <Input id="type-name" name="name" placeholder="Dress" required />
                <Button type="submit">Create type</Button>
              </form>
            </details>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
