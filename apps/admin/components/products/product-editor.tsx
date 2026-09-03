'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
  ImageIcon,
  Layers3,
  LoaderCircle,
  PackageOpen,
  Settings2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductTypeDefinitionDto,
  CatalogProductWorkspaceDto,
  CatalogVocabularyListDto,
} from '@maevelle/contracts';

import { ProductContentForm } from '@/components/products/product-content-form';
import type { ProductEditorReferences } from '@/components/products/product-editor-types';
import { ProductMediaForm } from '@/components/products/product-media-form';
import { ProductOrganizationForm } from '@/components/products/product-organization-form';
import { ProductOverviewForm } from '@/components/products/product-overview-form';
import { ProductReview } from '@/components/products/product-review';
import { ProductSizingForm } from '@/components/products/product-sizing-form';
import { ProductVariantsForm } from '@/components/products/product-variants-form';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { catalogData } from '@/lib/catalog/api';

import { Ruler } from 'lucide-react';

const editorSections = [
  { id: 'overview', label: 'Overview', help: 'Identity and description', icon: PackageOpen },
  { id: 'organization', label: 'Organization', help: 'Categories and attributes', icon: Layers3 },
  { id: 'variants', label: 'Variants', help: 'Options, SKUs, price, stock', icon: Settings2 },
  { id: 'media', label: 'Media', help: 'Product and color galleries', icon: ImageIcon },
  { id: 'sizing', label: 'Sizing', help: 'Size system and guides', icon: Ruler },
  { id: 'content', label: 'Content', help: 'Information, FAQs, and SEO', icon: FileText },
  { id: 'review', label: 'Review', help: 'Readiness and publishing', icon: Check },
] as const satisfies ReadonlyArray<{
  readonly id: string;
  readonly label: string;
  readonly help: string;
  readonly icon: LucideIcon;
}>;

type EditorSection = (typeof editorSections)[number]['id'];

function isEditorSection(value: string | null): value is EditorSection {
  return editorSections.some((section) => section.id === value);
}

const emptyReferences: ProductEditorReferences = {
  types: [],
  categories: [],
  colors: [],
  tags: [],
  occasions: [],
  collections: [],
  sizeSystems: [],
  sizeDefinitions: [],
};

export function ProductEditor({ productId }: { productId: string }) {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const requestedSection = searchParameters.get('section');
  const section: EditorSection = isEditorSection(requestedSection) ? requestedSection : 'overview';
  const guidedSetup = searchParameters.get('setup') === '1';
  const [workspace, setWorkspace] = useState<CatalogProductWorkspaceDto>();
  const [references, setReferences] = useState<ProductEditorReferences>(emptyReferences);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadWorkspace = useCallback(
    async (successMessage?: string) => {
      try {
        const next = await catalogData<CatalogProductWorkspaceDto>(
          `/admin/catalog/products/${productId}`,
        );
        setWorkspace(next);
        setDirty(false);
        setError('');
        if (successMessage) setMessage(successMessage);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Product could not be loaded.');
      }
    },
    [productId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      catalogData<CatalogProductWorkspaceDto>(`/admin/catalog/products/${productId}`, {
        signal: controller.signal,
      }),
      catalogData<readonly CatalogProductTypeDefinitionDto[]>(
        '/admin/catalog/product-type-definitions',
        { signal: controller.signal },
      ),
      catalogData<readonly CatalogCategoryChoiceDto[]>('/admin/catalog/categories', {
        signal: controller.signal,
      }),
      catalogData<readonly CatalogColorDto[]>('/admin/catalog/colors', {
        signal: controller.signal,
      }),
      catalogData<CatalogVocabularyListDto>(
        '/admin/catalog/vocabulary/TAG?status=ACTIVE&page=1&pageSize=100',
        { signal: controller.signal },
      ),
      catalogData<CatalogVocabularyListDto>(
        '/admin/catalog/vocabulary/OCCASION?status=ACTIVE&page=1&pageSize=100',
        { signal: controller.signal },
      ),
      catalogData<CatalogVocabularyListDto>(
        '/admin/catalog/vocabulary/COLLECTION?status=ACTIVE&page=1&pageSize=100',
        { signal: controller.signal },
      ),
      catalogData<{
        readonly systems: ProductEditorReferences['sizeSystems'];
        readonly sizeDefinitions: ProductEditorReferences['sizeDefinitions'];
      }>('/admin/sizing', { signal: controller.signal }).catch(() => ({
        systems: [],
        sizeDefinitions: [],
      })),
    ])
      .then(([product, types, categories, colors, tags, occasions, collections, sizing]) => {
        setWorkspace(product);
        setReferences({
          types,
          categories,
          colors,
          tags: tags.items,
          occasions: occasions.items,
          collections: collections.items,
          sizeSystems: sizing.systems,
          sizeDefinitions: sizing.sizeDefinitions,
        });
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError'))
          setError(
            caught instanceof Error ? caught.message : 'Product editor could not be loaded.',
          );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [productId]);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  const currentIndex = editorSections.findIndex((item) => item.id === section);
  const next = editorSections[currentIndex + 1];
  const previous = editorSections[currentIndex - 1];
  const sectionProps = useMemo(
    () =>
      workspace
        ? {
            workspace,
            references,
            onRefresh: loadWorkspace,
            onMessage: setMessage,
            onDirtyChange: setDirty,
          }
        : undefined,
    [loadWorkspace, references, workspace],
  );

  function navigate(target: EditorSection) {
    if (dirty && !window.confirm('Discard the unsaved changes in this section?')) return;
    setDirty(false);
    setMessage('');
    router.push(`/products/${productId}/edit?section=${target}${guidedSetup ? '&setup=1' : ''}`);
  }

  if (loading)
    return (
      <main className="flex min-h-[55vh] items-center justify-center gap-2 px-6 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Loading Product editor…
      </main>
    );
  if (!workspace || !sectionProps)
    return (
      <main className="px-6 py-12">
        <div
          className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
          role="alert"
        >
          <CircleAlert className="mb-2 size-5" aria-hidden="true" />
          {error || 'This Product could not be found.'}
          <div className="mt-4">
            <Button variant="outline" render={<Link href="/products" />}>
              Back to Products
            </Button>
          </div>
        </div>
      </main>
    );

  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <nav
        className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link className="hover:text-foreground" href="/products">
          Products
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          className="max-w-72 truncate hover:text-foreground"
          href={`/products/${workspace.id}`}
        >
          {workspace.title}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">Edit</span>
      </nav>
      <header className="mb-5 flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{workspace.title}</h1>
            <StatusBadge status={workspace.status} />
            <StatusBadge status={workspace.publicationStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {guidedSetup ? 'Guided Product setup' : 'Product editor'} · {workspace.productTypeName}{' '}
            · <span className="font-mono">/{workspace.handle}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href={`/products/${workspace.id}`} />}>
            <ArrowLeft aria-hidden="true" /> Product Details
          </Button>
          <Button variant="outline" render={<Link href="/products" />}>
            Save Draft & Exit
          </Button>
        </div>
      </header>

      {message ? (
        <p
          className="mb-4 rounded-lg border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <nav
            className="overflow-hidden rounded-xl bg-card p-2 ring-1 ring-foreground/10"
            aria-label="Product editor sections"
          >
            {editorSections.map((item, index) => {
              const Icon = item.icon;
              const active = item.id === section;
              const passed = guidedSetup && index < currentIndex;
              return (
                <button
                  aria-current={active ? 'step' : undefined}
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-primary-foreground/15' : passed ? 'bg-emerald-100 text-emerald-800' : 'bg-muted'}`}
                  >
                    {passed ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Icon className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-medium">
                      {guidedSetup ? `${index + 1}. ` : ''}
                      {item.label}
                    </strong>
                    <small
                      className={`block truncate text-xs ${active ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}
                    >
                      {item.help}
                    </small>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mt-3 rounded-xl border bg-card p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Publishing:</strong>{' '}
            {workspace.readiness.blockerCount > 0
              ? `${workspace.readiness.blockerCount} blocker${workspace.readiness.blockerCount === 1 ? '' : 's'} remaining`
              : workspace.publicationStatus === 'PUBLISHED'
                ? 'Published'
                : 'Ready when you are'}
          </div>
        </aside>

        <div className="min-w-0">
          {section === 'overview' ? <ProductOverviewForm {...sectionProps} /> : null}
          {section === 'organization' ? <ProductOrganizationForm {...sectionProps} /> : null}
          {section === 'variants' ? <ProductVariantsForm {...sectionProps} /> : null}
          {section === 'media' ? <ProductMediaForm {...sectionProps} /> : null}
          {section === 'sizing' ? <ProductSizingForm {...sectionProps} /> : null}
          {section === 'content' ? <ProductContentForm {...sectionProps} /> : null}
          {section === 'review' ? <ProductReview {...sectionProps} /> : null}

          {guidedSetup ? (
            <footer className="mt-5 flex flex-col-reverse gap-2 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                disabled={!previous}
                onClick={() => previous && navigate(previous.id)}
              >
                <ArrowLeft aria-hidden="true" /> Previous
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Step {currentIndex + 1} of {editorSections.length}
                {dirty ? ' · Save this section before continuing' : ''}
              </p>
              {next ? (
                <Button disabled={dirty} onClick={() => navigate(next.id)}>
                  Next: {next.label} <ArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <Button render={<Link href={`/products/${workspace.id}`} />}>
                  Finish Setup <Check aria-hidden="true" />
                </Button>
              )}
            </footer>
          ) : null}
        </div>
      </div>
    </main>
  );
}
