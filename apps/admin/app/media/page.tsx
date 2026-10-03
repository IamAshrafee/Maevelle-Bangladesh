'use client';

import {
  type ClipboardEvent,
  type FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Image from 'next/image';
import {
  Archive,
  Copy,
  Download,
  FileIcon,
  FileImage,
  FolderIcon,
  FolderPlus,
  LayoutGrid,
  List,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  TagIcon,
  Trash2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '../../components/status-badge';
import {
  bulkOrganizeMedia,
  bulkTrashMedia,
  getAdminMediaUrl,
  uploadMediaFile,
} from '../../lib/media/api';

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
  readonly caption: string | null;
  readonly internalDescription: string | null;
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
  readonly options: readonly {
    id: string;
    name: string;
    values: readonly { id: string; label: string; status: string }[];
  }[];
};
type PlacementScope = 'PRODUCT' | 'VARIANT' | 'OPTION';

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
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [assetTypeFilter] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedTagId] = useState('');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 32,
    totalItems: 0,
    totalPages: 0,
  });

  const [product, setProduct] = useState<ProductWorkspace | null>(null);
  const [placementScope, setPlacementScope] = useState<PlacementScope>('PRODUCT');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [isBulkFolderOpen, setIsBulkFolderOpen] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isNewTagOpen, setIsNewTagOpen] = useState(false);
  const [bulkTargetFolderId, setBulkTargetFolderId] = useState('');

  const [health, setHealth] = useState<{
    status: 'HEALTHY' | 'DEGRADED';
    checkedObjectCount: number;
    issueCount: number;
    issues: readonly { code: string; assetId: string; detail: string }[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('pageSize', '32');
      if (deferredSearchQuery.trim()) queryParams.set('query', deferredSearchQuery.trim());
      if (lifecycleFilter) queryParams.set('status', lifecycleFilter);
      if (visibilityFilter) queryParams.set('visibility', visibilityFilter);
      if (assetTypeFilter) queryParams.set('assetType', assetTypeFilter);
      if (selectedFolderId) queryParams.set('folderId', selectedFolderId);
      if (selectedTagId) queryParams.set('tagId', selectedTagId);
      if (unusedOnly) queryParams.set('unused', 'true');

      const [mediaResponse, productsResponse, foldersResponse, tagsResponse] = await Promise.all([
        fetch(`/api/admin/media?${queryParams.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
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
      setSelectedAssetId((current) =>
        mediaPayload.data.some((asset) => asset.id === current)
          ? current
          : (mediaPayload.data[0]?.id ?? ''),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media library could not be loaded.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, [
    deferredSearchQuery,
    lifecycleFilter,
    visibilityFilter,
    assetTypeFilter,
    selectedFolderId,
    selectedTagId,
    unusedOnly,
    page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId),
    [assets, selectedAssetId],
  );

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
      setIsHealthOpen(true);
      setMessage(
        result.data.status === 'HEALTHY'
          ? `Media storage is healthy across ${result.data.checkedObjectCount} stored objects.`
          : `Storage diagnostics found ${result.data.issueCount} issue${result.data.issueCount === 1 ? '' : 's'}.`,
      );
      setTone(result.data.status === 'HEALTHY' ? 'success' : 'warning');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media health check could not run.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function selectProduct(productId: string) {
    if (!productId) {
      setProduct(null);
      setPlacementScope('PRODUCT');
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
      setPlacementScope('PRODUCT');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product could not be loaded.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleFilesUpload(
    files: FileList | null,
    initialVisibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE',
  ) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setBusy(true);
    setMessage('');
    try {
      const progress = new Map<number, number>();
      const results = await Promise.allSettled(
        fileList.map((file, index) =>
          uploadMediaFile(file, {
            visibility: initialVisibility,
            title: file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText: null,
            onProgress: (value) => {
              progress.set(index, value);
              setUploadProgress(
                Math.round(
                  Array.from(
                    { length: fileList.length },
                    (_, fileIndex) => progress.get(fileIndex) ?? 0,
                  ).reduce((sum, current) => sum + current, 0) / fileList.length,
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
      if (uploaded[0]) setSelectedAssetId(uploaded[0].assetId);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
      setTone('danger');
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      void handleFilesUpload(dt.files);
    }
  };

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
          caption: String(data.get('caption') ?? '').trim() || null,
          internalDescription: String(data.get('internalDescription') ?? '').trim() || null,
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

  async function createLibraryFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const parentId = String(form.get('parentId') ?? '');
    if (!name) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/media/folders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, ...(parentId ? { parentId } : {}) }),
      });
      if (!response.ok)
        throw new Error(await errorMessage(response, 'Folder could not be created.'));
      setIsNewFolderOpen(false);
      setMessage(`Folder "${name}" created.`);
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Folder could not be created.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function createLibraryTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/media/tags', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, 'Tag could not be created.'));
      setIsNewTagOpen(false);
      setMessage(`Tag "${name}" created.`);
      setTone('success');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tag could not be created.');
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
    const scopedId = String(data.get('scopedId') ?? '');
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
          ...(placementScope === 'VARIANT' && scopedId ? { variantId: scopedId } : {}),
          ...(placementScope === 'OPTION' && scopedId ? { optionValueId: scopedId } : {}),
          isPrimary: data.get('isPrimary') === 'on',
          altTextOverride: String(data.get('altTextOverride') ?? '').trim() || null,
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
    if (!usage.productId) return;
    if (!window.confirm(`Remove placement from ${usage.productTitle ?? usage.label ?? 'product'}?`))
      return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/catalog/products/${usage.productId}/media/${usage.id}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!response.ok)
        throw new Error(await errorMessage(response, 'Media placement could not be removed.'));
      setMessage('Media placement detached safely.');
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
      !window.confirm(`Move ${selectedAsset.title || selectedAsset.originalFilename} to trash?`)
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
            ? 'Asset archived.'
            : action === 'restore'
              ? 'Asset restored from trash.'
              : 'Unused asset moved to trash.',
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

  // Bulk operations
  const handleToggleSelectAll = () => {
    if (selectedForBulk.size === assets.length) {
      setSelectedForBulk(new Set());
    } else {
      setSelectedForBulk(new Set(assets.map((a) => a.id)));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedForBulk((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkTrash = async () => {
    if (selectedForBulk.size === 0) return;
    if (
      !window.confirm(
        `Move ${selectedForBulk.size} selected assets to trash? Unused assets will be trashed; in-use assets will be safely skipped.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await bulkTrashMedia(Array.from(selectedForBulk));
      setMessage(
        `Bulk trash complete: ${result.trashedCount} trashed${result.skippedInUseCount > 0 ? `, ${result.skippedInUseCount} skipped because they are active in catalog/reviews` : ''}.`,
      );
      setTone(result.skippedInUseCount > 0 ? 'warning' : 'success');
      setSelectedForBulk(new Set());
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk trash failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkMoveToFolder = async () => {
    if (selectedForBulk.size === 0) return;
    setBusy(true);
    try {
      const result = await bulkOrganizeMedia({
        assetIds: Array.from(selectedForBulk),
        folderId: bulkTargetFolderId === 'unfiled' ? null : bulkTargetFolderId || null,
      });
      setMessage(`Moved ${result.updatedCount} assets to target folder.`);
      setTone('success');
      setIsBulkFolderOpen(false);
      setSelectedForBulk(new Set());
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk move failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/10 p-4 sm:p-6 lg:p-8 space-y-6" onPaste={handlePaste}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Media Library
            </h1>
            <Badge variant="outline" className="text-xs">
              Platform Asset Hub
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Deterministic WebP delivery, EXIF normalization, tenant isolation, and atomic placement
            syncing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void checkHealth()}
            disabled={busy}
          >
            <ShieldCheck className="size-3.5 text-primary" />
            Storage Health
          </Button>

          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => document.getElementById('main-media-upload-input')?.click()}
            disabled={busy}
          >
            <Plus className="size-3.5" />
            Upload Assets
          </Button>
          <input
            id="main-media-upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => void handleFilesUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Notification banner */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs font-medium border ${
            tone === 'danger'
              ? 'bg-destructive/10 border-destructive/30 text-destructive'
              : tone === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          <span>{message}</span>
          <button
            type="button"
            className="hover:opacity-75"
            onClick={() => setMessage('')}
            aria-label="Dismiss feedback"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Uploading progress banner */}
      {uploadProgress !== null && (
        <Card className="border-primary/30 bg-primary/5 shadow-xs">
          <CardContent className="flex items-center gap-3 p-3">
            <LoaderCircle className="size-4 animate-spin text-primary shrink-0" />
            <div className="flex-1 text-xs">
              <span className="font-semibold text-foreground">
                Streaming and processing uploads… ({uploadProgress}%)
              </span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Validating file signatures, stripping EXIF tags, and generating WebP renditions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Action Bar */}
      {selectedForBulk.size > 0 && (
        <Card className="border-primary bg-primary/10 shadow-sm sticky top-4 z-20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground font-semibold text-xs">
                {selectedForBulk.size} selected
              </Badge>
              <span className="text-xs text-muted-foreground">across current filter</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setIsBulkFolderOpen(true)}
              >
                <FolderIcon className="size-3.5" />
                Move to Folder
              </Button>

              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => void handleBulkTrash()}
              >
                <Trash2 className="size-3.5" />
                Trash Unused
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedForBulk(new Set())}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters Toolbar */}
      <Card className="shadow-xs">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search filenames, alt text, internal titles, or asset IDs…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>

            {/* Folder filter */}
            <select
              value={selectedFolderId}
              onChange={(e) => {
                setSelectedFolderId(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by folder"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
            >
              <option value="">All Folders</option>
              <option value="unfiled">Unfiled Only</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.assetCount})
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={lifecycleFilter}
              onChange={(e) => {
                setLifecycleFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by lifecycle status"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
            >
              <option value="">All Lifecycles</option>
              <option value="READY">Ready</option>
              <option value="PROCESSING">Processing</option>
              <option value="PENDING_UPLOAD">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="QUARANTINED">Quarantined</option>
              <option value="ARCHIVED">Archived</option>
              <option value="TRASHED">Trash</option>
            </select>

            {/* Visibility filter */}
            <select
              value={visibilityFilter}
              onChange={(e) => {
                setVisibilityFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by visibility"
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
            >
              <option value="">All Visibility</option>
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </select>

            {/* Unused filter button */}
            <Button
              variant={unusedOnly ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs gap-1.5 shrink-0"
              onClick={() => {
                setUnusedOnly(!unusedOnly);
                setPage(1);
              }}
            >
              {unusedOnly ? 'Showing Unused' : 'Filter Unused'}
            </Button>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-md border bg-muted/40 p-0.5 shrink-0">
              <button
                type="button"
                className={`p-1.5 rounded text-xs ${viewMode === 'grid' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
                aria-label="Grid view"
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                className={`p-1.5 rounded text-xs ${viewMode === 'list' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setViewMode('list')}
                title="List view"
                aria-label="List view"
              >
                <List className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Secondary bar: Folders & Tags management buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="font-medium text-foreground">Taxonomy:</span>
              <button
                type="button"
                className="hover:text-primary transition-colors flex items-center gap-1"
                onClick={() => setIsNewFolderOpen(true)}
              >
                <FolderPlus className="size-3.5 text-primary" /> + New Folder
              </button>
              <button
                type="button"
                className="hover:text-primary transition-colors flex items-center gap-1"
                onClick={() => setIsNewTagOpen(true)}
              >
                <TagIcon className="size-3.5 text-primary" /> + New Tag
              </button>
            </div>

            <div className="text-[11px]">
              Showing {assets.length} of {pagination.totalItems} assets (Page {pagination.page} of{' '}
              {Math.max(1, pagination.totalPages)})
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Workspace: 2-column layout on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Asset Gallery (Grid or List) */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="shadow-xs overflow-hidden">
            <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={assets.length > 0 && selectedForBulk.size === assets.length}
                  onCheckedChange={handleToggleSelectAll}
                  aria-label="Select all assets on this page"
                />
                <span className="text-xs font-semibold text-foreground">Select All on Page</span>
              </div>

              <span className="text-xs text-muted-foreground">
                Paste anywhere (Ctrl+V) to upload
              </span>
            </CardHeader>

            <CardContent className="p-4 min-h-[400px]">
              {loading ? (
                <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <LoaderCircle className="size-6 animate-spin text-primary" />
                  <span className="text-xs">Loading media assets…</span>
                </div>
              ) : assets.length === 0 ? (
                <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <FileImage className="size-10 text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-foreground">No media assets found</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    No files match the active filters. Upload an asset above or clear filters to
                    view library files.
                  </p>
                </div>
              ) : viewMode === 'grid' ? (
                /* Grid View */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {assets.map((asset) => {
                    const isSelected = selectedAssetId === asset.id;
                    const isBulkChecked = selectedForBulk.has(asset.id);

                    return (
                      <div
                        key={asset.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedAssetId(asset.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAssetId(asset.id);
                          }
                        }}
                        className={`group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-primary ring-offset-1 border-primary bg-primary/5'
                            : 'hover:border-primary/50 bg-background'
                        }`}
                      >
                        {/* Thumbnail Container */}
                        <div className="aspect-square relative w-full overflow-hidden bg-muted">
                          {asset.assetType === 'IMAGE' && asset.status === 'READY' ? (
                            <Image
                              src={getAdminMediaUrl(asset.id, { rendition: 'card' })}
                              alt={asset.altText || asset.title || asset.originalFilename}
                              fill
                              unoptimized
                              className="object-cover transition-transform group-hover:scale-105"
                              sizes="(max-width: 768px) 50vw, 25vw"
                            />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-muted-foreground">
                              {asset.assetType === 'DOCUMENT' ? (
                                <FileIcon className="size-8 text-primary/70" />
                              ) : (
                                <FileImage className="size-8 text-muted-foreground/50" />
                              )}
                              <span className="text-[10px] uppercase font-semibold">
                                {asset.status}
                              </span>
                            </div>
                          )}

                          {/* Checkbox for bulk actions */}
                          <div
                            className="absolute top-2 left-2 z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelectItem(asset.id);
                            }}
                          >
                            <Checkbox
                              checked={isBulkChecked}
                              className="bg-background/90 backdrop-blur-xs"
                            />
                          </div>

                          {/* Visibility badge */}
                          <div className="absolute top-2 right-2">
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1 py-0 backdrop-blur-xs ${asset.visibility === 'PUBLIC' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-background/90 text-foreground'}`}
                            >
                              {asset.visibility}
                            </Badge>
                          </div>

                          {/* Dimensions & size overlay */}
                          {asset.widthPx && asset.heightPx && (
                            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-white">
                              {asset.widthPx}×{asset.heightPx}
                            </span>
                          )}
                        </div>

                        {/* Card metadata */}
                        <div className="p-2 space-y-1">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {asset.title || asset.originalFilename}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {asset.byteSize ? `${Math.ceil(asset.byteSize / 1024)} KB` : '—'}
                            </span>
                            <span>
                              {asset.usages.length} placement{asset.usages.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* List View */
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-14">Preview</TableHead>
                      <TableHead>Filename / Title</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Placements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((asset) => {
                      const isSelected = selectedAssetId === asset.id;
                      const isBulkChecked = selectedForBulk.has(asset.id);

                      return (
                        <TableRow
                          key={asset.id}
                          className={`cursor-pointer text-xs ${isSelected ? 'bg-primary/5' : ''}`}
                          onClick={() => setSelectedAssetId(asset.id)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isBulkChecked}
                              onCheckedChange={() => handleToggleSelectItem(asset.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="size-10 relative rounded border overflow-hidden bg-muted">
                              {asset.assetType === 'IMAGE' && asset.status === 'READY' ? (
                                <Image
                                  src={getAdminMediaUrl(asset.id, { rendition: 'thumbnail' })}
                                  alt=""
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : (
                                <FileIcon className="size-5 m-auto text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-semibold text-foreground truncate max-w-xs">
                              {asset.title || asset.originalFilename}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{asset.id}</p>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {asset.widthPx && asset.heightPx
                              ? `${asset.widthPx}×${asset.heightPx} · `
                              : ''}
                            {asset.byteSize ? `${Math.ceil(asset.byteSize / 1024)} KB` : '—'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={asset.status} />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${asset.visibility === 'PUBLIC' ? 'text-emerald-600' : ''}`}
                            >
                              {asset.visibility}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-muted-foreground font-medium">
                              {asset.usages.length}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>

            {/* Pagination footer */}
            <CardFooter className="p-4 border-t flex flex-row items-center justify-between bg-muted/10">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={loading || page <= 1}
                onClick={() => setPage((c) => Math.max(1, c - 1))}
              >
                Previous
              </Button>

              <span className="text-xs text-muted-foreground">
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={loading || page >= pagination.totalPages}
                onClick={() => setPage((c) => c + 1)}
              >
                Next
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Right Column: Asset Inspector / Details & Actions */}
        <div className="lg:col-span-4 space-y-4">
          {selectedAsset ? (
            <Card className="shadow-xs sticky top-4">
              <CardHeader className="p-4 border-b pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate">
                    <CardTitle className="text-sm font-semibold truncate">
                      {selectedAsset.title || selectedAsset.originalFilename}
                    </CardTitle>
                    <CardDescription className="text-[11px] truncate">
                      {selectedAsset.id}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {selectedAsset.visibility}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Large Preview */}
                <div className="aspect-4/3 relative w-full overflow-hidden rounded-lg border bg-muted">
                  {selectedAsset.assetType === 'IMAGE' && selectedAsset.status === 'READY' ? (
                    <Image
                      src={getAdminMediaUrl(selectedAsset.id, { rendition: 'pdp' })}
                      alt={selectedAsset.altText || ''}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <FileIcon className="size-10 text-primary" />
                      <span className="text-xs font-semibold">{selectedAsset.mimeType}</span>
                    </div>
                  )}
                </div>

                {/* Quick Action Toolbar: Download, Copy URL */}
                <div className="flex items-center gap-2">
                  <a
                    href={getAdminMediaUrl(selectedAsset.id, {
                      rendition: 'original',
                      download: true,
                    })}
                    download={selectedAsset.originalFilename}
                    className="flex-1"
                  >
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5">
                      <Download className="size-3.5" />
                      Download Original
                    </Button>
                  </a>

                  {selectedAsset.visibility === 'PUBLIC' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => {
                        const url = `${window.location.origin}/api/media/public/${selectedAsset.id}`;
                        void navigator.clipboard.writeText(url);
                        setMessage('Public media URL copied to clipboard.');
                        setTone('success');
                      }}
                      title="Copy Public URL"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  )}
                </div>

                {/* Lifecycle status alert if failed/quarantined */}
                {selectedAsset.status !== 'READY' && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                    <p className="font-semibold">Processing: {selectedAsset.status}</p>
                    <p className="text-[11px] mt-0.5">
                      {selectedAsset.processingErrorMessage ||
                        'Derivatives are not yet available for storefront delivery.'}
                    </p>
                  </div>
                )}

                {/* Action Buttons: Retry, Archive, Restore, Trash */}
                <div className="flex flex-wrap items-center gap-2">
                  {selectedAsset.status === 'FAILED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => void runAssetAction('retry')}
                      disabled={busy}
                    >
                      <RotateCw className="size-3" /> Retry Processing
                    </Button>
                  )}

                  {selectedAsset.status === 'READY' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => void runAssetAction('archive')}
                      disabled={busy}
                    >
                      <Archive className="size-3" /> Archive
                    </Button>
                  )}

                  {selectedAsset.status === 'TRASHED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => void runAssetAction('restore')}
                      disabled={busy}
                    >
                      <RotateCw className="size-3" /> Restore
                    </Button>
                  )}

                  {selectedAsset.usages.length === 0 &&
                    ['READY', 'ARCHIVED', 'FAILED'].includes(selectedAsset.status) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs gap-1"
                        onClick={() => void runAssetAction('trash')}
                        disabled={busy}
                      >
                        <Trash2 className="size-3" /> Trash Asset
                      </Button>
                    )}
                </div>

                {/* Metadata Form */}
                <form
                  key={`metadata-${selectedAsset.id}`}
                  className="space-y-3 border-t pt-3"
                  onSubmit={(event) => void saveMetadata(event)}
                >
                  <h3 className="text-xs font-semibold text-foreground">Asset Metadata</h3>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Internal Title
                    </label>
                    <Input
                      name="title"
                      defaultValue={selectedAsset.title ?? ''}
                      maxLength={160}
                      className="h-8 text-xs"
                      placeholder="e.g. Lawn Embroidered Kurti — Front"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Alternative Text (Alt Text)
                    </label>
                    <Textarea
                      name="altText"
                      defaultValue={selectedAsset.altText ?? ''}
                      rows={2}
                      maxLength={500}
                      className="text-xs"
                      placeholder="Contextual description for accessibility and search"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Caption
                    </label>
                    <Textarea
                      name="caption"
                      defaultValue={selectedAsset.caption ?? ''}
                      rows={2}
                      maxLength={1000}
                      className="text-xs"
                      placeholder="Optional customer-facing supporting copy"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Internal Notes
                    </label>
                    <Textarea
                      name="internalDescription"
                      defaultValue={selectedAsset.internalDescription ?? ''}
                      rows={3}
                      maxLength={4000}
                      className="text-xs"
                      placeholder="Production, rights, or operational notes"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Visibility Class
                    </label>
                    <select
                      name="visibility"
                      defaultValue={selectedAsset.visibility}
                      className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                    >
                      <option
                        value="PRIVATE"
                        disabled={
                          selectedAsset.visibility === 'PUBLIC' &&
                          ['PROCESSING', 'READY', 'ARCHIVED'].includes(selectedAsset.status)
                        }
                      >
                        Private — internal admin access only
                      </option>
                      <option value="PUBLIC">Public — storefront delivery enabled</option>
                    </select>
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    className="w-full h-8 text-xs"
                    disabled={busy}
                  >
                    Save Metadata
                  </Button>
                </form>

                {/* Organization Form: Folder & Tags */}
                <form
                  key={`org-${selectedAsset.id}`}
                  className="space-y-3 border-t pt-3"
                  onSubmit={(event) => void saveOrganization(event)}
                >
                  <h3 className="text-xs font-semibold text-foreground">Folder & Taxonomy</h3>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Folder
                    </label>
                    <select
                      name="folderId"
                      defaultValue={selectedAsset.folderId ?? ''}
                      className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                    >
                      <option value="">Unfiled</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.assetCount})
                        </option>
                      ))}
                    </select>
                  </div>

                  {tags.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground block">
                        Tags
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              name="tagIds"
                              value={tag.id}
                              defaultChecked={selectedAsset.tags.some((t) => t.id === tag.id)}
                              className="rounded border-input text-primary"
                            />
                            <span>{tag.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    className="w-full h-8 text-xs"
                    disabled={busy}
                  >
                    Save Organization
                  </Button>
                </form>

                {/* Product Placement */}
                <form
                  key={`placement-${selectedAsset.id}`}
                  className="space-y-3 border-t pt-3"
                  onSubmit={(event) => void attach(event)}
                >
                  <h3 className="text-xs font-semibold text-foreground">Attach to Product</h3>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Target Product
                    </label>
                    <select
                      defaultValue=""
                      onChange={(e) => void selectProduct(e.target.value)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                      required
                    >
                      <option value="" disabled>
                        Select a catalog product…
                      </option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  {product && (
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Placement Scope
                      </label>
                      <select
                        value={placementScope}
                        onChange={(event) =>
                          setPlacementScope(event.target.value as PlacementScope)
                        }
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                      >
                        <option value="PRODUCT">Product-level (all variants)</option>
                        <option value="VARIANT">Specific variant</option>
                        <option value="OPTION">Option value gallery</option>
                      </select>
                    </div>
                  )}

                  {product && placementScope === 'VARIANT' && (
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Variant
                      </label>
                      <select
                        name="scopedId"
                        defaultValue=""
                        required
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                      >
                        <option value="">Choose a variant…</option>
                        {product.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.sku}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {product && placementScope === 'OPTION' && (
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Option Value
                      </label>
                      <select
                        name="scopedId"
                        defaultValue=""
                        required
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                      >
                        <option value="">Choose an option value…</option>
                        {product.options.map((axis) => (
                          <optgroup key={axis.id} label={axis.name}>
                            {axis.values
                              .filter((value) => value.status === 'ACTIVE')
                              .map((value) => (
                                <option key={value.id} value={value.id}>
                                  {value.label}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Role
                      </label>
                      <select
                        name="role"
                        defaultValue="GALLERY"
                        className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                      >
                        <option value="GALLERY">Gallery</option>
                        <option value="THUMBNAIL">Cover</option>
                        <option value="COLOR_GALLERY">Color Gallery</option>
                        <option value="SIZE_DIAGRAM">Size Diagram</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Position
                      </label>
                      <Input
                        name="position"
                        type="number"
                        min={0}
                        defaultValue={0}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      name="isPrimary"
                      type="checkbox"
                      className="rounded border-input text-primary"
                    />
                    Make primary for this scope
                  </label>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Placement-specific alternative text
                    </label>
                    <Textarea
                      name="altTextOverride"
                      rows={2}
                      maxLength={500}
                      className="text-xs"
                      placeholder="Optional override for this product placement"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    className="w-full h-8 text-xs"
                    disabled={
                      busy ||
                      !product ||
                      selectedAsset.status !== 'READY' ||
                      selectedAsset.visibility !== 'PUBLIC'
                    }
                  >
                    Attach Placement
                  </Button>
                </form>

                {/* Existing Usages / Placements */}
                <div className="space-y-2 border-t pt-3">
                  <h3 className="text-xs font-semibold text-foreground">Active Placements</h3>
                  {selectedAsset.usages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      This asset is currently unattached (can be safely trashed).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedAsset.usages.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between rounded-md border p-2 text-xs bg-muted/20"
                        >
                          <div>
                            <p className="font-semibold text-foreground">
                              {u.productTitle ?? u.label ?? u.domain}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {u.role ?? 'MEDIA'} · Position {u.position ?? 0}
                              {u.variantSku ? ` · SKU: ${u.variantSku}` : ''}
                            </p>
                          </div>
                          {u.productId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => void detach(u)}
                              title="Detach placement"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-xs p-6 text-center text-muted-foreground">
              <FileImage className="size-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs font-semibold text-foreground">Select an asset</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click any image in the gallery to inspect renditions, manage placements, or update
                metadata.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Health Check Modal */}
      <Dialog open={isHealthOpen} onOpenChange={setIsHealthOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Storage Health Diagnostics
            </DialogTitle>
            <DialogDescription className="text-xs">
              Verified {health?.checkedObjectCount ?? 0} physical storage objects and metadata
              integrity.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div
              className={`rounded-lg p-3 text-xs font-medium border ${
                health?.status === 'HEALTHY'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
              }`}
            >
              Status:{' '}
              <strong className="uppercase">
                {health?.status === 'HEALTHY'
                  ? 'Healthy — All Storage Verified'
                  : 'Degraded — Issues Detected'}
              </strong>
            </div>

            {health?.issues && health.issues.length > 0 && (
              <ScrollArea className="max-h-60 rounded border p-2">
                <div className="space-y-2 text-xs">
                  {health.issues.map((issue, idx) => (
                    <div key={idx} className="border-b pb-2 last:border-b-0">
                      <p className="font-semibold text-destructive">{issue.code}</p>
                      <p className="text-muted-foreground text-[11px]">{issue.detail}</p>
                      <p className="text-[10px] text-muted-foreground/80 font-mono mt-0.5">
                        Asset: {issue.assetId}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setIsHealthOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move To Folder Modal */}
      <Dialog open={isBulkFolderOpen} onOpenChange={setIsBulkFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Move Selected Assets</DialogTitle>
            <DialogDescription className="text-xs">
              Assign {selectedForBulk.size} assets to a destination folder.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <label className="text-xs font-medium block mb-1">Destination Folder</label>
            <select
              value={bulkTargetFolderId}
              onChange={(e) => setBulkTargetFolderId(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
            >
              <option value="">Choose a folder…</option>
              <option value="unfiled">Unfiled (Root)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsBulkFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleBulkMoveToFolder()}
              disabled={!bulkTargetFolderId}
            >
              Move Assets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Modal */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <form onSubmit={(e) => void createLibraryFolder(e)}>
            <DialogHeader>
              <DialogTitle className="text-sm">Create New Folder</DialogTitle>
              <DialogDescription className="text-xs">
                Organize images and documents hierarchically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div>
                <label className="text-xs font-medium block mb-1">Folder Name</label>
                <Input
                  name="name"
                  placeholder="e.g. Eid 2026 Collection"
                  maxLength={120}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">Parent Folder (optional)</label>
                <select
                  name="parentId"
                  defaultValue=""
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none"
                >
                  <option value="">Top Level (Root)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewFolderOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create Folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Tag Modal */}
      <Dialog open={isNewTagOpen} onOpenChange={setIsNewTagOpen}>
        <DialogContent className="max-w-sm">
          <form onSubmit={(e) => void createLibraryTag(e)}>
            <DialogHeader>
              <DialogTitle className="text-sm">Create New Tag</DialogTitle>
              <DialogDescription className="text-xs">
                Add a classification tag across multiple assets.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3">
              <label className="text-xs font-medium block mb-1">Tag Name</label>
              <Input
                name="name"
                placeholder="e.g. Silk, Lookbook, Studio"
                maxLength={80}
                required
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewTagOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create Tag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
