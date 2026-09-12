'use client';

import { ImageIcon, Loader2, Search, Star, Trash2, UploadCloud } from 'lucide-react';
import Image from 'next/image';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ApiEnvelope,
  CatalogProductMediaDto,
  CatalogProductWorkspaceDto,
} from '@maevelle/contracts';
import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Input } from '@/components/ui/input';
import { catalogData, catalogRequest, productMediaUrl } from '@/lib/catalog/api';

type MediaAsset = { id: string };
type MediaScope =
  | { type: 'PRODUCT' }
  | { type: 'OPTION'; optionValueId: string }
  | { type: 'VARIANT'; variantId: string };

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

export function ProductMediaForm({ workspace, onRefresh, onMessage }: ProductEditorSectionProps) {
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
