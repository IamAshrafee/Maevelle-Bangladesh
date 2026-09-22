'use client';

import {
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileCheck2,
  FileText,
  ImageIcon,
  Layers3,
  Loader2,
  LoaderCircle,
  PackageOpen,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Star,
  Tags,
  Trash2,
  Undo2,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import type {
  ApiEnvelope,
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductCreateDto,
  CatalogProductMediaDto,
  CatalogProductSummaryDto,
  CatalogProductTypeDefinitionDto,
  CatalogProductUpdateDto,
  CatalogProductWorkspaceDto,
  CatalogVariantCreateDto,
  CatalogVariantMatrixDto,
  CatalogVocabularyItemDto,
  CatalogVocabularyListDto,
  SizeGuideSummaryDto,
} from '@maevelle/contracts';

import { CatalogContentEditor } from '@/components/catalog-content-editor';
import {
  catalogContentFromWorkspace,
  catalogContentPayload,
  isCatalogContentDirty,
  mergeCatalogContent,
  useCurrentCatalogContentConflicts,
  type CatalogContentConflict,
  type CatalogContentValues,
} from '@/components/catalog-content-state';
import { ProductReadiness } from '@/components/products/product-readiness';
import { storefrontProductHref } from '@/components/products/product-workspace-links';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CatalogRequestError,
  catalogData,
  catalogRequest,
  productMediaUrl,
} from '@/lib/catalog/api';

// ============================================================================
// Types & Contracts
// ============================================================================

export interface ProductEditorReferences {
  readonly types: readonly CatalogProductTypeDefinitionDto[];
  readonly categories: readonly CatalogCategoryChoiceDto[];
  readonly colors: readonly CatalogColorDto[];
  readonly tags: readonly CatalogVocabularyItemDto[];
  readonly occasions: readonly CatalogVocabularyItemDto[];
  readonly collections: readonly CatalogVocabularyItemDto[];
  readonly sizeSystems: readonly {
    readonly id: string;
    readonly sizingDomainId: string;
    readonly name: string;
    readonly status: 'ACTIVE' | 'ARCHIVED';
  }[];
  readonly sizeDefinitions: readonly {
    readonly id: string;
    readonly sizeSystemId: string;
    readonly code: string;
    readonly label: string;
    readonly sortOrder: number;
  }[];
}

export interface ProductEditorSectionProps {
  readonly workspace: CatalogProductWorkspaceDto;
  readonly references: ProductEditorReferences;
  readonly onRefresh: (message?: string) => Promise<void>;
  readonly onMessage: (message: string) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
}

// ============================================================================
// Helpers & Utilities
// ============================================================================

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function handleFromTitle(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}



// ============================================================================
// Sub-Component: Product Variants Table
// ============================================================================

type EditableMatrixRow = CatalogVariantMatrixDto['rows'][number] & {
  readonly variant: NonNullable<CatalogVariantMatrixDto['rows'][number]['variant']>;
};

type VariantFormValues = {
  variants: {
    id: string;
    version: number;
    title: string;
    sku: string;
    price: string;
    compareAtPrice: string;
    status: 'ACTIVE' | 'ARCHIVED';
  }[];
};

function formRows(rows: readonly EditableMatrixRow[]): VariantFormValues['variants'] {
  return rows.map((row) => ({
    id: row.variant.id,
    version: row.variant.version,
    title: row.variant.title ?? row.values.map((value) => value.valueLabel).join(' / '),
    sku: row.variant.sku,
    price: row.variant.currentPrice?.amount ?? '',
    compareAtPrice: row.variant.currentPrice?.compareAtAmount ?? '',
    status: row.variant.status,
  }));
}

function ProductVariantsTable({
  matrix,
  onSaved,
  onDirtyChange,
  onMessage,
}: {
  matrix: CatalogVariantMatrixDto;
  onSaved: (message: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const editableRows = useMemo(
    () => matrix.rows.filter((row): row is EditableMatrixRow => row.variant !== null),
    [matrix.rows],
  );
  const form = useForm<VariantFormValues>({ defaultValues: { variants: formRows(editableRows) } });
  const { fields } = useFieldArray({ control: form.control, name: 'variants' });
  const isDirty = form.formState.isDirty;

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(() => form.reset({ variants: formRows(editableRows) }), [editableRows, form]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  async function onSubmit(data: VariantFormValues) {
    if (!isDirty || busy) return;
    const dirtyRows = form.formState.dirtyFields.variants;
    if (!dirtyRows) return;
    setBusy(true);
    let completedRows = 0;
    try {
      for (const [index, row] of data.variants.entries()) {
        const dirty = dirtyRows[index];
        if (!dirty) continue;
        const coreChanged = Boolean(dirty.title || dirty.sku || dirty.status);
        const priceChanged = Boolean(dirty.price || dirty.compareAtPrice);
        if (priceChanged && !row.price.trim())
          throw new Error(`Enter a selling price for ${row.sku} before saving its price.`);

        if (coreChanged) {
          await catalogData(`/admin/catalog/products/${matrix.product.id}/variants/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              version: row.version,
              title: row.title.trim() || null,
              sku: row.sku,
              status: row.status,
            }),
          });
        }
        if (priceChanged) {
          await catalogData(`/admin/pricing/variants/${row.id}/current`, {
            method: 'PUT',
            body: JSON.stringify({
              currency: matrix.product.defaultCurrency,
              amount: row.price,
              compareAtAmount: row.compareAtPrice || null,
            }),
          });
        }
        completedRows += 1;
      }
      await onSaved(`${completedRows} Variant${completedRows === 1 ? '' : 's'} updated.`);
    } catch (error) {
      await onSaved('');
      const detail = error instanceof Error ? error.message : 'Variants could not be saved.';
      onMessage(
        completedRows > 0
          ? `${completedRows} Variant${completedRows === 1 ? '' : 's'} saved before the operation stopped. ${detail} Review the refreshed values and retry the remaining changes.`
          : detail,
      );
    } finally {
      setBusy(false);
    }
  }

  if (editableRows.length === 0)
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        This page has no generated Variants. Generate its missing combinations above or move to
        another page.
      </div>
    );

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Combination</th>
              <th className="px-3 py-3 font-medium">SKU</th>
              <th className="px-3 py-3 font-medium">Price</th>
              <th className="px-3 py-3 font-medium">Compare At</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Inventory</th>
              <th className="px-3 py-3 font-medium">Setup</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((field, index) => {
              const source = editableRows[index]!;
              const combination = source.values.map((value) => value.valueLabel).join(' / ');
              return (
                <tr key={field.id} className="hover:bg-muted/30">
                  <td className="max-w-56 px-3 py-2">
                    <Input
                      aria-label={`Combination title for ${source.variant.sku}`}
                      autoComplete="off"
                      className="h-9 bg-transparent"
                      {...form.register(`variants.${index}.title`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`SKU for ${combination}`}
                      autoComplete="off"
                      className="h-9 min-w-40 bg-transparent font-mono text-xs uppercase"
                      spellCheck={false}
                      {...form.register(`variants.${index}.sku`, { required: true })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Selling price for ${source.variant.sku}`}
                      className="h-9 min-w-28 bg-transparent tabular-nums"
                      inputMode="decimal"
                      min="0"
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      {...form.register(`variants.${index}.price`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Compare-at price for ${source.variant.sku}`}
                      className="h-9 min-w-28 bg-transparent tabular-nums"
                      inputMode="decimal"
                      min="0"
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      {...form.register(`variants.${index}.compareAtPrice`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Status for ${source.variant.sku}`}
                      className="h-9 min-w-28 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      {...form.register(`variants.${index}.status`)}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Link
                      href={`/inventory/adjustments?variantId=${encodeURIComponent(source.variant.id)}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      title={`Set or adjust ${source.variant.sku} stock`}
                    >
                      <span className="tabular-nums">{source.variant.sellableQuantity}</span>
                      <span>
                        {source.variant.sellableQuantity === '0' ? 'Add stock' : 'Adjust'}
                      </span>
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {source.variant.setupIssues.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
                        {source.variant.setupIssues.join(', ')}
                      </span>
                    ) : (
                      'Complete'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Catalog identity and Pricing are saved through their authoritative services. If one
          service rejects a row, completed rows remain saved and the table refreshes before retry.
        </p>
        <Button type="submit" disabled={!isDirty || busy} className="min-h-11 sm:min-h-8">
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {busy ? 'Saving…' : 'Save This Page'}
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// Sub-Component: Gallery Drag & Drop Grid
// ============================================================================

function GallerySection({
  title,
  description,
  media,
  onUpload,
  onRemove,
  onMakePrimary,
  isUploading,
}: {
  title: string;
  description: string;
  media: readonly CatalogProductMediaDto[];
  onUpload: (files: FileList) => void;
  onRemove: (mediaId: string) => void;
  onMakePrimary: (media: CatalogProductMediaDto) => void;
  isUploading: boolean;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrag(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === 'dragenter' || event.type === 'dragover');
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files.length > 0) onUpload(event.dataTransfer.files);
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b bg-muted/20 px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="p-4">
        <div
          className={
            'grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 ' +
            (dragActive ? 'bg-primary/5' : '')
          }
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {media.map((item) => (
            <div
              key={item.id}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted focus-within:ring-2 focus-within:ring-ring"
            >
              <Image
                alt={item.altText ?? ''}
                className="object-cover"
                fill
                sizes="(max-width: 640px) 50vw, 150px"
                src={productMediaUrl(item.assetId, item.visibility)}
                unoptimized
              />
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-black/55 p-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                {!item.isPrimary ? (
                  <button
                    type="button"
                    aria-label={'Make image primary for ' + title}
                    title="Make Primary"
                    className="inline-flex size-11 items-center justify-center rounded-full bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9"
                    onClick={() => onMakePrimary(item)}
                  >
                    <Star className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={'Remove image from ' + title}
                  title="Remove Image"
                  className="inline-flex size-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9"
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
              {item.isPrimary ? (
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-sm bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background">
                  <Star className="size-3 fill-current" aria-hidden="true" /> Primary
                </div>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            aria-label={'Upload images to ' + title}
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className={
              'flex aspect-square min-h-28 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
              (dragActive ? 'border-primary text-primary' : 'border-muted-foreground/25')
            }
          >
            {isUploading ? (
              <Loader2 className="mb-2 size-6 animate-spin" aria-hidden="true" />
            ) : (
              <UploadCloud className="mb-2 size-6" aria-hidden="true" />
            )}
            <span className="px-2 text-center text-xs font-medium">
              {isUploading ? 'Uploading…' : 'Choose or Drop Images'}
            </span>
          </button>
          <input
            ref={inputRef}
            aria-label={'Choose images for ' + title}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.length) onUpload(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
        {media.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No images are assigned to this gallery yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ============================================================================
// Section: Overview Form
// ============================================================================

const overviewSchema = z.object({
  title: z.string().min(1, 'Enter the customer-facing Product name.'),
  handle: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Storefront handle must use lowercase words separated by hyphens.'),
  productTypeId: z.string().min(1, 'Choose a Product Type.'),
  description: z.string().max(5000).optional().nullable(),
});

type OverviewFormValues = z.infer<typeof overviewSchema>;

function ProductOverviewForm({
  workspace,
  references,
  onRefresh,
  onMessage,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const router = useRouter();
  const isNew = workspace.id === '';
  const [error, setError] = useState('');
  const [handleEdited, setHandleEdited] = useState(!isNew);

  const form = useForm<OverviewFormValues>({
    resolver: zodResolver(overviewSchema),
    defaultValues: {
      title: workspace.title || '',
      handle: workspace.handle || '',
      productTypeId: workspace.productTypeId || '',
      description: workspace.description || '',
    },
  });

  useEffect(() => {
    if (isNew && !form.getValues('productTypeId')) {
      const activeType = references.types.find((t) => t.status === 'ACTIVE');
      if (activeType) {
        form.setValue('productTypeId', activeType.id, { shouldValidate: true, shouldDirty: false });
      }
    }
  }, [isNew, references.types, form]);

  useEffect(() => onDirtyChange(form.formState.isDirty), [form.formState.isDirty, onDirtyChange]);

  async function onSubmit(values: OverviewFormValues) {
    if (!form.formState.isDirty) return;

    if (
      !isNew &&
      values.productTypeId !== workspace.productTypeId &&
      workspace.variants.length > 0 &&
      !window.confirm(
        'Changing Product Type may change required attributes and sizing expectations. Existing Variants remain intact. Continue?',
      )
    ) {
      return;
    }

    setError('');

    try {
      if (isNew) {
        const payload: CatalogProductCreateDto = {
          title: values.title.trim(),
          handle: values.handle.trim(),
          productTypeId: values.productTypeId,
          ...(values.description?.trim() ? { description: values.description.trim() } : {}),
        };

        const product = await catalogData<CatalogProductSummaryDto>('/admin/catalog/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        form.reset(values);
        onDirtyChange(false);

        router.replace(`/products/${product.id}/edit?setup=1&section=organization`);
      } else {
        const payload: CatalogProductUpdateDto = {
          title: values.title.trim(),
          handle: values.handle.trim(),
          productTypeId: values.productTypeId,
          description: values.description?.trim() || null,
        };

        await catalogData(`/admin/catalog/products/${workspace.id}`, {
          method: 'PATCH',
          headers: { 'if-match': `"${workspace.version}"` },
          body: JSON.stringify(payload),
        });

        form.reset(values);
        await onRefresh('Product overview saved. Publishing readiness was recalculated.');
      }
    } catch (caught) {
      setError(
        caught instanceof CatalogRequestError && caught.code === 'STALE_VERSION'
          ? 'This Product changed in another session. Your entries are preserved. Open the details page in another tab to compare, then retry after refreshing.'
          : caught instanceof Error
            ? caught.message
            : 'Product overview could not be saved.',
      );
    }
  }

  return (
    <form
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <header className="border-b px-5 py-4">
        <h2 className="font-semibold">Product Overview</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Shared customer identity and the structural Product Type.
        </p>
      </header>
      <fieldset className="grid gap-5 p-5 sm:grid-cols-2" disabled={form.formState.isSubmitting}>
        <legend className="sr-only">Product overview</legend>
        <div className="space-y-2">
          <Label htmlFor="edit-product-title">Product Name</Label>
          <Input
            autoComplete="off"
            id="edit-product-title"
            maxLength={180}
            placeholder="Example: Linen Wrap Dress…"
            {...form.register('title')}
            onChange={(event) => {
              const value = event.target.value;
              form.setValue('title', value, { shouldValidate: true, shouldDirty: true });
              if (!handleEdited) {
                form.setValue('handle', handleFromTitle(value), { shouldValidate: true, shouldDirty: true });
              }
              setError('');
            }}
          />
          {form.formState.errors.title && (
            <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-product-handle">Storefront Handle</Label>
          <Input
            autoCapitalize="none"
            autoComplete="off"
            id="edit-product-handle"
            maxLength={160}
            placeholder="linen-wrap-dress…"
            spellCheck={false}
            {...form.register('handle')}
            onChange={(event) => {
              setHandleEdited(true);
              form.setValue('handle', handleFromTitle(event.target.value), { shouldValidate: true, shouldDirty: true });
              setError('');
            }}
          />
          {form.formState.errors.handle ? (
            <p className="text-sm text-destructive">{form.formState.errors.handle.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isNew ? 'Storefront URL preview.' : 'Changes preserve the old published handle as a redirect.'}
            </p>
          )}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-product-type">Product Type</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            id="edit-product-type"
            {...form.register('productTypeId')}
          >
            {isNew && <option value="">Choose a Product Type</option>}
            {references.types
              .filter((type) => type.status === 'ACTIVE' || type.id === form.getValues('productTypeId'))
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {type.status === 'ARCHIVED' ? ' (Archived)' : ''}
                </option>
              ))}
          </select>
          {form.formState.errors.productTypeId && (
            <p className="text-sm text-destructive">{form.formState.errors.productTypeId.message}</p>
          )}
          {!isNew && form.watch('productTypeId') !== workspace.productTypeId ? (
            <p className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> Changing type
              recalculates required Product attributes. Incompatible values are never silently
              deleted.
            </p>
          ) : null}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex justify-between gap-3">
            <Label htmlFor="edit-product-description">Customer Description</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {form.watch('description')?.length || 0}/5000
            </span>
          </div>
          <textarea
            className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            id="edit-product-description"
            maxLength={5000}
            placeholder="Describe the material, silhouette, finish, use, and customer value…"
            {...form.register('description')}
          />
        </div>
      </fieldset>
      {error ? (
        <p
          className="mx-5 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <footer className="flex items-center justify-between gap-3 border-t bg-muted/35 px-5 py-4">
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {isNew ? 'New product draft' : (form.formState.isDirty ? 'Unsaved overview changes' : `Version ${workspace.version} is saved`)}
        </span>
        <div className="flex gap-2">
          {!isNew && (
            <Button
              type="button"
              variant="outline"
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
              onClick={() => {
                form.reset();
                setError('');
                onMessage('Overview changes discarded.');
              }}
            >
              <Undo2 aria-hidden="true" /> Discard
            </Button>
          )}
          <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
            {isNew ? (
              <>Save & Continue <ArrowRight aria-hidden="true" className="ml-2 size-4" /></>
            ) : (
              <><Save aria-hidden="true" /> {form.formState.isSubmitting ? 'Saving…' : 'Save Overview'}</>
            )}
          </Button>
        </div>
      </footer>
    </form>
  );
}

// ============================================================================
// Section: Organization Form
// ============================================================================

function ProductOrganizationForm({
  workspace,
  references,
  onRefresh,
  onMessage,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const [error, setError] = useState('');
  const [guides, setGuides] = useState<SizeGuideSummaryDto[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const [guidesError, setGuidesError] = useState('');

  useEffect(() => {
    let active = true;
    void catalogData<SizeGuideSummaryDto[]>('/admin/sizing/guides')
      .then((res) => {
        if (active) {
          setGuides(res ?? []);
          setGuidesError('');
          setLoadingGuides(false);
        }
      })
      .catch(() => {
        if (active) {
          setGuidesError('Size guides could not be loaded. Reload the editor before choosing one.');
          setLoadingGuides(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const dynamicSchema = useMemo(() => {
    return z
      .object({
        categoryIds: z.array(z.string()),
        primaryCategoryId: z.string().optional().nullable(),
        tagIds: z.array(z.string()),
        occasionIds: z.array(z.string()),
        collectionIds: z.array(z.string()),
        sizeSystemId: z.string().optional().nullable(),
        sizeGuideId: z.string().optional().nullable(),
        attributeValues: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()])),
      })
      .superRefine((data, ctx) => {
        if (data.sizeGuideId && !data.sizeSystemId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Choose a size system before selecting a size guide.',
            path: ['sizeGuideId'],
          });
        }
        workspace.organization.attributes.forEach((attr) => {
          if (attr.required) {
            const val = data.attributeValues[attr.id];
            if (val === null || val === '' || val === undefined) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `${attr.name} is required.`,
                path: ['attributeValues', attr.id],
              });
            }
          }
        });
      });
  }, [workspace.organization.attributes]);

  type OrgFormValues = z.infer<typeof dynamicSchema>;

  const baseline = useMemo(
    () => ({
      categoryIds: [...workspace.organization.categoryIds],
      primaryCategoryId: workspace.organization.primaryCategoryId ?? '',
      tagIds: [...workspace.organization.tagIds],
      occasionIds: [...workspace.organization.occasionIds],
      collectionIds: [...workspace.organization.collectionIds],
      sizeSystemId: workspace.sizeSystemId ?? '',
      sizeGuideId: workspace.sizeGuideId ?? '',
      attributeValues: Object.fromEntries(
        workspace.organization.attributes.map((attribute) => [attribute.id, attribute.value]),
      ),
    }),
    [workspace.organization, workspace.sizeGuideId, workspace.sizeSystemId],
  );

  const form = useForm<OrgFormValues>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: baseline,
  });

  useEffect(() => {
    form.reset(baseline);
  }, [baseline, form]);

  useEffect(() => onDirtyChange(form.formState.isDirty), [form.formState.isDirty, onDirtyChange]);

  const selectedSystem = references.sizeSystems.find(
    (system) => system.id === form.watch('sizeSystemId'),
  );
  const selectedGuideId = form.watch('sizeGuideId') ?? '';
  const matchingGuides = guides.filter(
    (guide) =>
      guide.hasPublishedRevision &&
      selectedSystem !== undefined &&
      guide.sizingDomainId === selectedSystem.sizingDomainId,
  );
  const selectedGuideIsEligible = matchingGuides.some((guide) => guide.id === selectedGuideId);

  function toggleArrayField(
    field: 'categoryIds' | 'tagIds' | 'occasionIds' | 'collectionIds',
    id: string,
  ) {
    const current = form.getValues(field);
    const selected = current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id];

    form.setValue(field, selected, { shouldDirty: true, shouldValidate: true });

    if (field === 'categoryIds') {
      const primary = form.getValues('primaryCategoryId');
      if (primary && !selected.includes(primary)) {
        form.setValue('primaryCategoryId', '', { shouldDirty: true, shouldValidate: true });
      }
    }
  }

  async function onSubmit(values: OrgFormValues) {
    if (!form.formState.isDirty) return;

    setError('');
    let version = workspace.version;

    try {
      const categoriesChanged =
        !same(baseline.categoryIds, values.categoryIds) ||
        baseline.primaryCategoryId !== values.primaryCategoryId;

      if (categoriesChanged) {
        const saved = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${workspace.id}/categories`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${version}"` },
            body: JSON.stringify({
              categoryIds: values.categoryIds,
              primaryCategoryId: values.primaryCategoryId || null,
            }),
          },
        );
        version = saved.version;
      }

      if (!same(baseline.attributeValues, values.attributeValues)) {
        const saved = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${workspace.id}/attributes`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${version}"` },
            body: JSON.stringify({
              values: workspace.organization.attributes.map((attribute) => ({
                attributeDefinitionId: attribute.id,
                value: values.attributeValues[attribute.id] ?? null,
              })),
            }),
          },
        );
        version = saved.version;
      }

      const vocabularyChanged =
        !same(baseline.tagIds, values.tagIds) ||
        !same(baseline.occasionIds, values.occasionIds) ||
        !same(baseline.collectionIds, values.collectionIds);

      if (vocabularyChanged) {
        await catalogData(`/admin/catalog/products/${workspace.id}/vocabulary`, {
          method: 'PUT',
          body: JSON.stringify({
            version,
            tagIds: values.tagIds,
            occasionIds: values.occasionIds,
            collectionIds: values.collectionIds,
          }),
        });
      }

      if (
        baseline.sizeSystemId !== values.sizeSystemId ||
        baseline.sizeGuideId !== values.sizeGuideId
      ) {
        if (values.sizeSystemId) {
          await catalogRequest(`/admin/catalog/products/${workspace.id}/size-configuration`, {
            method: 'PUT',
            body: JSON.stringify({
              sizeSystemId: values.sizeSystemId,
              ...(values.sizeGuideId ? { sizeGuideId: values.sizeGuideId } : {}),
            }),
          });
        } else {
          await catalogRequest(`/admin/catalog/products/${workspace.id}/size-configuration`, {
            method: 'DELETE',
          });
        }
      }

      await onRefresh('Product organization and structured attributes saved.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message} Successfully saved sections remain saved; your remaining entries are preserved.`
          : 'Product organization could not be saved.',
      );
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Categories</h2>
          <p className="text-sm text-muted-foreground">
            Place this Product in every relevant navigation path and choose its main placement.
          </p>
        </header>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <fieldset disabled={form.formState.isSubmitting}>
            <legend className="mb-2 text-sm font-medium">Assigned Categories</legend>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {references.categories.map((category) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  key={category.id}
                >
                  <input
                    checked={form.watch('categoryIds').includes(category.id)}
                    type="checkbox"
                    onChange={() => toggleArrayField('categoryIds', category.id)}
                  />
                  <span className="min-w-0 truncate">{category.path}</span>
                </label>
              ))}
              {references.categories.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  No active Categories are available.
                </p>
              ) : null}
            </div>
            {form.formState.errors.categoryIds && (
              <p className="mt-1 text-sm text-destructive">
                {form.formState.errors.categoryIds.message}
              </p>
            )}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="primary-category">Primary Category</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              disabled={form.watch('categoryIds').length === 0 || form.formState.isSubmitting}
              id="primary-category"
              {...form.register('primaryCategoryId')}
            >
              <option value="">No primary category</option>
              {references.categories
                .filter((category) => form.watch('categoryIds').includes(category.id))
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.path}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The primary Category is the canonical merchandising placement.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Structured Attributes</h2>
          <p className="text-sm text-muted-foreground">
            Fields come from {workspace.productTypeName} and power filters, search, and customer
            details.
          </p>
        </header>
        <fieldset className="grid gap-5 p-5 sm:grid-cols-2" disabled={form.formState.isSubmitting}>
          <legend className="sr-only">Product attributes</legend>
          {workspace.organization.attributes.map((attribute) => {
            const value = form.watch(`attributeValues.${attribute.id}`);
            const errorObj = form.formState.errors.attributeValues?.[attribute.id];

            return (
              <div className="space-y-2" key={attribute.id}>
                <Label htmlFor={`attribute-${attribute.id}`}>
                  {attribute.name}
                  {attribute.required ? (
                    <span className="ml-1 text-destructive" aria-label="required">
                      Required
                    </span>
                  ) : null}
                </Label>
                {attribute.valueType === 'BOOLEAN' ? (
                  <select
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    id={`attribute-${attribute.id}`}
                    value={value === null || value === undefined ? '' : value ? 'true' : 'false'}
                    onChange={(event) =>
                      form.setValue(
                        `attributeValues.${attribute.id}`,
                        event.target.value === '' ? null : event.target.value === 'true',
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                  >
                    <option value="">Not set</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : attribute.valueType === 'REFERENCE' ? (
                  <select
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    id={`attribute-${attribute.id}`}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) =>
                      form.setValue(`attributeValues.${attribute.id}`, event.target.value || null, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  >
                    <option value="">Choose {attribute.name}</option>
                    {attribute.referenceOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                        {option.status === 'ARCHIVED' ? ' (Archived)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    autoComplete="off"
                    id={`attribute-${attribute.id}`}
                    inputMode={
                      attribute.valueType === 'INTEGER' || attribute.valueType === 'DECIMAL'
                        ? 'decimal'
                        : undefined
                    }
                    type={attribute.valueType === 'DATE' ? 'date' : 'text'}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) =>
                      form.setValue(`attributeValues.${attribute.id}`, event.target.value || null, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                )}
                {errorObj && <p className="text-sm text-destructive">{errorObj.message}</p>}
              </div>
            );
          })}
          {workspace.organization.attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              This Product Type has no active Product-level attributes.
            </p>
          ) : null}
        </fieldset>
      </section>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Sizing</h2>
          <p className="text-sm text-muted-foreground">
            Attach a size system and a published size guide to this product.
          </p>
        </header>
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <fieldset disabled={form.formState.isSubmitting} className="space-y-2">
            <Label htmlFor="sizeSystemId">Size System</Label>
            <select
              id="sizeSystemId"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              {...form.register('sizeSystemId')}
            >
              <option value="">No sizing system</option>
              {references.sizeSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Select the standardized sizing system used by this product&apos;s variants. The guide list
              is limited to the same sizing domain.
            </p>
          </fieldset>

          <fieldset disabled={form.formState.isSubmitting} className="space-y-2">
            <Label htmlFor="sizeGuideId">Size Guide</Label>
            <select
              id="sizeGuideId"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              disabled={
                !selectedSystem ||
                loadingGuides ||
                form.formState.isSubmitting ||
                Boolean(guidesError)
              }
              {...form.register('sizeGuideId')}
            >
              <option value="">
                {selectedSystem ? 'Use category default / No guide' : 'Choose a size system first'}
              </option>
              {selectedGuideId && !selectedGuideIsEligible ? (
                <option disabled value={selectedGuideId}>
                  Current guide is unavailable for this sizing system — choose a replacement
                </option>
              ) : null}
              {matchingGuides.map((guide) => (
                <option key={guide.id} value={guide.id}>
                  {guide.name} (v{guide.version})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {guidesError
                ? guidesError
                : selectedSystem
                  ? matchingGuides.length > 0
                    ? 'Attach a published guide that matches the selected sizing domain.'
                    : 'No published guides exist for this sizing domain. Use the category default or create one in Sizing.'
                  : 'Choose a size system first; a guide cannot be saved on its own.'}
            </p>
            {form.formState.errors.sizeGuideId ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.sizeGuideId.message}
              </p>
            ) : null}
          </fieldset>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Merchandising Labels</h2>
          <p className="text-sm text-muted-foreground">
            Controlled discovery labels do not create sellable Variants.
          </p>
        </header>
        <div className="grid gap-5 p-5 lg:grid-cols-3">
          {(
            [
              ['Tags', 'tagIds', references.tags],
              ['Occasions', 'occasionIds', references.occasions],
              ['Collections', 'collectionIds', references.collections],
            ] as const
          ).map(([label, field, items]) => (
            <fieldset key={field} disabled={form.formState.isSubmitting}>
              <legend className="mb-2 text-sm font-medium">{label}</legend>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                {items.map((item) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    key={item.id}
                  >
                    <input
                      checked={form.watch(field).includes(item.id)}
                      type="checkbox"
                      onChange={() => toggleArrayField(field, item.id)}
                    />
                    <span className="truncate">{item.name}</span>
                  </label>
                ))}
                {items.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">None available.</p>
                ) : null}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <footer className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <span
          className="flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {form.formState.isDirty ? (
            'Unsaved organization changes'
          ) : (
            <>
              <CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" /> Organization
              is saved
            </>
          )}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
            onClick={() => {
              form.reset();
              setError('');
              onMessage('Organization changes discarded.');
            }}
          >
            <Undo2 aria-hidden="true" /> Discard
          </Button>
          <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
            <Save aria-hidden="true" />{' '}
            {form.formState.isSubmitting ? 'Saving…' : 'Save Organization'}
          </Button>
        </div>
      </footer>
    </form>
  );
}

// ============================================================================
// Section: Variants Form
// ============================================================================

interface OptionRecoveryDetails {
  affectedVariantCount: number;
  affectedVariants: readonly { id: string; sku: string; title: string | null }[];
  recoveryAction?: string;
}

function optionRecoveryDetails(error: unknown): OptionRecoveryDetails | undefined {
  if (
    !(error instanceof CatalogRequestError) ||
    (error.code !== 'OPTION_STRUCTURE_IN_USE' && error.code !== 'PUBLISHED_VARIANT_INTEGRITY') ||
    typeof error.details !== 'object' ||
    error.details === null
  )
    return undefined;
  const details = error.details as Record<string, unknown>;
  const variants = Array.isArray(details.affectedVariants)
    ? details.affectedVariants.filter(
        (variant): variant is { id: string; sku: string; title: string | null } =>
          typeof variant === 'object' &&
          variant !== null &&
          typeof (variant as Record<string, unknown>).id === 'string' &&
          typeof (variant as Record<string, unknown>).sku === 'string',
      )
    : [];
  return {
    affectedVariantCount:
      typeof details.affectedVariantCount === 'number'
        ? details.affectedVariantCount
        : variants.length,
    affectedVariants: variants,
    ...(typeof details.recoveryAction === 'string'
      ? { recoveryAction: details.recoveryAction }
      : {}),
  };
}

function ProductVariantsForm({
  workspace,
  references,
  onRefresh,
  onDirtyChange,
  onMessage,
}: ProductEditorSectionProps) {
  const [matrix, setMatrix] = useState<CatalogVariantMatrixDto>();
  const colors = references.colors;
  const [skuPrefix, setSkuPrefix] = useState(
    slug(workspace.title).replaceAll('-', '').toUpperCase().slice(0, 12),
  );
  const [busy, setBusy] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixPage, setMatrixPage] = useState(1);
  const [tableDirty, setTableDirty] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<OptionRecoveryDetails>();

  const isUnsavedProduct = workspace.id.length === 0;
  const activeAxes = workspace.options.filter((axis) => axis.status === 'ACTIVE');
  const missingRows = matrix?.rows.filter((row) => row.state === 'MISSING') ?? [];

  function showError(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    setRecovery(optionRecoveryDetails(caught));
  }

  async function loadSupporting(page: number, signal?: AbortSignal) {
    setMatrixLoading(true);
    try {
      const variantMatrix = await catalogData<CatalogVariantMatrixDto>(
        `/admin/catalog/products/${workspace.id}/variant-matrix?page=${page}&pageSize=50`,
        signal ? { signal } : undefined,
      );
      setMatrix(variantMatrix);
      if (variantMatrix.pagination.page !== page) setMatrixPage(variantMatrix.pagination.page);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError'))
        showError(caught, 'Variant matrix could not be loaded.');
    } finally {
      if (!signal?.aborted) setMatrixLoading(false);
    }
  }

  useEffect(() => {
    if (isUnsavedProduct) {
      setMatrix(undefined);
      return;
    }
    const controller = new AbortController();
    void loadSupporting(matrixPage, controller.signal);
    return () => controller.abort();
  }, [
    isUnsavedProduct,
    matrixPage,
    workspace.id,
    workspace.version,
    workspace.variants.length,
    workspace.options.length,
  ]);

  useEffect(() => onDirtyChange(false), [onDirtyChange]);

  async function refreshVariants(message: string, page = matrixPage) {
    await onRefresh(message || undefined);
    await loadSupporting(page);
  }

  function changeMatrixPage(page: number) {
    if (tableDirty && !window.confirm('Discard unsaved Variant changes on this page?')) return;
    setTableDirty(false);
    onDirtyChange(false);
    setMatrixPage(page);
  }

  if (isUnsavedProduct)
    return (
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Save the product first
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Variants belong to a saved product. Complete the required Overview details, save the
          draft, then return here to add options and generate SKUs.
        </p>
        <Button className="mt-4" render={<Link href="/products/new/edit?section=overview" />}>
          Go to Overview
        </Button>
      </section>
    );

  async function addAxis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    setError('');
    setRecovery(undefined);
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/option-axes`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          code: slug(String(data.get('code') || name)),
          position: activeAxes.length,
        }),
      });
      form.reset();
      setMatrixPage(1);
      await refreshVariants('Product option added. Add its customer-facing values next.', 1);
    } catch (caught) {
      showError(caught, 'Product option could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function addValue(event: FormEvent<HTMLFormElement>, axisId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayValue = String(data.get('displayValue') ?? '').trim();
    if (!displayValue) return;
    setBusy(true);
    setError('');
    setRecovery(undefined);
    const colorId = String(data.get('colorId') ?? '').trim();

    try {
      await catalogData(`/admin/catalog/option-axes/${axisId}/values`, {
        method: 'POST',
        body: JSON.stringify({
          displayValue,
          code: slug(displayValue),
          ...(colorId ? { colorId } : {}),
        }),
      });
      form.reset();
      setMatrixPage(1);
      await refreshVariants('Option value added.', 1);
    } catch (caught) {
      showError(caught, 'Option value could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveAxis(axisId: string, version: number, label: string) {
    if (
      !window.confirm(
        workspace.publicationStatus === 'PUBLISHED'
          ? `Archive the ${label} option? Published Products cannot archive an option used by active Variants. You may need to unpublish and reconfigure the Product first.`
          : `Archive the ${label} option? Existing Variants keep their history, and the Product cannot be published until active Variants are repaired.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setRecovery(undefined);
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/option-axes/${axisId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status: 'ARCHIVED' }),
      });
      setMatrixPage(1);
      await refreshVariants(`${label} archived.`, 1);
    } catch (caught) {
      showError(caught, 'Option could not be archived.');
    } finally {
      setBusy(false);
    }
  }

  async function changeValueStatus(
    axisId: string,
    valueId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    if (
      status === 'ARCHIVED' &&
      !window.confirm(
        workspace.publicationStatus === 'PUBLISHED'
          ? 'Archive this option value? The action will be blocked if any active Variant uses it.'
          : 'Archive this option value? Active Variants that use it must be repaired before publishing.',
      )
    )
      return;
    setBusy(true);
    setError('');
    setRecovery(undefined);
    try {
      await catalogData(`/admin/catalog/option-axes/${axisId}/values/${valueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status }),
      });
      setMatrixPage(1);
      await refreshVariants(`Option value ${status === 'ACTIVE' ? 'restored' : 'archived'}.`, 1);
    } catch (caught) {
      showError(caught, 'Option value could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function generateMissing() {
    if (!matrix || missingRows.length === 0 || busy) return;
    if (!skuPrefix.trim()) return setError('Enter an SKU prefix before generating Variants.');

    const pageOffset = (matrix.pagination.page - 1) * matrix.pagination.pageSize;
    const variants: CatalogVariantCreateDto[] = missingRows.map((row) => {
      const rowIndex = matrix.rows.findIndex(
        (candidate) => candidate.combinationKey === row.combinationKey,
      );
      const primaryColorId = row.values
        .map(
          (value) =>
            workspace.options
              .flatMap((axis) => axis.values)
              .find((candidate) => candidate.id === value.valueId)?.color?.id,
        )
        .find((colorId): colorId is string => Boolean(colorId));
      const ordinal = String(pageOffset + rowIndex + 1).padStart(6, '0');
      const descriptiveSku = [
        skuPrefix.trim().toUpperCase().slice(0, 24),
        ...row.values.map((value) => slug(value.valueLabel).toUpperCase().slice(0, 20)),
      ].join('-');

      return {
        sku: `${descriptiveSku.slice(0, 119 - ordinal.length)}-${ordinal}`,
        title: row.values.map((value) => value.valueLabel).join(' / '),
        optionValueIds: row.values.map((value) => value.valueId),
        ...(primaryColorId ? { primaryColorId } : {}),
      };
    });

    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/variants/bulk`, {
        method: 'POST',
        body: JSON.stringify({ variants }),
      });
      await refreshVariants(
        `${variants.length} Variant${variants.length === 1 ? '' : 's'} generated on page ${matrix.pagination.page}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Variants could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Options & Variants
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your product&apos;s axes (e.g. Size, Color) and the resulting variants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => void onRefresh()}
            title="Reload library colors"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Sync Colors
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/settings/colors" target="_blank" rel="noopener noreferrer" />}
          >
            <Palette className="mr-2 h-4 w-4" aria-hidden="true" />
            Color Library
            <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          <p className="font-medium">{error}</p>
          {recovery && (
            <div className="text-foreground">
              <p>
                {recovery.recoveryAction === 'UNPUBLISH_AND_RECONFIGURE'
                  ? 'Unpublish the Product, update its options and Variants, then publish again after readiness passes.'
                  : 'Archive or reconfigure the affected Variants below, then try again. If every active Variant must change, unpublish the Product first.'}
              </p>
              {recovery.affectedVariants.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Affected SKU{recovery.affectedVariantCount === 1 ? '' : 's'}:{' '}
                  {recovery.affectedVariants.map((variant) => variant.sku).join(', ')}
                  {recovery.affectedVariantCount > recovery.affectedVariants.length
                    ? ` and ${recovery.affectedVariantCount - recovery.affectedVariants.length} more`
                    : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Options Manager */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <Tags className="size-4" aria-hidden="true" /> Product Options
          </h3>
        </header>

        <div className="space-y-4">
          {activeAxes.map((axis) => (
            <div key={axis.id} className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold text-sm">{axis.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => archiveAxis(axis.id, axis.version, axis.name)}
                  disabled={busy}
                >
                  Archive Axis
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {axis.values.map((value) => (
                  <span
                    key={value.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs ${value.status === 'ARCHIVED' ? 'opacity-50' : ''}`}
                  >
                    {value.label}
                    <button
                      type="button"
                      disabled={busy}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        changeValueStatus(
                          axis.id,
                          value.id,
                          value.version,
                          value.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                        )
                      }
                      aria-label={`${value.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${value.label}`}
                      title={`${value.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${value.label}`}
                    >
                      {value.status === 'ACTIVE' ? '×' : '↺'}
                    </button>
                  </span>
                ))}
              </div>

              <form onSubmit={(e) => addValue(e, axis.id)} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`New ${axis.name} value`}
                  name="displayValue"
                  autoComplete="off"
                  placeholder={`New ${axis.name} value…`}
                  className="h-8 max-w-[200px]"
                  required
                />
                {(axis.code.toLowerCase().includes('color') ||
                  axis.name.toLowerCase().includes('color')) &&
                  colors.length > 0 && (
                    <select
                      name="colorId"
                      aria-label="Select from Color Library"
                      className="h-8 max-w-[220px] rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      defaultValue=""
                      onChange={(e) => {
                        const selected = colors.find((c) => c.id === e.target.value);
                        if (selected) {
                          const input = e.currentTarget.form?.elements.namedItem(
                            'displayValue',
                          ) as HTMLInputElement | null;
                          if (input) {
                            input.value = selected.name;
                          }
                        }
                      }}
                    >
                      <option value="">Choose Library Color (optional)…</option>
                      {colors
                        .filter((c) => c.status === 'ACTIVE')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.hexValue ? `(${c.hexValue})` : ''}
                          </option>
                        ))}
                    </select>
                  )}
                <Button type="submit" size="sm" variant="secondary" className="h-8" disabled={busy}>
                  Add Value
                </Button>
              </form>
            </div>
          ))}

          {activeAxes.length < 3 && (
            <form
              onSubmit={addAxis}
              className="flex items-center gap-2 rounded-lg border border-dashed p-4"
            >
              <Input
                aria-label="New option axis name"
                name="name"
                autoComplete="off"
                placeholder="E.g. Size, Color, Material…"
                className="h-8 max-w-[200px]"
                required
              />
              <Button type="submit" size="sm" variant="secondary" className="h-8" disabled={busy}>
                <Plus className="size-3 mr-1" /> Add Option Axis
              </Button>
            </form>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Boxes className="size-4" aria-hidden="true" /> Variant Matrix
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Review, generate, and edit one bounded page of combinations at a time.
            </p>
          </div>
          {matrix ? (
            <p className="text-sm tabular-nums text-muted-foreground">
              Page {matrix.pagination.page} of {Math.max(1, matrix.pagination.totalPages)}
            </p>
          ) : null}
        </header>

        {matrix ? (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ['Potential', matrix.summary.potentialCombinations],
                ['Active', matrix.summary.activeVariants],
                ['Archived', matrix.summary.archivedVariants],
                ['Missing', matrix.summary.missingCombinations],
                ['Needs Repair', matrix.summary.incompleteVariants],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-muted/20 p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            {matrix.incompleteVariants.length > 0 ? (
              <div
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                role="status"
              >
                <p className="font-medium">
                  {matrix.summary.incompleteVariants} Variant
                  {matrix.summary.incompleteVariants === 1 ? '' : 's'} need option repair
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Repair the SKU option selections before publishing. Shown here:{' '}
                  {matrix.incompleteVariants
                    .map(
                      (variant) =>
                        `${variant.sku} (${variant.reasons.join(', ').toLowerCase().replaceAll('_', ' ')})`,
                    )
                    .join('; ')}
                  {matrix.summary.incompleteVariants > matrix.incompleteVariants.length
                    ? ` and ${matrix.summary.incompleteVariants - matrix.incompleteVariants.length} more`
                    : ''}
                  .
                </p>
              </div>
            ) : null}

            {missingRows.length > 0 ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h4 className="font-medium text-foreground">
                  Generate {missingRows.length} missing combination
                  {missingRows.length === 1 ? '' : 's'} on this page
                </h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  {matrix.summary.missingCombinations} remain across the full matrix. Existing and
                  archived combinations are never recreated.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="grid gap-1 text-xs font-medium text-foreground">
                    SKU Prefix
                    <Input
                      name="skuPrefix"
                      autoComplete="off"
                      value={skuPrefix}
                      maxLength={24}
                      onChange={(event) => setSkuPrefix(event.target.value)}
                      placeholder="DRESS"
                      className="h-11 bg-background text-foreground sm:h-9 sm:w-44"
                      spellCheck={false}
                    />
                  </label>
                  <Button
                    type="button"
                    onClick={generateMissing}
                    disabled={busy}
                    className="h-11 sm:h-9"
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {busy ? 'Generating…' : `Generate This Page (${missingRows.length})`}
                  </Button>
                </div>
              </div>
            ) : null}

            <ProductVariantsTable
              matrix={matrix}
              onSaved={refreshVariants}
              onDirtyChange={(dirty) => {
                setTableDirty(dirty);
                onDirtyChange(dirty);
              }}
              onMessage={onMessage}
            />

            {matrix.pagination.totalPages > 1 ? (
              <nav
                className="flex items-center justify-between border-t pt-4"
                aria-label="Variant matrix pages"
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={matrixLoading || matrix.pagination.page <= 1}
                  onClick={() => changeMatrixPage(matrix.pagination.page - 1)}
                >
                  <ChevronLeft aria-hidden="true" /> Previous
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Combinations {(matrix.pagination.page - 1) * matrix.pagination.pageSize + 1}–
                  {Math.min(
                    matrix.pagination.page * matrix.pagination.pageSize,
                    matrix.pagination.totalItems,
                  )}{' '}
                  of {matrix.pagination.totalItems}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={matrixLoading || matrix.pagination.page >= matrix.pagination.totalPages}
                  onClick={() => changeMatrixPage(matrix.pagination.page + 1)}
                >
                  Next <ChevronRight aria-hidden="true" />
                </Button>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground" aria-live="polite">
            {matrixLoading
              ? 'Loading Variant matrix…'
              : 'Add an active value to every option to build the Variant matrix.'}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// Section: Media Form
// ============================================================================

type MediaAsset = { id: string };
type MediaScope =
  | { type: 'PRODUCT' }
  | { type: 'OPTION'; optionValueId: string }
  | { type: 'VARIANT'; variantId: string };

function variantLabel(
  workspace: CatalogProductWorkspaceDto,
  variant: CatalogProductWorkspaceDto['variants'][number],
): string {
  const valueLabels = workspace.options
    .flatMap((axis) => axis.values)
    .filter((value) => variant.optionValueIds.includes(value.id))
    .map((value) => value.label);
  return (variant.title || valueLabels.join(' / ') || 'Default Variant') + ' — ' + variant.sku;
}

function ProductMediaForm({ workspace, onRefresh, onMessage }: ProductEditorSectionProps) {
  const [uploadingScope, setUploadingScope] = useState<string | null>(null);
  const [variantQuery, setVariantQuery] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState(
    workspace.variants.find((variant) => variant.status === 'ACTIVE')?.id ??
      workspace.variants[0]?.id ??
      '',
  );
  const colorOptions = workspace.options
    .filter((axis) => ['color', 'colour'].includes(axis.name.toLowerCase()))
    .flatMap((axis) => axis.values);
  const selectedVariant = workspace.variants.find((variant) => variant.id === selectedVariantId);
  const matchingVariants = useMemo(() => {
    const query = variantQuery.trim().toLowerCase();
    return workspace.variants
      .filter((variant) => !query || variantLabel(workspace, variant).toLowerCase().includes(query))
      .slice(0, 20);
  }, [variantQuery, workspace]);

  useEffect(() => {
    if (selectedVariantId && workspace.variants.some((variant) => variant.id === selectedVariantId))
      return;
    setSelectedVariantId(
      workspace.variants.find((variant) => variant.status === 'ACTIVE')?.id ??
        workspace.variants[0]?.id ??
        '',
    );
  }, [selectedVariantId, workspace.variants]);

  function scopeKey(scope: MediaScope): string {
    if (scope.type === 'PRODUCT') return 'product';
    return (
      scope.type.toLowerCase() +
      ':' +
      (scope.type === 'OPTION' ? scope.optionValueId : scope.variantId)
    );
  }

  function mediaForScope(scope: MediaScope): CatalogProductMediaDto[] {
    return workspace.media
      .filter((item) =>
        scope.type === 'PRODUCT'
          ? !item.variantId && !item.optionValueId
          : scope.type === 'OPTION'
            ? item.optionValueId === scope.optionValueId
            : item.variantId === scope.variantId,
      )
      .toSorted(
        (left, right) =>
          Number(right.isPrimary) - Number(left.isPrimary) || left.position - right.position,
      );
  }

  async function handleUpload(files: FileList, scope: MediaScope) {
    const accepted = Array.from(files).filter((file) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
    );
    if (accepted.length === 0) {
      onMessage('Choose JPEG, PNG, or WebP images.');
      return;
    }
    const key = scopeKey(scope);
    const existing = mediaForScope(scope);
    setUploadingScope(key);
    try {
      for (const [index, file] of accepted.entries()) {
        const response = await catalogRequest<ApiEnvelope<MediaAsset>>('/admin/media/images', {
          method: 'POST',
          headers: { 'x-media-visibility': 'public' },
          body: file,
        });
        await catalogData('/admin/media/' + response.data.id, {
          method: 'PATCH',
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText:
              workspace.title +
              (scope.type === 'VARIANT' && selectedVariant
                ? ' — ' + variantLabel(workspace, selectedVariant)
                : ''),
            visibility: 'PUBLIC',
          }),
        });
        await catalogData('/admin/catalog/products/' + workspace.id + '/media', {
          method: 'POST',
          body: JSON.stringify({
            assetId: response.data.id,
            role: scope.type === 'OPTION' ? 'COLOR_GALLERY' : 'GALLERY',
            position: existing.length + index,
            isPrimary: existing.length === 0 && index === 0,
            ...(scope.type === 'OPTION' ? { optionValueId: scope.optionValueId } : {}),
            ...(scope.type === 'VARIANT' ? { variantId: scope.variantId } : {}),
          }),
        });
      }
      await onRefresh(
        accepted.length + ' image' + (accepted.length === 1 ? '' : 's') + ' attached.',
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Images could not be uploaded.');
    } finally {
      setUploadingScope(null);
    }
  }

  async function handleRemove(mediaId: string) {
    if (
      !window.confirm(
        'Remove this image placement? The media asset remains available in the Media library.',
      )
    )
      return;
    try {
      await catalogData('/admin/catalog/products/' + workspace.id + '/media/' + mediaId, {
        method: 'DELETE',
      });
      await onRefresh('Image removed from this gallery.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not remove image.');
    }
  }

  async function handleMakePrimary(item: CatalogProductMediaDto) {
    try {
      await catalogData('/admin/catalog/products/' + workspace.id + '/media', {
        method: 'POST',
        body: JSON.stringify({
          assetId: item.assetId,
          role: item.role,
          position: item.position,
          isPrimary: true,
          ...(item.variantId ? { variantId: item.variantId } : {}),
          ...(item.optionValueId ? { optionValueId: item.optionValueId } : {}),
        }),
      });
      await onRefresh('Primary image updated.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not update primary image.');
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> Product
          Galleries
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign shared Product images, colour imagery, or precise Variant imagery without changing
          the original Media asset.
        </p>
      </header>

      <GallerySection
        title="Main Product Gallery"
        description="Fallback images shown until a more specific option or Variant gallery applies."
        media={mediaForScope({ type: 'PRODUCT' })}
        onUpload={(files) => handleUpload(files, { type: 'PRODUCT' })}
        onRemove={handleRemove}
        onMakePrimary={handleMakePrimary}
        isUploading={uploadingScope === 'product'}
      />

      {colorOptions.map((option) => (
        <GallerySection
          key={option.id}
          title={option.label + ' Colour Gallery'}
          description={'Shared by Variants that use the ' + option.label + ' colour option.'}
          media={mediaForScope({ type: 'OPTION', optionValueId: option.id })}
          onUpload={(files) => handleUpload(files, { type: 'OPTION', optionValueId: option.id })}
          onRemove={handleRemove}
          onMakePrimary={handleMakePrimary}
          isUploading={uploadingScope === 'option:' + option.id}
        />
      ))}

      <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
        <div>
          <h3 className="font-semibold">Variant Gallery</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Search by SKU, title, or option value. Variant imagery is the most specific gallery and
            does not replace shared Product or colour images.
          </p>
        </div>
        {workspace.variants.length > 0 ? (
          <>
            <label className="grid gap-1 text-sm font-medium">
              Find a Variant
              <span className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  name="variantSearch"
                  autoComplete="off"
                  value={variantQuery}
                  onChange={(event) => setVariantQuery(event.target.value)}
                  placeholder="Search SKU or options…"
                  className="h-11 pl-9"
                  spellCheck={false}
                />
              </span>
            </label>
            <div className="max-h-56 overflow-y-auto rounded-lg border p-1">
              {matchingVariants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={variant.id === selectedVariantId}
                  className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-primary/10 aria-pressed:text-primary"
                  onClick={() => setSelectedVariantId(variant.id)}
                >
                  <span className="min-w-0 truncate">{variantLabel(workspace, variant)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {variant.status === 'ACTIVE' ? 'Active' : 'Archived'} · {variant.media.length}{' '}
                    image{variant.media.length === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
              {matchingVariants.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No Variants match that search.
                </p>
              ) : null}
              {matchingVariants.length === 20 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Showing the first 20 matches. Refine the search to find another Variant.
                </p>
              ) : null}
            </div>
            {selectedVariant ? (
              <GallerySection
                title={variantLabel(workspace, selectedVariant)}
                description="Images assigned only to this exact SKU combination."
                media={mediaForScope({ type: 'VARIANT', variantId: selectedVariant.id })}
                onUpload={(files) =>
                  handleUpload(files, { type: 'VARIANT', variantId: selectedVariant.id })
                }
                onRemove={handleRemove}
                onMakePrimary={handleMakePrimary}
                isUploading={uploadingScope === 'variant:' + selectedVariant.id}
              />
            ) : null}
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Create a Variant before assigning SKU-specific images.
          </p>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// Section: Content Form
// ============================================================================

function ProductContentForm({
  workspace,
  onRefresh,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const source = useMemo(() => catalogContentFromWorkspace(workspace), [workspace]);
  const [baseline, setBaseline] = useState<CatalogContentValues>(source);
  const [draft, setDraft] = useState<CatalogContentValues>(source);
  const [current, setCurrent] = useState<CatalogContentValues>(source);
  const [conflicts, setConflicts] = useState<readonly CatalogContentConflict[]>([]);
  const [transientDirty, setTransientDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = isCatalogContentDirty(baseline, draft);

  useEffect(() => {
    if (dirty || transientDirty) return;
    setBaseline(source);
    setDraft(source);
    setCurrent(source);
    setConflicts([]);
  }, [dirty, source, transientDirty]);
  useEffect(() => onDirtyChange(dirty || transientDirty), [dirty, onDirtyChange, transientDirty]);

  async function save() {
    if (!dirty || busy || conflicts.length > 0) return;
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/content`, {
        method: 'PUT',
        headers: { 'if-match': `"${workspace.version}"` },
        body: JSON.stringify(catalogContentPayload(draft)),
      });
      setBaseline(draft);
      await onRefresh('Customer information, FAQs, and search content saved.');
    } catch (caught) {
      if (caught instanceof CatalogRequestError && caught.status === 409) {
        try {
          const latest = await catalogData<CatalogProductWorkspaceDto>(
            `/admin/catalog/products/${workspace.id}`,
          );
          const latestContent = catalogContentFromWorkspace(latest);
          const merged = mergeCatalogContent(baseline, draft, latestContent);
          setDraft(merged.draft);
          setCurrent(latestContent);
          setConflicts(merged.conflicts);
          setError(
            merged.conflicts.length > 0
              ? 'Another operator changed the same content. Choose which version to keep.'
              : 'New server changes were merged with your draft. Review and save again.',
          );
        } catch {
          setError(
            'This Product changed elsewhere. Your draft is preserved; reload before saving.',
          );
        }
      } else
        setError(caught instanceof Error ? caught.message : 'Product content could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function resolve(choice: 'LOCAL' | 'CURRENT') {
    if (choice === 'CURRENT')
      setDraft(useCurrentCatalogContentConflicts(draft, current, conflicts));
    setConflicts([]);
    setError('');
  }

  return (
    <CatalogContentEditor
      busy={busy}
      conflicts={conflicts}
      dirty={dirty}
      draft={draft}
      error={error}
      handle={workspace.handle}
      productDescription={workspace.description ?? ''}
      productTitle={workspace.title}
      onChange={setDraft}
      onDiscard={() => {
        setDraft(baseline);
        setConflicts([]);
        setError('');
      }}
      onResolveConflicts={resolve}
      onSave={() => void save()}
      onTransientDirtyChange={setTransientDirty}
    />
  );
}

// ============================================================================
// Section: Review & Publishing
// ============================================================================

function ProductReview({ workspace, onRefresh, onDirtyChange }: ProductEditorSectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => onDirtyChange(false), [onDirtyChange]);

  async function publish() {
    if (!workspace.readiness.canPublish || busy) return;
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ version: workspace.version }),
      });
      await onRefresh('Product published. It is now eligible for Storefront discovery.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product could not be published.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ProductReadiness productId={workspace.id} readiness={workspace.readiness} />
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Final Decision
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {workspace.publicationStatus === 'PUBLISHED'
                ? 'This Product is Published'
                : workspace.readiness.canPublish
                  ? 'Ready to Publish'
                  : 'Keep as a Draft'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {workspace.publicationStatus === 'PUBLISHED'
                ? 'Changes to pricing, inventory, galleries, and product content continue to update the active Product under their normal visibility rules.'
                : workspace.readiness.canPublish
                  ? 'All required commerce data is present. Publishing makes this Product eligible for customer search, category listings, and its Storefront URL.'
                  : 'Drafts are safe to leave incomplete. Resolve each publishing blocker above; warnings are recommendations and do not prevent publishing.'}
            </p>
          </div>
          <div className="grid gap-2">
            {workspace.publicationStatus !== 'PUBLISHED' ? (
              <Button
                className="w-full"
                disabled={busy || !workspace.readiness.canPublish}
                onClick={() => void publish()}
              >
                <CheckCircle2 aria-hidden="true" /> {busy ? 'Publishing…' : 'Publish Product'}
              </Button>
            ) : null}
            <Button
              className="w-full"
              variant="outline"
              render={<Link href={`/products/${workspace.id}`} />}
            >
              <FileCheck2 aria-hidden="true" /> View Full Product Details
            </Button>
            {workspace.publicationStatus === 'PUBLISHED' ? (
              <Button
                className="w-full"
                variant="outline"
                render={
                  <a
                    aria-label={`Open ${workspace.title} in the Storefront`}
                    href={storefrontProductHref(workspace.handle)}
                    rel="noopener noreferrer"
                    target="_blank"
                  />
                }
              >
                <ExternalLink aria-hidden="true" /> Open Storefront Product
              </Button>
            ) : (
              <p className="px-1 text-center text-xs text-muted-foreground">
                The customer view becomes available after publishing.
              </p>
            )}
            <Button className="w-full" variant="ghost" render={<Link href="/products" />}>
              <ArrowLeft aria-hidden="true" /> Finish and Return to Products
            </Button>
          </div>
        </div>
      </section>
      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ============================================================================
// Main Component: ProductEditor
// ============================================================================

const editorSections = [
  { id: 'overview', label: 'Overview', help: 'Identity and description', icon: PackageOpen },
  {
    id: 'organization',
    label: 'Organization',
    help: 'Categories, attributes, and sizing',
    icon: Layers3,
  },
  { id: 'variants', label: 'Variants', help: 'Options, SKUs, price, stock', icon: Settings2 },
  { id: 'media', label: 'Media', help: 'Product and color galleries', icon: ImageIcon },
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

  const isNew = productId === 'new';

  const emptyWorkspace = useMemo<CatalogProductWorkspaceDto>(
    () => ({
      id: '',
      version: 1,
      title: '',
      handle: '',
      productTypeId: '',
      description: null,
      status: 'DRAFT',
      publicationStatus: 'UNPUBLISHED',
      readiness: {
        state: 'BLOCKED',
        canPublish: false,
        blockerCount: 1,
        warningCount: 0,
        checks: [
          {
            code: 'IDENTITY',
            label: 'Product identity',
            state: 'BLOCKER',
            message: 'Save the product overview before completing publishing checks.',
          },
        ],
      },
      options: [],
      variants: [],
      sizeSystemId: null,
      sizeGuideId: null,
      organization: {
        categoryIds: [],
        primaryCategoryId: null,
        tagIds: [],
        occasionIds: [],
        collectionIds: [],
        attributes: [],
      },
      content: {
        informationGroups: [],
        faqs: [],
        seoTitle: null,
        seoDescription: null,
      },
      operationalSignals: {
        defaultCurrency: 'BDT',
        activeVariantCount: 0,
        pricedVariantCount: 0,
        publicMediaCount: 0,
        availableVariantCount: 0,
        categoryCount: 0,
      },
      media: [],
    }),
    [],
  );

  const loadWorkspace = useCallback(
    async (successMessage?: string) => {
      try {
        const next = isNew
          ? emptyWorkspace
          : await catalogData<CatalogProductWorkspaceDto>(`/admin/catalog/products/${productId}`);
        setWorkspace(next);
        setDirty(false);
        setError('');
        if (successMessage) setMessage(successMessage);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Product could not be loaded.');
      }
    },
    [productId, isNew, emptyWorkspace],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      isNew
        ? Promise.resolve(emptyWorkspace)
        : catalogData<CatalogProductWorkspaceDto>(`/admin/catalog/products/${productId}`, {
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
        if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
        if (!(caught instanceof DOMException && caught.name === 'AbortError'))
          setError(
            caught instanceof Error ? caught.message : 'Product editor could not be loaded.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [productId, emptyWorkspace, isNew]);

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
  const requiresSavedProduct = isNew && section !== 'overview';
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
      <Breadcrumb
        className="mb-4"
        items={[
          { label: 'Products', href: '/products' },
          ...(isNew
            ? [{ label: workspace.title || 'New Product' }]
            : [{ label: workspace.title, href: `/products/${workspace.id}` }]),
          { label: isNew ? 'Create' : 'Edit', current: true },
        ]}
        maxLabelWidth="18rem"
      />
      <header className="mb-5 flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {workspace.title || 'Create a Publish-Ready Product'}
            </h1>
            {!isNew && <StatusBadge status={workspace.status} />}
            {!isNew && <StatusBadge status={workspace.publicationStatus} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {guidedSetup ? 'Guided Product setup' : 'Product editor'} · {workspace.productTypeName}{' '}
            · <span className="font-mono">/{workspace.handle}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <Button variant="outline" render={<Link href={`/products/${workspace.id}`} />}>
              <ArrowLeft aria-hidden="true" /> Product Details
            </Button>
          )}
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
          {requiresSavedProduct ? (
            <section className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight">Save the product first</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Complete the required Overview details and save the draft before managing its
                organization, variants, media, customer content, or publishing readiness.
              </p>
              <Button
                className="mt-4"
                render={
                  <Link
                    href={`/products/new/edit?section=overview${guidedSetup ? '&setup=1' : ''}`}
                  />
                }
              >
                Go to Overview
              </Button>
            </section>
          ) : null}
          {!requiresSavedProduct && section === 'overview' ? (
            <ProductOverviewForm {...sectionProps} />
          ) : null}
          {!requiresSavedProduct && section === 'organization' ? (
            <ProductOrganizationForm {...sectionProps} />
          ) : null}
          {!requiresSavedProduct && section === 'variants' ? (
            <ProductVariantsForm {...sectionProps} />
          ) : null}
          {!requiresSavedProduct && section === 'media' ? (
            <ProductMediaForm {...sectionProps} />
          ) : null}
          {!requiresSavedProduct && section === 'content' ? (
            <ProductContentForm {...sectionProps} />
          ) : null}
          {!requiresSavedProduct && section === 'review' ? (
            <ProductReview {...sectionProps} />
          ) : null}

          {guidedSetup ? (
            <footer className="mt-5 flex flex-col-reverse gap-2 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                disabled={!previous || (productId === 'new' && previous?.id !== 'overview')}
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
