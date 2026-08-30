'use client';

import {
  Archive,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Edit3,
  EyeOff,
  ImageIcon,
  PackageOpen,
  RotateCcw,
  Tags,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import type {
  CatalogCategoryChoiceDto,
  CatalogProductWorkspaceDto,
  CatalogVocabularyItemDto,
  CatalogVocabularyListDto,
} from '@maevelle/contracts';

import { ProductReadiness } from '@/components/products/product-readiness';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { catalogData, formatCatalogMoney, productMediaUrl } from '@/lib/catalog/api';

const sections = ['overview', 'variants', 'media', 'organization', 'content'] as const;
type Section = (typeof sections)[number];

function optionSummary(
  workspace: CatalogProductWorkspaceDto,
  optionValueIds: readonly string[],
): string {
  const values = workspace.options.flatMap((axis) => axis.values);
  const labels = optionValueIds.map(
    (id) => values.find((value) => value.id === id)?.label ?? 'Unavailable value',
  );
  return labels.length > 0 ? labels.join(' / ') : 'Default Variant';
}

function formatMeasurement(value: string): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-BD', { maximumFractionDigits: 3 }).format(number)
    : value;
}

export function ProductDetails({ productId }: { productId: string }) {
  const searchParameters = useSearchParams();
  const requested = searchParameters.get('section') as Section | null;
  const section: Section = requested && sections.includes(requested) ? requested : 'overview';
  const [workspace, setWorkspace] = useState<CatalogProductWorkspaceDto>();
  const [categories, setCategories] = useState<readonly CatalogCategoryChoiceDto[]>([]);
  const [vocabulary, setVocabulary] = useState<{
    tags: readonly CatalogVocabularyItemDto[];
    occasions: readonly CatalogVocabularyItemDto[];
    collections: readonly CatalogVocabularyItemDto[];
  }>({ tags: [], occasions: [], collections: [] });
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(signal?: AbortSignal) {
    setState('loading');
    try {
      const [product, categoryChoices, tags, occasions, collections] = await Promise.all([
        catalogData<CatalogProductWorkspaceDto>(
          `/admin/catalog/products/${productId}`,
          signal ? { signal } : undefined,
        ),
        catalogData<readonly CatalogCategoryChoiceDto[]>(
          '/admin/catalog/categories',
          signal ? { signal } : undefined,
        ),
        catalogData<CatalogVocabularyListDto>(
          '/admin/catalog/vocabulary/TAG?status=ALL&page=1&pageSize=100',
          signal ? { signal } : undefined,
        ),
        catalogData<CatalogVocabularyListDto>(
          '/admin/catalog/vocabulary/OCCASION?status=ALL&page=1&pageSize=100',
          signal ? { signal } : undefined,
        ),
        catalogData<CatalogVocabularyListDto>(
          '/admin/catalog/vocabulary/COLLECTION?status=ALL&page=1&pageSize=100',
          signal ? { signal } : undefined,
        ),
      ]);
      setWorkspace(product);
      setCategories(categoryChoices);
      setVocabulary({
        tags: tags.items,
        occasions: occasions.items,
        collections: collections.items,
      });
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Product could not be loaded.');
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [productId]);

  const primaryMedia = workspace?.media.find((media) => media.isPrimary) ?? workspace?.media[0];
  const productMedia =
    workspace?.media.filter((media) => !media.variantId && !media.optionValueId) ?? [];

  const organizationLabels = useMemo(() => {
    if (!workspace) return { categories: [], tags: [], occasions: [], collections: [] };
    return {
      categories: workspace.organization.categoryIds.map(
        (id) => categories.find((category) => category.id === id)?.path ?? id,
      ),
      tags: workspace.organization.tagIds.map(
        (id) => vocabulary.tags.find((item) => item.id === id)?.name ?? id,
      ),
      occasions: workspace.organization.occasionIds.map(
        (id) => vocabulary.occasions.find((item) => item.id === id)?.name ?? id,
      ),
      collections: workspace.organization.collectionIds.map(
        (id) => vocabulary.collections.find((item) => item.id === id)?.name ?? id,
      ),
    };
  }, [workspace, categories, vocabulary]);

  async function lifecycle(action: 'publish' | 'unpublish' | 'archive' | 'restore') {
    if (!workspace || busy) return;
    if (
      (action === 'unpublish' || action === 'archive') &&
      !window.confirm(
        action === 'unpublish'
          ? `Unpublish ${workspace.title}? Customers will no longer discover it.`
          : `Archive ${workspace.title}? It will leave normal catalog operations and the Storefront. Historical references remain intact.`,
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: workspace.version }),
      });
      setMessage(
        action === 'publish'
          ? 'Product published successfully.'
          : action === 'unpublish'
            ? 'Product is no longer public.'
            : action === 'archive'
              ? 'Product archived.'
              : 'Product restored as a Draft.',
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product state could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading' || !workspace)
    return (
      <main className="px-5 py-14 text-center text-sm text-muted-foreground" aria-busy="true">
        Loading Product details…
      </main>
    );

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <nav
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link className="hover:text-foreground" href="/products">
          Products
        </Link>
        <span aria-hidden="true">/</span>
        <span className="max-w-[50vw] truncate text-foreground">{workspace.title}</span>
      </nav>
      <header className="flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10">
            {primaryMedia ? (
              <img
                alt={primaryMedia.altText ?? workspace.title}
                className="size-full object-cover"
                height={64}
                src={productMediaUrl(primaryMedia.assetId, primaryMedia.visibility)}
                width={64}
              />
            ) : (
              <PackageOpen className="size-6 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={workspace.status} />
              <StatusBadge status={workspace.publicationStatus} />
              <StatusBadge status={workspace.readiness.state} />
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{workspace.title}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {workspace.productTypeName} · /{workspace.handle}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" render={<Link href="/products" />}>
            <ArrowLeft aria-hidden="true" /> Products
          </Button>
          {workspace.status === 'ARCHIVED' ? (
            <Button variant="outline" disabled={busy} onClick={() => void lifecycle('restore')}>
              <RotateCcw aria-hidden="true" /> Restore Draft
            </Button>
          ) : (
            <>
              <Button variant="outline" render={<Link href={`/products/${workspace.id}/edit`} />}>
                <Edit3 aria-hidden="true" /> Edit Product
              </Button>
              {workspace.publicationStatus === 'PUBLISHED' ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void lifecycle('unpublish')}
                >
                  <EyeOff aria-hidden="true" /> Unpublish
                </Button>
              ) : (
                <Button
                  disabled={busy || !workspace.readiness.canPublish}
                  title={
                    workspace.readiness.canPublish
                      ? 'Publish Product'
                      : 'Resolve publishing blockers first'
                  }
                  onClick={() => void lifecycle('publish')}
                >
                  <CheckCircle2 aria-hidden="true" /> Publish
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void lifecycle('archive')}
              >
                <Archive aria-hidden="true" /> Archive
              </Button>
            </>
          )}
        </div>
      </header>

      {message ? (
        <div
          className="rounded-lg border bg-card px-3 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5" aria-label="Product summary">
        {(
          [
            ['Variants', workspace.operationalSignals.activeVariantCount, Boxes],
            [
              'Priced',
              `${workspace.operationalSignals.pricedVariantCount}/${workspace.operationalSignals.activeVariantCount}`,
              Tags,
            ],
            [
              'Available Variants',
              workspace.operationalSignals.availableVariantCount,
              CheckCircle2,
            ],
            ['Public Images', workspace.operationalSignals.publicMediaCount, ImageIcon],
            ['Categories', workspace.operationalSignals.categoryCount, PackageOpen],
          ] satisfies ReadonlyArray<readonly [string, string | number, LucideIcon]>
        ).map(([label, value, Icon]) => (
          <div
            className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
            key={String(label)}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" /> {label}
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums">{String(value)}</p>
          </div>
        ))}
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Product detail sections">
        {sections.map((item) => (
          <Link
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/30 ${section === item ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            aria-current={section === item ? 'page' : undefined}
            href={
              item === 'overview'
                ? `/products/${workspace.id}`
                : `/products/${workspace.id}?section=${item}`
            }
            key={item}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </Link>
        ))}
      </nav>

      {section === 'overview' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Product Overview</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  render={<Link href={`/products/${workspace.id}/edit?section=overview`} />}
                >
                  Edit
                </Button>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Product Name</dt>
                  <dd className="mt-1 text-sm">{workspace.title}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Product Type</dt>
                  <dd className="mt-1 text-sm">{workspace.productTypeName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Storefront Handle</dt>
                  <dd className="mt-1 break-all text-sm">/{workspace.handle}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Version</dt>
                  <dd className="mt-1 text-sm tabular-nums">{workspace.version}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Customer Description
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                    {workspace.description || 'No description yet.'}
                  </dd>
                </div>
              </dl>
            </section>
            <ProductReadiness readiness={workspace.readiness} productId={workspace.id} />
          </div>
          <aside className="space-y-4">
            <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h2 className="text-sm font-semibold">Primary Gallery</h2>
              {productMedia.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {productMedia.slice(0, 6).map((media) => (
                    <img
                      alt={media.altText ?? ''}
                      className="aspect-[3/4] w-full rounded-md object-cover"
                      height={128}
                      key={media.id}
                      loading="lazy"
                      src={productMediaUrl(media.assetId, media.visibility)}
                      width={96}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No Product images attached.</p>
              )}
              <Button
                className="mt-3 w-full"
                variant="outline"
                render={<Link href={`/products/${workspace.id}/edit?section=media`} />}
              >
                Manage Media
              </Button>
            </section>
            <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h2 className="text-sm font-semibold">Record Information</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd>
                    {workspace.updatedAt
                      ? new Intl.DateTimeFormat('en-BD', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(workspace.updatedAt))
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">SKU Preview</dt>
                  <dd className="font-mono text-xs">{workspace.skuPreview ?? '—'}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      ) : null}

      {section === 'variants' ? (
        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="font-semibold">Sellable Variants</h2>
              <p className="text-sm text-muted-foreground">
                Each row is an orderable and inventory-tracked SKU.
              </p>
            </div>
            <Button
              size="sm"
              render={<Link href={`/products/${workspace.id}/edit?section=variants`} />}
            >
              Manage Variants
            </Button>
          </header>
          {workspace.options.length > 0 ? (
            <div className="border-b px-4 py-4">
              <h3 className="text-sm font-semibold">Option Structure</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The customer choices that define each exact sellable combination.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {workspace.options.map((axis) => (
                  <div className="rounded-lg border bg-background p-3" key={axis.id}>
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm">{axis.name}</strong>
                      <StatusBadge status={axis.status} />
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{axis.code}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {axis.values.map((value) => (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
                          key={value.id}
                          title={
                            value.sizeDefinitionId
                              ? 'Linked to a normalized Size definition'
                              : value.color
                                ? `Linked to ${value.color.name}`
                                : undefined
                          }
                        >
                          {value.color ? (
                            <span
                              className="size-3 rounded-full border"
                              style={{ backgroundColor: value.color.hexValue ?? 'transparent' }}
                            />
                          ) : null}
                          {value.label}
                          {value.sizeDefinitionId ? ' · Normalized' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Variant</th>
                  <th className="px-4 py-2.5">Options</th>
                  <th className="px-4 py-2.5">Colors</th>
                  <th className="px-4 py-2.5">Price</th>
                  <th className="px-4 py-2.5">Physical</th>
                  <th className="px-4 py-2.5">Available</th>
                  <th className="px-4 py-2.5">Media</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workspace.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td className="px-4 py-3">
                      <strong className="block font-medium">{variant.title ?? variant.sku}</strong>
                      <span className="font-mono text-xs text-muted-foreground">{variant.sku}</span>
                      {variant.barcode ? (
                        <span className="block font-mono text-xs text-muted-foreground">
                          Barcode {variant.barcode}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {optionSummary(workspace, variant.optionValueIds)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[
                          ...(variant.primaryColor ? [variant.primaryColor] : []),
                          ...variant.associatedColors,
                        ].map((color) => (
                          <span
                            className="size-5 rounded-full border"
                            key={color.id}
                            style={{ backgroundColor: color.hexValue ?? 'transparent' }}
                            title={color.name}
                          />
                        ))}
                        {!variant.primaryColor && variant.associatedColors.length === 0
                          ? '—'
                          : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {variant.currentPrice
                        ? formatCatalogMoney(
                            variant.currentPrice.amount,
                            variant.currentPrice.currency,
                          )
                        : 'Not priced'}
                      {variant.currentPrice?.compareAtAmount ? (
                        <span className="block text-xs font-normal text-muted-foreground line-through">
                          {formatCatalogMoney(
                            variant.currentPrice.compareAtAmount,
                            variant.currentPrice.currency,
                          )}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="block">
                        {variant.weight
                          ? `${formatMeasurement(variant.weight.value)} ${variant.weight.unit.toLowerCase()}`
                          : 'No weight'}
                      </span>
                      <span className="block text-muted-foreground">
                        {variant.dimensions
                          ? `${formatMeasurement(variant.dimensions.length)} × ${formatMeasurement(variant.dimensions.width)} × ${formatMeasurement(variant.dimensions.height)} ${variant.dimensions.unit.toLowerCase()}`
                          : 'No dimensions'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{variant.sellableQuantity}</td>
                    <td className="px-4 py-3 tabular-nums">{variant.media.length}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={variant.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {workspace.variants.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              No Variants yet. Build the default SKU or a Product option matrix.
            </div>
          ) : null}
        </section>
      ) : null}

      {section === 'media' ? (
        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Product & Variant Media</h2>
              <p className="text-sm text-muted-foreground">
                Primary, general, option-value, and Variant-specific galleries.
              </p>
            </div>
            <Button render={<Link href={`/products/${workspace.id}/edit?section=media`} />}>
              Manage Media
            </Button>
          </div>
          {workspace.media.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {workspace.media.map((media) => {
                const variant = workspace.variants.find((item) => item.id === media.variantId);
                const value = workspace.options
                  .flatMap((axis) => axis.values)
                  .find((item) => item.id === media.optionValueId);
                return (
                  <figure
                    className="overflow-hidden rounded-lg border bg-background"
                    key={media.id}
                  >
                    <img
                      alt={media.altText ?? ''}
                      className="aspect-[3/4] w-full object-cover"
                      height={320}
                      loading="lazy"
                      src={productMediaUrl(media.assetId, media.visibility)}
                      width={240}
                    />
                    <figcaption className="space-y-0.5 p-2 text-xs">
                      <strong className="block truncate">
                        {media.title ?? media.role.replaceAll('_', ' ')}
                      </strong>
                      <span className="block truncate text-muted-foreground">
                        {variant
                          ? variant.sku
                          : value
                            ? `${value.label} gallery`
                            : 'Product gallery'}
                        {media.isPrimary ? ' · Primary' : ''}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No images attached yet.
            </div>
          )}
        </section>
      ) : null}

      {section === 'organization' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">Catalog Organization</h2>
              <Button
                size="sm"
                variant="ghost"
                render={<Link href={`/products/${workspace.id}/edit?section=organization`} />}
              >
                Edit
              </Button>
            </div>
            {(['categories', 'collections', 'tags', 'occasions'] as const).map((group) => (
              <div className="mt-4" key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {organizationLabels[group].length > 0 ? (
                    organizationLabels[group].map((label) => (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs" key={label}>
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">None assigned</span>
                  )}
                </div>
              </div>
            ))}
          </section>
          <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="font-semibold">Structured Attributes</h2>
            <dl className="mt-4 divide-y">
              {workspace.organization.attributes.map((attribute) => (
                <div className="grid grid-cols-2 gap-3 py-2.5 text-sm" key={attribute.id}>
                  <dt className="text-muted-foreground">
                    {attribute.name}
                    {attribute.required ? ' · Required' : ''}
                  </dt>
                  <dd>
                    {attribute.value === null
                      ? 'Not set'
                      : typeof attribute.value === 'boolean'
                        ? attribute.value
                          ? 'Yes'
                          : 'No'
                        : (attribute.referenceOptions.find(
                            (option) => option.id === attribute.value,
                          )?.label ?? attribute.value)}
                  </dd>
                </div>
              ))}
            </dl>
            {workspace.organization.attributes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                This Product Type has no Product-level attributes.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {section === 'content' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">Customer Information</h2>
              <Button
                size="sm"
                variant="ghost"
                render={<Link href={`/products/${workspace.id}/edit?section=content`} />}
              >
                Edit
              </Button>
            </div>
            {workspace.content.informationGroups.map((group) => (
              <div className="mt-4" key={group.id}>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <dl className="mt-2 divide-y">
                  {group.items.map((item) => (
                    <div className="grid grid-cols-2 gap-3 py-2 text-sm" key={item.id}>
                      <dt className="text-muted-foreground">{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {workspace.content.informationGroups.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No information groups yet.</p>
            ) : null}
          </section>
          <div className="space-y-5">
            <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <h2 className="font-semibold">Frequently Asked Questions</h2>
              <div className="mt-3 space-y-3">
                {workspace.content.faqs.map((faq) => (
                  <details className="rounded-lg border px-3 py-2" key={faq.id}>
                    <summary className="cursor-pointer text-sm font-medium">{faq.question}</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
              {workspace.content.faqs.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No FAQs yet.</p>
              ) : null}
            </section>
            <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <h2 className="font-semibold">Search Preview</h2>
              <p className="mt-3 text-sm font-medium text-blue-800">
                {workspace.content.seoTitle || workspace.title}
              </p>
              <p className="text-xs text-emerald-800">/products/{workspace.handle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {workspace.content.seoDescription ||
                  workspace.description ||
                  'No search description provided.'}
              </p>
            </section>
          </div>
        </div>
      ) : null}
    </main>
  );
}
