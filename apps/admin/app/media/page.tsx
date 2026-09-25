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
import { type FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from '../../components/operational-worklist';
import { StatusBadge } from '../../components/status-badge';
import { uploadMediaFile } from '../../lib/media/api';

type MediaUsage = {
  readonly id: string;
  readonly domain: string;
  readonly label: string | null;
  readonly productId?: string;
  readonly productTitle?: string;
  readonly variantId?: string | null;
  readonly variantSku?: string | null;
  readonly role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly position?: number;
};

type MediaAsset = {
  readonly id: string;
  readonly assetType: 'IMAGE' | 'DOCUMENT';
  readonly originalFilename: string;
  readonly uploadSource: string;
  readonly uploadedBy: { id: string; name: string } | null;
  readonly folderId: string | null;
  readonly tags: readonly { id: string; name: string }[];
  readonly title: string | null;
  readonly altText: string | null;
  readonly mimeType: string | null;
  readonly byteSize: number | null;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly status:
    | 'PENDING_UPLOAD'
    | 'UPLOADED'
    | 'PROCESSING'
    | 'READY'
    | 'FAILED'
    | 'QUARANTINED'
    | 'ARCHIVED'
    | 'TRASHED'
    | 'PURGING';
  readonly createdAt: string;
  readonly version: number;
  readonly processingErrorMessage: string | null;
  readonly usages: readonly MediaUsage[];
};

type ProductSummary = { readonly id: string; readonly title: string; readonly handle: string };
type MediaFolder = {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly version: number;
  readonly assetCount: number;
};
type MediaTag = { readonly id: string; readonly name: string; readonly assetCount: number };
type Pagination = { page: number; pageSize: number; totalItems: number; totalPages: number };
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
  const [folders, setFolders] = useState<readonly MediaFolder[]>([]);
  const [tags, setTags] = useState<readonly MediaTag[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 24,
    totalItems: 0,
    totalPages: 0,
  });
  const [product, setProduct] = useState<ProductWorkspace | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{
    status: 'HEALTHY' | 'DEGRADED';
    checkedObjectCount: number;
    issueCount: number;
    issues: readonly { code: string; assetId: string; detail: string }[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mediaResponse, productsResponse, foldersResponse, tagsResponse] = await Promise.all([
        fetch(
          `/api/admin/media?page=${page}&pageSize=24${deferredSearchQuery.trim() ? `&query=${encodeURIComponent(deferredSearchQuery.trim())}` : ''}${lifecycleFilter ? `&status=${encodeURIComponent(lifecycleFilter)}` : ''}`,
          { credentials: 'include', cache: 'no-store' },
        ),
        fetch('/api/admin/catalog/products', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/media/folders', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/media/tags', { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!mediaResponse.ok)
        throw new Error(await errorMessage(mediaResponse, 'Media library could not be loaded.'));
      if (!productsResponse.ok)
        throw new Error(await errorMessage(productsResponse, 'Products could not be loaded.'));
      if (!foldersResponse.ok || !tagsResponse.ok)
        throw new Error('Media organization could not be loaded.');
      const mediaPayload = (await mediaResponse.json()) as {
        data: readonly MediaAsset[];
        pagination: Pagination;
      };
      const productsPayload = (await productsResponse.json()) as {
        data: readonly ProductSummary[];
      };
      setAssets(mediaPayload.data);
      setPagination(mediaPayload.pagination);
      setProducts(productsPayload.data);
      setFolders(((await foldersResponse.json()) as { data: readonly MediaFolder[] }).data);
      setTags(((await tagsResponse.json()) as { data: readonly MediaTag[] }).data);
      setSelectedAssetId((current) => current || mediaPayload.data[0]?.id || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media library could not be loaded.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, [deferredSearchQuery, lifecycleFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const worklist = useOperationalWorklist({
    items: assets,
    storageKey: 'admin-media-library',
    getSearchText: (asset) =>
      [
        asset.title,
        asset.altText,
        asset.originalFilename,
        asset.id,
        ...asset.usages.map((usage) => usage.label),
      ]
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
        throw new Error(await errorMessage(response, 'Product could not be loaded.'));
      setProduct(((await response.json()) as { data: ProductWorkspace }).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product could not be loaded.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function checkHealth() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/media/health', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, 'Media health check could not run.'));
      const result = (await response.json()) as { data: NonNullable<typeof health> };
      setHealth(result.data);
      setMessage(
        result.data.status === 'HEALTHY'
          ? `Media health is good across ${result.data.checkedObjectCount} stored objects.`
          : `Media health found ${result.data.issueCount} issue${result.data.issueCount === 1 ? '' : 's'}.`,
      );
      setTone(result.data.status === 'HEALTHY' ? 'success' : 'warning');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media health check could not run.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const files = data
      .getAll('image')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const progress = new Map<number, number>();
      const results = await Promise.allSettled(
        files.map((file, index) =>
          uploadMediaFile(file, {
            visibility: data.get('visibility') === 'public' ? 'PUBLIC' : 'PRIVATE',
            title:
              files.length === 1
                ? String(data.get('title') ?? '').trim() || null
                : file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText: files.length === 1 ? String(data.get('altText') ?? '').trim() || null : null,
            onProgress: (value) => {
              progress.set(index, value);
              setUploadProgress(
                Math.round(
                  Array.from(
                    { length: files.length },
                    (_, fileIndex) => progress.get(fileIndex) ?? 0,
                  ).reduce((sum, current) => sum + current, 0) / files.length,
                ),
              );
            },
          }),
        ),
      );
      const uploaded = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const failed = results.length - uploaded.length;
      setMessage(
        `${uploaded.length} asset${uploaded.length === 1 ? '' : 's'} uploaded and queued for processing${failed ? `; ${failed} failed` : ''}.`,
      );
      setTone(failed ? 'warning' : 'success');
      formElement.reset();
      setSelectedAssetId(uploaded[0]?.assetId ?? '');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
      setTone('danger');
    } finally {
      setUploadProgress(null);
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
          version: selectedAsset.version,
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

  async function createLibraryTerm(event: FormEvent<HTMLFormElement>, kind: 'folder' | 'tag') {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    const parentId = String(form.get('parentId') ?? '');
    if (!name) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/media/${kind === 'folder' ? 'folders' : 'tags'}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          ...(kind === 'folder' ? { parentId: parentId || null } : {}),
        }),
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, `${kind} could not be created.`));
      formElement.reset();
      setMessage(`${kind === 'folder' ? 'Folder' : 'Tag'} created.`);
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${kind} could not be created.`);
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset) return;
    const data = new FormData(event.currentTarget);
    const folderId = String(data.get('folderId') ?? '');
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/media/${selectedAsset.id}/organization`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          version: selectedAsset.version,
          folderId: folderId || null,
          tagIds: data.getAll('tagIds').map(String),
        }),
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, 'Media organization could not be saved.'));
      setMessage('Folder and tags updated.');
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media organization could not be saved.');
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
        `Remove this ${(usage.role ?? 'media').toLowerCase()} placement from ${usage.productTitle ?? usage.label ?? 'this usage'}?`,
      )
    )
      return;
    if (!usage.productId) return;
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

  async function runAssetAction(action: 'retry' | 'archive' | 'trash' | 'restore') {
    if (!selectedAsset) return;
    if (
      action === 'trash' &&
      !window.confirm(
        `Move ${selectedAsset.title || selectedAsset.originalFilename} to trash? It will be retained before physical cleanup.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(
        action === 'trash'
          ? `/api/admin/media/${selectedAsset.id}`
          : `/api/admin/media/${selectedAsset.id}/${action}`,
        { method: action === 'trash' ? 'DELETE' : 'POST', credentials: 'include' },
      );
      if (!response.ok)
        throw new Error(await errorMessage(response, `Asset ${action} could not be completed.`));
      setMessage(
        action === 'retry'
          ? 'Media processing queued for retry.'
          : action === 'archive'
            ? 'Asset archived and removed from new selection.'
            : action === 'restore'
              ? 'Asset restored from trash as archived media.'
              : 'Unused asset moved to recoverable trash.',
      );
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Asset ${action} failed.`);
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
          description="Upload, process, find, reuse, and safely manage organization-owned images and documents."
          actions={
            <>
              <button className="button secondary" type="button" onClick={() => void load()}>
                <RefreshCw aria-hidden="true" /> Refresh
              </button>
              <button
                className="button secondary"
                disabled={busy}
                type="button"
                onClick={() => void checkHealth()}
              >
                <ShieldCheck aria-hidden="true" /> Check health
              </button>
              <Link className="button secondary" href="/products">
                Open Products
              </Link>
            </>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        {health?.status === 'DEGRADED' ? (
          <OperationalFeedback tone="warning">
            <strong>Media health needs attention.</strong>
            <ul>
              {health.issues.slice(0, 10).map((issue, index) => (
                <li key={`${issue.code}-${issue.assetId}-${index}`}>
                  {issue.code.replaceAll('_', ' ')} · {issue.assetId}: {issue.detail}
                </li>
              ))}
            </ul>
            {health.issues.length > 10 ? <small>Showing the first 10 issues.</small> : null}
          </OperationalFeedback>
        ) : null}
        <section className="media-workspace">
          <form className="panel media-upload" onSubmit={(event) => void upload(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">New asset</p>
                <h2>Upload asset</h2>
              </div>
              <ImagePlus aria-hidden="true" />
            </div>
            <label htmlFor="media-image">Image or PDF</label>
            <label className="file-drop" htmlFor="media-image">
              <FileImage aria-hidden="true" />
              <strong>Choose a JPEG, PNG, WebP, or PDF</strong>
              <span>File signatures and configured size limits are validated by the server.</span>
              <input
                id="media-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
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
              <ImagePlus aria-hidden="true" />{' '}
              {busy
                ? `Uploading${uploadProgress === null ? '…' : ` ${uploadProgress}%`}`
                : 'Upload assets'}
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

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Library organization</p>
              <h2>Folders and tags</h2>
            </div>
          </div>
          <div className="form-grid">
            <form
              className="inset-form"
              onSubmit={(event) => void createLibraryTerm(event, 'folder')}
            >
              <label htmlFor="new-media-folder">New folder</label>
              <input id="new-media-folder" name="name" maxLength={120} required />
              <label htmlFor="new-media-folder-parent">Parent folder</label>
              <select id="new-media-folder-parent" name="parentId" defaultValue="">
                <option value="">Top level</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button className="button secondary" disabled={busy} type="submit">
                Create folder
              </button>
            </form>
            <form className="inset-form" onSubmit={(event) => void createLibraryTerm(event, 'tag')}>
              <label htmlFor="new-media-tag">New tag</label>
              <input id="new-media-tag" name="name" maxLength={80} required />
              <button className="button secondary" disabled={busy} type="submit">
                Create tag
              </button>
            </form>
          </div>
        </section>

        <OperationalWorklistToolbar
          query={searchQuery}
          onQueryChange={(value) => {
            setSearchQuery(value);
            setPage(1);
          }}
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
        <label htmlFor="media-lifecycle-filter">
          Lifecycle
          <select
            id="media-lifecycle-filter"
            value={lifecycleFilter}
            onChange={(event) => {
              setLifecycleFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Active library</option>
            <option value="PENDING_UPLOAD">Pending upload</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="READY">Ready</option>
            <option value="ARCHIVED">Archived</option>
            <option value="TRASHED">Trash</option>
          </select>
        </label>

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
                      {asset.assetType === 'IMAGE' && asset.status === 'READY' ? (
                        <Image
                          src={`/api/admin/media/${asset.id}/content`}
                          alt={asset.altText || asset.title || 'Admin media asset'}
                          width={320}
                          height={240}
                          unoptimized
                        />
                      ) : (
                        <FileImage aria-hidden="true" />
                      )}
                    </span>
                    <span className="media-card-copy">
                      <strong>{asset.title || asset.originalFilename}</strong>
                      <span>
                        <StatusBadge status={asset.visibility} /> {asset.usages.length} placement
                        {asset.usages.length === 1 ? '' : 's'}
                      </span>
                      <small>
                        {asset.widthPx && asset.heightPx
                          ? `${asset.widthPx} × ${asset.heightPx} · `
                          : ''}
                        {asset.byteSize === null
                          ? asset.status.replaceAll('_', ' ')
                          : `${Math.ceil(asset.byteSize / 1024)} KB`}
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
            <div className="button-row" aria-label="Media library pages">
              <button
                className="button secondary"
                disabled={loading || page <= 1}
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {Math.max(1, pagination.totalPages)} ·{' '}
                {pagination.totalItems} assets
              </span>
              <button
                className="button secondary"
                disabled={loading || page >= pagination.totalPages}
                type="button"
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>

          <aside className="panel media-inspector">
            {selectedAsset ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Selected asset</p>
                    <h2>{selectedAsset.title || selectedAsset.originalFilename}</h2>
                  </div>
                  <StatusBadge status={selectedAsset.visibility} />
                </div>
                <p>
                  Source: {selectedAsset.uploadSource.replaceAll('_', ' ').toLowerCase()}
                  {selectedAsset.uploadedBy
                    ? ` · Uploaded by ${selectedAsset.uploadedBy.name}`
                    : ''}
                </p>
                {selectedAsset.status !== 'READY' ? (
                  <OperationalFeedback
                    tone={
                      selectedAsset.status === 'FAILED' || selectedAsset.status === 'QUARANTINED'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {selectedAsset.processingErrorMessage ??
                      selectedAsset.status.replaceAll('_', ' ')}
                  </OperationalFeedback>
                ) : null}
                <div className="button-row">
                  {selectedAsset.status === 'FAILED' ? (
                    <button
                      className="button secondary"
                      disabled={busy}
                      type="button"
                      onClick={() => void runAssetAction('retry')}
                    >
                      <RefreshCw aria-hidden="true" /> Retry processing
                    </button>
                  ) : null}
                  {selectedAsset.status === 'READY' ? (
                    <button
                      className="button secondary"
                      disabled={busy}
                      type="button"
                      onClick={() => void runAssetAction('archive')}
                    >
                      Archive
                    </button>
                  ) : null}
                  {selectedAsset.status === 'TRASHED' ? (
                    <button
                      className="button secondary"
                      disabled={busy}
                      type="button"
                      onClick={() => void runAssetAction('restore')}
                    >
                      Restore
                    </button>
                  ) : null}
                  {selectedAsset.usages.length === 0 &&
                  ['READY', 'ARCHIVED', 'FAILED'].includes(selectedAsset.status) ? (
                    <button
                      className="button secondary"
                      disabled={busy}
                      type="button"
                      onClick={() => void runAssetAction('trash')}
                    >
                      <Trash2 aria-hidden="true" /> Move to trash
                    </button>
                  ) : null}
                </div>
                <form
                  key={`metadata-${selectedAsset.id}`}
                  className="inset-form"
                  onSubmit={(event) => void saveMetadata(event)}
                >
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
                    <option
                      value="PRIVATE"
                      disabled={
                        selectedAsset.visibility === 'PUBLIC' &&
                        ['PROCESSING', 'READY', 'ARCHIVED'].includes(selectedAsset.status)
                      }
                    >
                      Private
                    </option>
                    <option value="PUBLIC">Public</option>
                  </select>
                  {selectedAsset.visibility === 'PUBLIC' &&
                  ['PROCESSING', 'READY', 'ARCHIVED'].includes(selectedAsset.status) ? (
                    <small>Processed public bytes cannot be reclassified as private.</small>
                  ) : null}
                  <button className="button secondary" disabled={busy} type="submit">
                    Save metadata
                  </button>
                </form>
                <form
                  key={`organization-${selectedAsset.id}`}
                  className="inset-form"
                  onSubmit={(event) => void saveOrganization(event)}
                >
                  <h3>Library organization</h3>
                  <label htmlFor="asset-folder">Folder</label>
                  <select
                    id="asset-folder"
                    name="folderId"
                    defaultValue={selectedAsset.folderId ?? ''}
                  >
                    <option value="">Unfiled</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name} ({folder.assetCount})
                      </option>
                    ))}
                  </select>
                  <fieldset>
                    <legend>Tags</legend>
                    {tags.length ? (
                      tags.map((tag) => (
                        <label key={tag.id}>
                          <input
                            name="tagIds"
                            type="checkbox"
                            value={tag.id}
                            defaultChecked={selectedAsset.tags.some((item) => item.id === tag.id)}
                          />{' '}
                          {tag.name}
                        </label>
                      ))
                    ) : (
                      <small>Create a tag above to classify assets.</small>
                    )}
                  </fieldset>
                  <button className="button secondary" disabled={busy} type="submit">
                    Save organization
                  </button>
                </form>
                <form
                  key={`placement-${selectedAsset.id}`}
                  className="inset-form"
                  onSubmit={(event) => void attach(event)}
                >
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
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !product ||
                      selectedAsset.assetType !== 'IMAGE' ||
                      selectedAsset.status !== 'READY' ||
                      selectedAsset.visibility !== 'PUBLIC'
                    }
                    type="submit"
                  >
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
                            <strong>{usage.productTitle ?? usage.label ?? usage.domain}</strong>
                            <small>
                              {usage.variantSku ? `${usage.variantSku} · ` : ''}
                              {(usage.role ?? usage.domain).replaceAll('_', ' ')}
                              {usage.position === undefined ? '' : ` · position ${usage.position}`}
                            </small>
                          </span>
                          <button
                            aria-label={`Remove placement from ${usage.productTitle ?? usage.label ?? usage.domain}`}
                            className="button secondary"
                            disabled={busy}
                            type="button"
                            onClick={() => void detach(usage)}
                            hidden={!usage.productId}
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
