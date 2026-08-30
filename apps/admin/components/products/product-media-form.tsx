'use client';

import {
  Check,
  ImagePlus,
  Images,
  Library,
  Link2,
  LoaderCircle,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import Image from 'next/image';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { ApiEnvelope, CatalogProductMediaDto } from '@maevelle/contracts';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData, catalogRequest, productMediaUrl } from '@/lib/catalog/api';

type MediaAsset = {
  readonly id: string;
  readonly title: string | null;
  readonly altText: string | null;
  readonly mimeType: string;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly status: 'READY' | 'ARCHIVED';
  readonly widthPx: number | null;
  readonly heightPx: number | null;
};

type MediaRole = CatalogProductMediaDto['role'];

function scopeLabel(
  workspace: ProductEditorSectionProps['workspace'],
  media: CatalogProductMediaDto,
): string {
  if (media.variantId)
    return `Variant · ${workspace.variants.find((variant) => variant.id === media.variantId)?.sku ?? 'Unavailable'}`;
  if (media.optionValueId) {
    const value = workspace.options
      .flatMap((axis) => axis.values)
      .find((item) => item.id === media.optionValueId);
    return `Option · ${value?.label ?? 'Unavailable'}`;
  }
  return 'Whole Product';
}

export function ProductMediaForm({
  workspace,
  onRefresh,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<readonly MediaAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<readonly string[]>([]);
  const [scope, setScope] = useState('product');
  const [role, setRole] = useState<MediaRole>('GALLERY');
  const [makePrimary, setMakePrimary] = useState(false);
  const [publicVisibility, setPublicVisibility] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const attachedIds = useMemo(
    () => new Set(workspace.media.map((media) => media.assetId)),
    [workspace.media],
  );

  async function loadLibrary(signal?: AbortSignal) {
    try {
      setAssets(
        await catalogData<readonly MediaAsset[]>('/admin/media', signal ? { signal } : undefined),
      );
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError'))
        setError(caught instanceof Error ? caught.message : 'Media library could not be loaded.');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadLibrary(controller.signal);
    onDirtyChange(false);
    return () => controller.abort();
  }, [onDirtyChange, workspace.id]);

  function scopePayload(selectedScope = scope) {
    if (selectedScope.startsWith('variant:')) return { variantId: selectedScope.slice(8) };
    if (selectedScope.startsWith('option:')) return { optionValueId: selectedScope.slice(7) };
    return {};
  }

  async function attach(assetIds = selectedAssetIds) {
    if (assetIds.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      for (const [position, assetId] of assetIds.entries()) {
        setProgress(`Attaching image ${position + 1} of ${assetIds.length}…`);
        await catalogData(`/admin/catalog/products/${workspace.id}/media`, {
          method: 'POST',
          body: JSON.stringify({
            assetId,
            role: scope.startsWith('option:') && role === 'GALLERY' ? 'COLOR_GALLERY' : role,
            position: workspace.media.length + position,
            isPrimary: makePrimary && position === 0,
            ...scopePayload(),
          }),
        });
      }
      setSelectedAssetIds([]);
      setMakePrimary(false);
      await Promise.all([
        onRefresh(`${assetIds.length} image${assetIds.length === 1 ? '' : 's'} attached.`),
        loadLibrary(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message} Completed attachments remain saved.`
          : 'Images could not be attached.',
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function upload(files: readonly File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError('');
    const uploaded: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
          throw new Error(`${file.name} is not a JPEG, PNG, or WebP image.`);
        setProgress(`Uploading image ${index + 1} of ${files.length}…`);
        const response = await catalogRequest<ApiEnvelope<MediaAsset>>('/admin/media/images', {
          method: 'POST',
          headers: { 'x-media-visibility': publicVisibility ? 'public' : 'private' },
          body: file,
        });
        uploaded.push(response.data.id);
        await catalogData(`/admin/media/${response.data.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText: workspace.title,
            visibility: publicVisibility ? 'PUBLIC' : 'PRIVATE',
          }),
        });
      }
      setSelectedAssetIds(uploaded);
      setProgress('Attaching uploaded images…');
      setBusy(false);
      await attach(uploaded);
      if (inputRef.current) inputRef.current.value = '';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Images could not be uploaded.');
      setBusy(false);
      setProgress('');
      await loadLibrary();
    }
  }

  async function detach(media: CatalogProductMediaDto) {
    if (
      !window.confirm(
        `Remove this image from ${scopeLabel(workspace, media)}? The asset remains in the media library.`,
      )
    )
      return;
    setBusy(true);
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/media/${media.id}`, {
        method: 'DELETE',
      });
      await onRefresh('Image removed from this Product.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Image could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(media: CatalogProductMediaDto) {
    setBusy(true);
    try {
      const mediaScope = media.variantId
        ? `variant:${media.variantId}`
        : media.optionValueId
          ? `option:${media.optionValueId}`
          : 'product';
      await catalogData(`/admin/catalog/products/${workspace.id}/media`, {
        method: 'POST',
        body: JSON.stringify({
          assetId: media.assetId,
          role: media.role,
          position: media.position,
          isPrimary: true,
          ...scopePayload(mediaScope),
        }),
      });
      await onRefresh('Primary image updated for this gallery.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Primary image could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>, media: CatalogProductMediaDto) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await catalogData(`/admin/media/${media.assetId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: String(data.get('title') ?? '').trim() || null,
          altText: String(data.get('altText') ?? '').trim() || null,
          visibility: data.get('visibility'),
        }),
      });
      await onRefresh('Image title, alt text, and visibility saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Image metadata could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Upload className="size-4" aria-hidden="true" /> Upload Product Images
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Upload several images at once. They are attached in order, and the first can become
              the primary image for its selected gallery.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={publicVisibility}
              type="checkbox"
              onChange={(event) => setPublicVisibility(event.target.checked)}
            />{' '}
            Public and publish-ready
          </label>
        </div>
        <div className="mt-4 rounded-xl border border-dashed p-6 text-center">
          <ImagePlus className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">JPEG, PNG, or WebP</p>
          <p className="text-xs text-muted-foreground">
            Select one or many files. Add useful alt text after upload.
          </p>
          <input
            ref={inputRef}
            className="sr-only"
            id="product-image-files"
            accept="image/jpeg,image/png,image/webp"
            multiple
            type="file"
            onChange={(event) => void upload(Array.from(event.target.files ?? []))}
          />
          <Button className="mt-3" disabled={busy} render={<label htmlFor="product-image-files" />}>
            <Upload aria-hidden="true" /> Choose Images
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Library className="size-4" aria-hidden="true" /> Attach from Media Library
          </h2>
          <p className="text-sm text-muted-foreground">
            Reuse an existing asset and scope it to the Product, a shared option value such as Red,
            or one exact Variant.
          </p>
        </header>
        <div className="grid gap-4 border-b p-5 md:grid-cols-4">
          <div>
            <Label htmlFor="media-scope">Gallery Scope</Label>
            <select
              className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              id="media-scope"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                if (event.target.value.startsWith('option:')) setRole('COLOR_GALLERY');
              }}
            >
              <option value="product">Whole Product</option>
              <optgroup label="Shared option gallery">
                {workspace.options
                  .filter((axis) => axis.status === 'ACTIVE')
                  .flatMap((axis) =>
                    axis.values
                      .filter((value) => value.status === 'ACTIVE')
                      .map((value) => (
                        <option key={value.id} value={`option:${value.id}`}>
                          {axis.name} · {value.label}
                        </option>
                      )),
                  )}
              </optgroup>
              <optgroup label="Exact variant gallery">
                {workspace.variants
                  .filter((variant) => variant.status === 'ACTIVE')
                  .map((variant) => (
                    <option key={variant.id} value={`variant:${variant.id}`}>
                      {variant.title ?? variant.sku} · {variant.sku}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
          <div>
            <Label htmlFor="media-role">Image Role</Label>
            <select
              className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              id="media-role"
              value={role}
              onChange={(event) => setRole(event.target.value as MediaRole)}
            >
              <option value="GALLERY">Gallery</option>
              <option value="THUMBNAIL">Thumbnail</option>
              <option value="COLOR_GALLERY">Color Gallery</option>
              <option value="SIZE_DIAGRAM">Size Diagram</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              checked={makePrimary}
              type="checkbox"
              onChange={(event) => setMakePrimary(event.target.checked)}
            />{' '}
            Make first selected primary
          </label>
          <Button
            className="self-end"
            disabled={busy || selectedAssetIds.length === 0}
            onClick={() => void attach()}
          >
            <Link2 aria-hidden="true" /> Attach {selectedAssetIds.length || ''}
          </Button>
        </div>
        <div className="grid max-h-[31rem] grid-cols-2 gap-2 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-5">
          {assets
            .filter((asset) => asset.status === 'READY')
            .map((asset) => {
              const selected = selectedAssetIds.includes(asset.id);
              return (
                <button
                  aria-pressed={selected}
                  className={`group relative overflow-hidden rounded-lg border text-left focus-visible:ring-3 focus-visible:ring-ring/30 ${selected ? 'border-primary ring-2 ring-primary/25' : ''}`}
                  key={asset.id}
                  type="button"
                  onClick={() =>
                    setSelectedAssetIds((current) =>
                      current.includes(asset.id)
                        ? current.filter((id) => id !== asset.id)
                        : [...current, asset.id],
                    )
                  }
                >
                  <div className="relative aspect-square bg-muted">
                    <Image
                      alt={asset.altText ?? ''}
                      className="object-cover"
                      fill
                      sizes="(max-width: 640px) 50vw, 15vw"
                      src={productMediaUrl(asset.id, asset.visibility)}
                      unoptimized
                    />
                    {selected ? (
                      <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">
                      {asset.title ?? 'Untitled image'}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {attachedIds.has(asset.id) ? 'Already used · ' : ''}
                      {asset.visibility}
                    </p>
                  </div>
                </button>
              );
            })}
          {assets.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              The media library is empty.
            </p>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Images className="size-4" aria-hidden="true" /> Attached Galleries
          </h2>
          <p className="text-sm text-muted-foreground">
            Customers see Product images first, then matching option and exact Variant images.
            Primary images lead each scope.
          </p>
        </header>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {[...workspace.media]
            .sort(
              (left, right) =>
                Number(right.isPrimary) - Number(left.isPrimary) || left.position - right.position,
            )
            .map((media) => (
              <article
                className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
                key={media.id}
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <Image
                    alt={media.altText ?? ''}
                    className="object-cover"
                    fill
                    sizes="144px"
                    src={productMediaUrl(media.assetId, media.visibility)}
                    unoptimized
                  />
                  {media.isPrimary ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-1 text-[10px] font-semibold text-background">
                      <Star className="size-3 fill-current" aria-hidden="true" /> PRIMARY
                    </span>
                  ) : null}
                </div>
                <form
                  className="min-w-0 space-y-3"
                  onSubmit={(event) => void saveMetadata(event, media)}
                >
                  <div>
                    <p className="truncate text-sm font-semibold">{scopeLabel(workspace, media)}</p>
                    <p className="text-xs text-muted-foreground">
                      {media.role.replaceAll('_', ' ')} · Position {media.position + 1}
                    </p>
                  </div>
                  <Input
                    aria-label="Image title"
                    autoComplete="off"
                    defaultValue={media.title ?? ''}
                    name="title"
                    placeholder="Image title"
                  />
                  <Input
                    aria-label="Alternative text"
                    autoComplete="off"
                    defaultValue={media.altText ?? ''}
                    name="altText"
                    placeholder="Describe what the image shows"
                  />
                  <select
                    aria-label="Image visibility"
                    className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                    defaultValue={media.visibility}
                    name="visibility"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" type="submit" disabled={busy}>
                      Save Metadata
                    </Button>
                    {!media.isPrimary ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void setPrimary(media)}
                      >
                        <Star aria-hidden="true" /> Make Primary
                      </Button>
                    ) : null}
                    <Button
                      aria-label="Detach image"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void detach(media)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </form>
              </article>
            ))}
          {workspace.media.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground lg:col-span-2">
              <Images className="mx-auto mb-2 size-8 opacity-40" aria-hidden="true" />
              No images are attached to this Product yet.
            </div>
          ) : null}
        </div>
      </section>

      {progress ? (
        <p
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> {progress}
        </p>
      ) : null}
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
