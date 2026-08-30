'use client';

import { ArrowLeft, ArrowRight, Check, PackagePlus, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type {
  CatalogProductCreateDto,
  CatalogProductSummaryDto,
  CatalogProductTypeDefinitionDto,
} from '@maevelle/contracts';

import { ProductTypeManager } from '@/components/catalog-product-types/product-type-manager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData } from '@/lib/catalog/api';

const setupSteps = [
  ['Identity', 'Name, type, and Storefront address'],
  ['Organization', 'Categories and structured attributes'],
  ['Variants', 'Options, SKUs, colors, and sizes'],
  ['Merchandising', 'Images, prices, and inventory'],
  ['Review', 'Resolve blockers and publish'],
] as const;

function handleFromTitle(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function ProductCreate() {
  const router = useRouter();
  const [types, setTypes] = useState<readonly CatalogProductTypeDefinitionDto[]>([]);
  const [title, setTitle] = useState('');
  const [handle, setHandle] = useState('');
  const [handleEdited, setHandleEdited] = useState(false);
  const [productTypeId, setProductTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [intent, setIntent] = useState<'continue' | 'exit'>('continue');

  const loadTypes = useCallback(async () => {
    try {
      const items = await catalogData<readonly CatalogProductTypeDefinitionDto[]>(
        '/admin/catalog/product-type-definitions',
      );
      const active = items.filter((type) => type.status === 'ACTIVE');
      setTypes(active);
      setProductTypeId((current) =>
        active.some((type) => type.id === current) ? current : (active[0]?.id ?? ''),
      );
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product Types could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  const selectedType = useMemo(
    () => types.find((type) => type.id === productTypeId),
    [types, productTypeId],
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const normalizedTitle = title.trim();
    const normalizedHandle = handle.trim();
    if (!normalizedTitle) return setMessage('Enter the customer-facing Product name.');
    if (!productTypeId) return setMessage('Choose a Product Type before continuing.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedHandle))
      return setMessage('Storefront handle must use lowercase words separated by hyphens.');
    setBusy(true);
    setMessage('');
    const payload: CatalogProductCreateDto = {
      productTypeId,
      title: normalizedTitle,
      handle: normalizedHandle,
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    try {
      const product = await catalogData<CatalogProductSummaryDto>('/admin/catalog/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDirty(false);
      router.push(
        intent === 'continue'
          ? `/products/${product.id}/edit?setup=1&section=organization`
          : `/products/${product.id}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product draft could not be created.');
      setBusy(false);
    }
  }

  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <nav
        className="mb-5 flex items-center gap-2 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link className="hover:text-foreground" href="/products">
          Products
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">Create Product</span>
      </nav>
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Guided Product Setup
            </p>
            <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
              Create a Publish-Ready Product
            </h1>
            <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
              Start with the shared Product identity. The next steps build every sellable Variant,
              gallery, price, and availability state.
            </p>
          </div>
          <Button variant="outline" render={<Link href="/products" />}>
            <ArrowLeft aria-hidden="true" /> Back to Products
          </Button>
        </header>

        <ol className="mb-6 grid gap-2 sm:grid-cols-5" aria-label="Product setup progress">
          {setupSteps.map(([name, detail], index) => (
            <li
              className={`rounded-lg border px-3 py-2.5 ${index === 0 ? 'border-primary bg-primary/5' : 'bg-card text-muted-foreground'}`}
              aria-current={index === 0 ? 'step' : undefined}
              key={name}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  {index + 1}
                </span>
                <strong className="text-sm text-foreground">{name}</strong>
              </div>
              <p className="mt-1 text-xs leading-relaxed">{detail}</p>
            </li>
          ))}
        </ol>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <form
            className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            onSubmit={(event) => void create(event)}
            onChange={() => setDirty(true)}
            noValidate
          >
            <div className="border-b px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PackagePlus aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-semibold">Product Identity</h2>
                  <p className="text-sm text-muted-foreground">
                    These fields identify the Product across Admin and Storefront.
                  </p>
                </div>
              </div>
            </div>
            <fieldset
              className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6"
              disabled={loading || busy}
            >
              <legend className="sr-only">Product identity fields</legend>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="product-type">Product Type</Label>
                <select
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  id="product-type"
                  name="productTypeId"
                  required
                  value={productTypeId}
                  onChange={(event) => setProductTypeId(event.target.value)}
                >
                  <option value="">Choose a Product Type</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                {selectedType ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedType.attributes.length} structured field
                    {selectedType.attributes.length === 1 ? '' : 's'} ·{' '}
                    {selectedType.attributes.filter((attribute) => attribute.required).length}{' '}
                    required
                  </p>
                ) : null}
                {!loading && types.length === 0 ? (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    role="alert"
                  >
                    <span>Create an active Product Type before creating Products.</span>
                    <ProductTypeManager compact onChanged={loadTypes} />
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-title">Product Name</Label>
                <Input
                  autoComplete="off"
                  id="product-title"
                  maxLength={180}
                  name="title"
                  placeholder="Example: Linen Wrap Dress…"
                  required
                  value={title}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTitle(value);
                    if (!handleEdited) setHandle(handleFromTitle(value));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Use the name customers should recognize—not an internal SKU.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-handle">Storefront Handle</Label>
                <Input
                  autoCapitalize="none"
                  autoComplete="off"
                  id="product-handle"
                  maxLength={160}
                  name="handle"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="linen-wrap-dress…"
                  required
                  spellCheck={false}
                  value={handle}
                  onChange={(event) => {
                    setHandleEdited(true);
                    setHandle(handleFromTitle(event.target.value));
                  }}
                />
                <p className="break-words text-xs text-muted-foreground">
                  Storefront URL: /products/{handle || 'your-product'}
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="product-description">Customer Description</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {description.length}/5000
                  </span>
                </div>
                <textarea
                  className="min-h-32 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  id="product-description"
                  maxLength={5000}
                  name="description"
                  placeholder="Describe the material, silhouette, finish, use, and customer value…"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Optional for a Draft; recommended before publishing.
                </p>
              </div>
            </fieldset>
            {message ? (
              <p
                className="mx-5 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:mx-6"
                role="alert"
              >
                {message}
              </p>
            ) : null}
            <footer className="flex flex-col-reverse gap-2 border-t bg-muted/35 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <Button
                type="submit"
                variant="outline"
                disabled={!productTypeId || busy}
                onClick={() => setIntent('exit')}
              >
                <Save aria-hidden="true" />{' '}
                {busy && intent === 'exit' ? 'Saving…' : 'Save Draft & Exit'}
              </Button>
              <Button
                type="submit"
                disabled={!productTypeId || busy}
                onClick={() => setIntent('continue')}
              >
                {busy && intent === 'continue' ? 'Creating Draft…' : 'Create Draft & Continue'}{' '}
                <ArrowRight aria-hidden="true" />
              </Button>
            </footer>
          </form>

          <aside className="space-y-3 self-start lg:sticky lg:top-5">
            <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h2 className="text-sm font-semibold">What Happens Next</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  'Assign categories and required attributes',
                  'Build options and review generated Variants',
                  'Add SKU details, colors, sizes, and physical data',
                  'Upload Product or color-specific galleries',
                  'Set current prices and opening inventory',
                  'Review the authoritative publishing checklist',
                ].map((item) => (
                  <li className="flex gap-2" key={item}>
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              A Draft may be incomplete and never appears publicly. Publishing is only offered after
              the server validates the Product.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
