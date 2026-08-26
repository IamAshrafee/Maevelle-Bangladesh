'use client';

import {
  FileImage,
  ImagePlus,
  Link2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from '../../components/operational-worklist';
import { StatusBadge } from '../../components/status-badge';

type MediaUsage = {
  readonly id: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId: string | null;
  readonly variantSku: string | null;
  readonly role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly position: number;
};

type MediaAsset = {
  readonly id: string;
  readonly title: string | null;
  readonly altText: string | null;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly status: 'READY' | 'ARCHIVED';
  readonly createdAt: string;
  readonly usages: readonly MediaUsage[];
};

type ProductSummary = { readonly id: string; readonly title: string; readonly handle: string };
type ProductWorkspace = ProductSummary & {
  readonly variants: readonly { id: string; sku: string; status: string }[];
};

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  return typeof body.error === 'string' ? body.error : (body.error?.message ?? fallback);
}

export default function MediaPage() {
  const [assets, setAssets] = useState<readonly MediaAsset[]>([]);
  const [products, setProducts] = useState<readonly ProductSummary[]>([]);
  const [product, setProduct] = useState<ProductWorkspace | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mediaResponse, productsResponse] = await Promise.all([
        fetch('/api/admin/media', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/catalog/products', { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!mediaResponse.ok)
        throw new Error(await errorMessage(mediaResponse, 'Media library could not be loaded.'));
      if (!productsResponse.ok)
        throw new Error(await errorMessage(productsResponse, 'Products could not be loaded.'));
      const mediaPayload = (await mediaResponse.json()) as { data: readonly MediaAsset[] };
      const productsPayload = (await productsResponse.json()) as {
        data: readonly ProductSummary[];
      };
      setAssets(mediaPayload.data);
      setProducts(productsPayload.data);
      setSelectedAssetId((current) => current || mediaPayload.data[0]?.id || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media library could not be loaded.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const worklist = useOperationalWorklist({
    items: assets,
    storageKey: 'admin-media-library',
    getSearchText: (asset) =>
      [asset.title, asset.altText, asset.id, ...asset.usages.map((usage) => usage.productTitle)]
        .filter(Boolean)
        .join(' '),
    getStatus: (asset) => asset.visibility,
    getReference: (asset) => asset.title ?? asset.id,
    getTimestamp: (asset) => asset.createdAt,
  });

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId),
    [assets, selectedAssetId],
  );

  async function selectProduct(productId: string) {
    if (!productId) {
      setProduct(null);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/catalog/products/${productId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, 'Product workspace could not be loaded.'));
      setProduct(((await response.json()) as { data: ProductWorkspace }).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product could not be loaded.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const file = data.get('image');
    if (!(file instanceof File) || file.size === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/media/images', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': file.type,
          'x-media-visibility': String(data.get('visibility') ?? 'private'),
        },
        body: file,
      });
      if (!response.ok)
        throw new Error(
          await errorMessage(
            response,
            'Upload was rejected. Use a JPEG, PNG, or WebP image within the configured limit.',
          ),
        );
      const uploaded = ((await response.json()) as { data: MediaAsset }).data;
      const metadataResponse = await fetch(`/api/admin/media/${uploaded.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: String(data.get('title') ?? '').trim() || null,
          altText: String(data.get('altText') ?? '').trim() || null,
        }),
      });
      if (!metadataResponse.ok)
        throw new Error(await errorMessage(metadataResponse, 'Image metadata could not be saved.'));
      setMessage('Image uploaded and added to the organization media library.');
      setTone('success');
      formElement.reset();
      setSelectedAssetId(uploaded.id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/media/${selectedAsset.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: String(data.get('title') ?? '').trim() || null,
          altText: String(data.get('altText') ?? '').trim() || null,
          visibility: data.get('visibility'),
        }),
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, 'Media metadata could not be saved.'));
      setMessage('Media metadata and visibility updated.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media metadata could not be saved.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset || !product) return;
    const data = new FormData(event.currentTarget);
    const variantId = String(data.get('variantId') ?? '');
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/catalog/products/${product.id}/media`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          role: data.get('role'),
          position: Number(data.get('position') ?? 0),
          ...(variantId ? { variantId } : {}),
        }),
      });
      if (!response.ok)
        throw new Error(
          await errorMessage(response, 'Media could not be attached to the Product.'),
        );
      setMessage(`Image attached to ${product.title}.`);
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media attachment failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function detach(usage: MediaUsage) {
    if (
      !window.confirm(
        `Remove this ${usage.role.toLowerCase()} placement from ${usage.productTitle}?`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/catalog/products/${usage.productId}/media/${usage.id}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!response.ok)
        throw new Error(await errorMessage(response, 'Media placement could not be removed.'));
      setMessage('Media placement removed. The asset remains safely in the library.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media placement could not be removed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Catalog / Assets"
          title="Media library"
          description="Upload, find, describe, and place tenant-owned Product imagery without exposing storage internals."
          actions={
            <>
              <button className="button secondary" type="button" onClick={() => void load()}>
                <RefreshCw aria-hidden="true" /> Refresh
              </button>
              <Link className="button secondary" href="/products">
                Open Products
              </Link>
            </>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="media-workspace">
          <form className="panel media-upload" onSubmit={(event) => void upload(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">New asset</p>
                <h2>Upload image</h2>
              </div>
              <ImagePlus aria-hidden="true" />
            </div>
            <label htmlFor="media-image">Image file</label>
            <label className="file-drop" htmlFor="media-image">
              <FileImage aria-hidden="true" />
              <strong>Choose a JPEG, PNG, or WebP image</strong>
              <span>File signatures and configured size limits are validated by the server.</span>
              <input
                id="media-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <label htmlFor="media-title">Internal title</label>
            <input
              id="media-title"
              name="title"
              maxLength={160}
              placeholder="Black linen dress — front"
            />
            <label htmlFor="media-alt">Alternative text</label>
            <textarea
              id="media-alt"
              name="altText"
              rows={2}
              maxLength={500}
              placeholder="Front view of a black linen wrap dress"
            />
            <label htmlFor="media-visibility">Initial visibility</label>
            <select id="media-visibility" name="visibility" defaultValue="private">
              <option value="private">Private — recommended for new uploads</option>
              <option value="public">Public — customer-facing media route enabled</option>
            </select>
            <button className="button primary" disabled={busy} type="submit">
              <ImagePlus aria-hidden="true" /> {busy ? 'Working…' : 'Upload asset'}
            </button>
          </form>
          <aside className="panel media-policy">
            <p className="eyebrow">Safety policy</p>
            <h2>Controlled asset lifecycle</h2>
            <div>
              <LockKeyhole aria-hidden="true" />
              <span>
                <strong>Private by default</strong>
                <small>Private media requires an authenticated Admin request.</small>
              </span>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>Content validated</strong>
                <small>MIME type is derived from the file signature.</small>
              </span>
            </div>
            <div>
              <FileImage aria-hidden="true" />
              <span>
                <strong>Catalog-owned placement</strong>
                <small>Role, Product, Variant, and order are explicit commands.</small>
              </span>
            </div>
          </aside>
        </section>

        <OperationalWorklistToolbar
          query={worklist.query}
          onQueryChange={worklist.setQuery}
          status={worklist.status}
          onStatusChange={worklist.setStatus}
          statuses={['PRIVATE', 'PUBLIC']}
          sort={worklist.sort}
          onSortChange={worklist.setSort}
          density={worklist.density}
          onDensityChange={worklist.setDensity}
          resultCount={worklist.visibleItems.length}
          savedViews={worklist.savedViews}
          onSaveView={worklist.saveView}
          onApplyView={worklist.applyView}
          searchLabel="Search by title, alt text, Product, or asset ID"
        />

        <section className="media-library-layout">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Organization library</p>
                <h2>Assets</h2>
              </div>
            </div>
            {loading ? (
              <div className="skeleton-list" aria-label="Loading media library">
                <span />
                <span />
                <span />
              </div>
            ) : worklist.visibleItems.length ? (
              <div className="media-grid">
                {worklist.visibleItems.map((asset) => (
                  <button
                    className="media-card"
                    aria-pressed={selectedAssetId === asset.id}
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                  >
                    <span className="media-preview">
                      <Image
                        src={`/api/admin/media/${asset.id}`}
                        alt={asset.altText || asset.title || 'Admin media asset'}
                        width={320}
                        height={240}
                        unoptimized
                      />
                    </span>
                    <span className="media-card-copy">
                      <strong>{asset.title || 'Untitled image'}</strong>
                      <span>
                        <StatusBadge status={asset.visibility} /> {asset.usages.length} placement
                        {asset.usages.length === 1 ? '' : 's'}
                      </span>
                      <small>
                        {asset.widthPx && asset.heightPx
                          ? `${asset.widthPx} × ${asset.heightPx} · `
                          : ''}
                        {Math.ceil(asset.byteSize / 1024)} KB
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <OperationalEmptyState
                title="No matching media"
                description="Upload an image or clear the active filters."
              />
            )}
          </div>

          <aside className="panel media-inspector">
            {selectedAsset ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Selected asset</p>
                    <h2>{selectedAsset.title || 'Untitled image'}</h2>
                  </div>
                  <StatusBadge status={selectedAsset.visibility} />
                </div>
                <form className="inset-form" onSubmit={(event) => void saveMetadata(event)}>
                  <label htmlFor="asset-title">Internal title</label>
                  <input
                    id="asset-title"
                    name="title"
                    defaultValue={selectedAsset.title ?? ''}
                    maxLength={160}
                  />
                  <label htmlFor="asset-alt">Alternative text</label>
                  <textarea
                    id="asset-alt"
                    name="altText"
                    defaultValue={selectedAsset.altText ?? ''}
                    rows={3}
                    maxLength={500}
                  />
                  <label htmlFor="asset-visibility">Visibility</label>
                  <select
                    id="asset-visibility"
                    name="visibility"
                    defaultValue={selectedAsset.visibility}
                  >
                    <option value="PRIVATE">Private</option>
                    <option value="PUBLIC">Public</option>
                  </select>
                  <button className="button secondary" disabled={busy} type="submit">
                    Save metadata
                  </button>
                </form>
                <form className="inset-form" onSubmit={(event) => void attach(event)}>
                  <h3>
                    <Link2 aria-hidden="true" /> Product placement
                  </h3>
                  <label htmlFor="asset-product">Product</label>
                  <select
                    id="asset-product"
                    defaultValue=""
                    onChange={(event) => void selectProduct(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Choose a Product
                    </option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="asset-variant">Variant (optional)</label>
                  <select id="asset-variant" name="variantId" defaultValue="">
                    <option value="">All Variants / Product-level</option>
                    {product?.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.sku}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="asset-role">Placement role</label>
                  <select id="asset-role" name="role" defaultValue="GALLERY">
                    <option value="THUMBNAIL">Thumbnail</option>
                    <option value="GALLERY">Gallery</option>
                    <option value="COLOR_GALLERY">Color gallery</option>
                    <option value="SIZE_DIAGRAM">Size diagram</option>
                  </select>
                  <label htmlFor="asset-position">Position</label>
                  <input
                    id="asset-position"
                    name="position"
                    type="number"
                    min={0}
                    defaultValue={0}
                  />
                  <button className="button primary" disabled={busy || !product} type="submit">
                    Attach to Product
                  </button>
                </form>
                <section>
                  <h3>Current placements</h3>
                  {selectedAsset.usages.length ? (
                    <ul className="media-usage-list">
                      {selectedAsset.usages.map((usage) => (
                        <li key={usage.id}>
                          <span>
                            <strong>{usage.productTitle}</strong>
                            <small>
                              {usage.variantSku ? `${usage.variantSku} · ` : ''}
                              {usage.role.replaceAll('_', ' ')} · position {usage.position}
                            </small>
                          </span>
                          <button
                            aria-label={`Remove placement from ${usage.productTitle}`}
                            className="button secondary"
                            disabled={busy}
                            type="button"
                            onClick={() => void detach(usage)}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No Product placements yet.</p>
                  )}
                </section>
              </>
            ) : (
              <OperationalEmptyState
                title="Select an asset"
                description="Choose an image to edit metadata and manage Product placements."
              />
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}
