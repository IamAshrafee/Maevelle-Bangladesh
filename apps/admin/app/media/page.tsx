'use client';

import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FolderIcon,
  FolderPlus,
  LayoutGrid,
  List,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  TagIcon,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AdminPage, ErrorState, PageHeader } from '@/components/ui/page-shell';

import {
  attachProductMedia,
  bulkOrganizeMedia,
  bulkTrashMedia,
  createMediaFolder,
  createMediaTag,
  deleteMediaFolder,
  deleteMediaTag,
  detachProductMedia,
  getMediaUploadPolicy,
  listMediaFolders,
  listMediaLibrary,
  listMediaTags,
  runMediaLifecycleAction,
  trashMediaAsset,
  updateMediaFolder,
  updateMediaMetadata,
  updateMediaOrganization,
  uploadMediaFile,
} from '@/lib/media/api';
import { catalogData, catalogRequest, CatalogRequestError } from '@/lib/catalog/api';
import type { ApiEnvelope } from '@maevelle/contracts';
import { mapSettledLimited } from '@/lib/media/concurrency';
import {
  emptyHealthSummary,
  scanMediaHealth,
  type MediaHealthSummary,
} from '@/lib/media/health-scan';

import { MediaAssetResults } from '@/components/media/media-asset-results';
import { MediaAssetInspector } from '@/components/media/media-asset-inspector';
import { MediaWorkspaceDialogs } from '@/components/media/media-workspace-dialogs';
import type {
  AssetTypeFilter,
  MediaAsset,
  MediaFolder,
  MediaTag,
  MediaUsage,
  Pagination,
  PlacementScope,
  ProductSummary,
  ProductWorkspace,
  SortOption,
  UsageFilter,
} from '@/components/media/media-workspace-types';

export default function MediaPage() {
  const [assets, setAssets] = useState<readonly MediaAsset[]>([]);
  const [products, setProducts] = useState<readonly ProductSummary[]>([]);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [folders, setFolders] = useState<readonly MediaFolder[]>([]);
  const [tags, setTags] = useState<readonly MediaTag[]>([]);

  // Filters & State
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('ALL');
  const [sort, setSort] = useState<SortOption>('NEWEST');
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

  // Feedback, Progress & Loading
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  // Dialog States
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const healthAbort = useRef<AbortController | null>(null);
  const [health, setHealth] = useState<MediaHealthSummary | null>(null);

  const [isBulkFolderOpen, setIsBulkFolderOpen] = useState(false);
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false);
  const [bulkTargetFolderId, setBulkTargetFolderId] = useState('');

  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<MediaFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<MediaFolder | null>(null);

  const [isNewTagOpen, setIsNewTagOpen] = useState(false);
  const [deletingTag, setDeletingTag] = useState<MediaTag | null>(null);

  const loadSupportingData = useCallback(async () => {
    try {
      const [productsResult, foldersData, tagsData] = await Promise.all([
        catalogRequest<ApiEnvelope<readonly ProductSummary[]>>('/admin/catalog/products')
          .then((res) => ({ ok: true as const, data: res.data }))
          .catch((err: unknown) => {
            const isForbidden = err instanceof CatalogRequestError && err.status === 403;
            return {
              ok: false as const,
              error: isForbidden
                ? 'Catalog access is required to attach media to products.'
                : 'Products could not be loaded. Refresh the library to retry.',
              data: [] as readonly ProductSummary[],
            };
          }),
        listMediaFolders(),
        listMediaTags(),
      ]);

      setProducts(productsResult.data);
      setProductLoadError(productsResult.ok ? null : productsResult.error);
      setFolders(foldersData);
      setTags(tagsData);
    } catch {
      setFolders([]);
      setTags([]);
    }
  }, []);

  const refreshSupportingData = useCallback(() => {
    void loadSupportingData();
  }, [loadSupportingData]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const mediaPayload = await listMediaLibrary<MediaAsset>({
        page,
        pageSize: 32,
        sort,
        ...(deferredSearchQuery.trim() ? { query: deferredSearchQuery.trim() } : {}),
        ...(lifecycleFilter ? { status: lifecycleFilter } : {}),
        ...(visibilityFilter ? { visibility: visibilityFilter as 'PUBLIC' | 'PRIVATE' } : {}),
        ...(assetTypeFilter ? { assetType: assetTypeFilter } : {}),
        ...(selectedFolderId ? { folderId: selectedFolderId } : {}),
        ...(usageFilter !== 'ALL' ? { usage: usageFilter } : {}),
      });

      if (requestId !== loadRequestId.current) return;
      setAssets(mediaPayload.data);
      setPagination(mediaPayload.pagination);
      setSelectedAssetId((current) =>
        mediaPayload.data.some((asset) => asset.id === current)
          ? current
          : (mediaPayload.data[0]?.id ?? ''),
      );
    } catch (error) {
      if (requestId === loadRequestId.current) {
        setLoadError(error instanceof Error ? error.message : 'Media library could not be loaded.');
        setAssets([]);
        setSelectedAssetId('');
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [
    deferredSearchQuery,
    lifecycleFilter,
    visibilityFilter,
    assetTypeFilter,
    selectedFolderId,
    usageFilter,
    sort,
    page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    refreshSupportingData();
  }, [refreshSupportingData]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId),
    [assets, selectedAssetId],
  );

  useEffect(() => {
    setProduct(null);
    setPlacementScope('PRODUCT');
  }, [selectedAssetId]);

  async function checkHealth() {
    const controller = new AbortController();
    healthAbort.current = controller;
    setBusy(true);
    setIsHealthOpen(true);
    setHealth(emptyHealthSummary);
    try {
      const result = await scanMediaHealth(fetch, controller.signal, setHealth);
      setMessage(
        result.status === 'HEALTHY'
          ? `Media scan completed: ${result.verifiedObjectCount} storage records verified without issues.`
          : `Media scan completed with ${result.issueCount} issue${result.issueCount === 1 ? '' : 's'}.`,
      );
      setTone(result.status === 'HEALTHY' ? 'success' : 'warning');
    } catch (error) {
      if (controller.signal.aborted) return;
      setHealth((prev) => ({
        ...(prev ?? emptyHealthSummary),
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Media health scan failed.',
      }));
      setMessage(error instanceof Error ? error.message : 'Media health check could not run.');
      setTone('danger');
    } finally {
      if (healthAbort.current === controller) healthAbort.current = null;
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
      const productWorkspace = await catalogData<ProductWorkspace>(
        `/admin/catalog/products/${encodeURIComponent(productId)}`,
      );
      setProduct(productWorkspace);
      setPlacementScope('PRODUCT');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product could not be loaded.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleFilesUpload(
    files: FileList | readonly File[] | null,
    initialVisibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC',
  ) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setBusy(true);
    setMessage('');
    try {
      const policy = await getMediaUploadPolicy();
      const validFiles = fileList.filter(
        (file) =>
          policy.acceptedMimeTypes.includes(file.type as (typeof policy.acceptedMimeTypes)[number]) &&
          file.size > 0 &&
          file.size <= policy.maxUploadBytes,
      );
      const skipped = fileList.length - validFiles.length;
      if (validFiles.length === 0) {
        throw new Error(
          `Supported formats: JPEG, PNG, WebP, PDF up to ${Math.ceil(policy.maxUploadBytes / 1024 / 1024)} MB each.`,
        );
      }

      const progress = new Map<number, number>();
      const results = await mapSettledLimited(validFiles, 3, (file, index) =>
        uploadMediaFile(file, {
          visibility: initialVisibility,
          title: file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
          altText: null,
          onProgress: (val) => {
            progress.set(index, val);
            setUploadProgress(
              Math.round(
                Array.from(
                  { length: validFiles.length },
                  (_, fileIndex) => progress.get(fileIndex) ?? 0,
                ).reduce((sum, curr) => sum + curr, 0) / validFiles.length,
              ),
            );
          },
        }),
      );

      const uploaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const failed = results.length - uploaded.length;

      setMessage(
        `${uploaded.length} asset${uploaded.length === 1 ? '' : 's'} uploaded and queued for processing${
          failed ? `; ${failed} failed` : ''
        }${skipped ? `; ${skipped} skipped (unsupported format or over limit)` : ''}.`,
      );
      setTone(failed || skipped ? 'warning' : 'success');
      if (uploaded[0]) setSelectedAssetId(uploaded[0].assetId);
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
      setTone('danger');
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  }

  // Drag and Drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      void handleFilesUpload(files);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]'))
      return;
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
      void handleFilesUpload(files);
    }
  };

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await updateMediaMetadata(selectedAsset.id, {
        version: selectedAsset.version,
        title: String(data.get('title') ?? '').trim() || null,
        altText: String(data.get('altText') ?? '').trim() || null,
        caption: String(data.get('caption') ?? '').trim() || null,
        internalDescription: String(data.get('internalDescription') ?? '').trim() || null,
        visibility: (data.get('visibility') as 'PUBLIC' | 'PRIVATE') || 'PUBLIC',
      });
      setMessage('Media metadata and visibility updated successfully.');
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media metadata could not be saved.');
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
      await updateMediaOrganization(selectedAsset.id, {
        version: selectedAsset.version,
        folderId: folderId || null,
        tagIds: data.getAll('tagIds').map(String),
      });
      setMessage('Folder and taxonomy tags updated.');
      setTone('success');
      await load();
      refreshSupportingData();
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
      await attachProductMedia(product.id, {
        assetId: selectedAsset.id,
        role: (data.get('role') as 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM') || 'GALLERY',
        position: Number(data.get('position') ?? 0),
        ...(placementScope === 'VARIANT' && scopedId ? { variantId: scopedId } : {}),
        ...(placementScope === 'OPTION' && scopedId ? { optionValueId: scopedId } : {}),
        isPrimary: data.get('isPrimary') === 'on',
        altTextOverride: String(data.get('altTextOverride') ?? '').trim() || null,
      });
      setMessage(`Asset attached to "${product.title}".`);
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media placement failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function detach(usage: MediaUsage) {
    if (!usage.productId) return;
    if (!window.confirm(`Detach placement from ${usage.productTitle ?? usage.label ?? 'product'}?`))
      return;
    setBusy(true);
    try {
      await detachProductMedia(usage.productId, usage.id);
      setMessage('Media placement detached safely.');
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Media placement could not be removed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function runAssetAction(
    action:
      | 'retry'
      | 'retry-import'
      | 'repair-renditions'
      | 'retry-purge'
      | 'archive'
      | 'trash'
      | 'restore',
  ) {
    if (!selectedAsset) return;
    if (
      action === 'trash' &&
      !window.confirm(`Move "${selectedAsset.title || selectedAsset.originalFilename}" to trash?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      if (action === 'trash') {
        await trashMediaAsset(selectedAsset.id);
      } else {
        await runMediaLifecycleAction(selectedAsset.id, action);
      }
      setMessage(
        action === 'retry'
          ? 'Media processing queued for retry.'
          : action === 'retry-import'
            ? 'External image import queued for retry.'
            : action === 'repair-renditions'
              ? 'Missing public image renditions queued for regeneration.'
              : action === 'retry-purge'
                ? 'Media purge queued for retry.'
                : action === 'archive'
                  ? 'Asset archived.'
                  : action === 'restore'
                    ? 'Asset restored from trash.'
                    : 'Unused asset moved to trash.',
      );
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Asset ${action} failed.`);
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  // Folder CRUD
  async function createLibraryFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const parentId = String(form.get('parentId') ?? '') || null;
    if (!name) return;
    setBusy(true);
    try {
      await createMediaFolder({ name, parentId });
      setIsNewFolderOpen(false);
      setMessage(`Folder "${name}" created.`);
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Folder could not be created.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateFolder(folderId: string, version: number, name: string) {
    setBusy(true);
    try {
      await updateMediaFolder(folderId, { version, name });
      setEditingFolder(null);
      setMessage(`Folder renamed to "${name}".`);
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Folder could not be renamed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFolder(folderId: string) {
    setBusy(true);
    try {
      await deleteMediaFolder(folderId);
      setDeletingFolder(null);
      if (selectedFolderId === folderId) setSelectedFolderId('');
      setMessage('Folder deleted. Contained assets are now unfiled.');
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Folder could not be deleted.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  // Tag CRUD
  async function createLibraryTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    try {
      await createMediaTag({ name });
      setIsNewTagOpen(false);
      setMessage(`Tag "#${name}" created.`);
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tag could not be created.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTag(tagId: string) {
    setBusy(true);
    try {
      await deleteMediaTag(tagId);
      setDeletingTag(null);
      setMessage('Tag deleted.');
      setTone('success');
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tag could not be deleted.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  // Bulk Operations
  const handleToggleSelectAll = () => {
    setSelectedForBulk((current) => {
      const next = new Set(current);
      if (assets.every((asset) => next.has(asset.id))) {
        for (const asset of assets) next.delete(asset.id);
      } else {
        for (const asset of assets) next.add(asset.id);
      }
      return next;
    });
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
        `Move ${selectedForBulk.size} selected asset(s) to trash? Unused assets will be trashed; in-use assets will be safely skipped.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await bulkTrashMedia(Array.from(selectedForBulk));
      setMessage(
        `Bulk trash complete: ${result.trashedCount} trashed${
          result.skippedInUseCount > 0
            ? `, ${result.skippedInUseCount} skipped because they are attached to products/conversations`
            : ''
        }.`,
      );
      setTone(result.skippedInUseCount > 0 ? 'warning' : 'success');
      setSelectedForBulk(new Set());
      await load();
      refreshSupportingData();
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
      setMessage(`Moved ${result.updatedCount} asset(s) to destination folder.`);
      setTone('success');
      setIsBulkFolderOpen(false);
      setSelectedForBulk(new Set());
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk move failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkManageTags = async (addTagIds: string[], removeTagIds: string[]) => {
    if (selectedForBulk.size === 0) return;
    setBusy(true);
    try {
      const result = await bulkOrganizeMedia({
        assetIds: Array.from(selectedForBulk),
        ...(addTagIds.length > 0 ? { addTagIds } : {}),
        ...(removeTagIds.length > 0 ? { removeTagIds } : {}),
      });
      setMessage(`Updated taxonomy tags across ${result.updatedCount} asset(s).`);
      setTone('success');
      setIsBulkTagOpen(false);
      setSelectedForBulk(new Set());
      await load();
      refreshSupportingData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk tag update failed.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipProvider delay={200}>
      <AdminPage
        className="min-h-screen relative"
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Full-screen Drag and Drop Overlay */}
        <AnimatePresence>
          {isDraggingOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm border-2 border-dashed border-primary pointer-events-none"
            >
              <div className="flex flex-col items-center gap-3 p-8 text-center bg-card rounded-2xl shadow-lg border border-border">
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UploadCloud className="size-8" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Drop files to upload</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Upload JPEG, PNG, WebP, or PDF files. Images will be processed into multi-size WebP
                  derivatives.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <PageHeader className="flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Media Library
              </h1>
              <Badge variant="outline" className="font-mono text-xs tabular-nums text-muted-foreground">
                {pagination.totalItems} assets
              </Badge>
            </div>
            <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
              Centralized digital asset management, multi-rendition delivery, and product catalog
              attachments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton
              size="icon-sm"
              loading={loading}
              onRefresh={() => {
                void load();
                refreshSupportingData();
              }}
              tooltip="Refresh media library"
            />

            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs"
                  onClick={() => void checkHealth()}
                  disabled={busy}
                >
                  <ShieldCheck className="size-3.5 text-primary" />
                  Storage Health
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-xs">
                Inspect physical storage objects, verify byte sizes, and identify stale purge claims.
              </TooltipContent>
            </Tooltip>

            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs shadow-xs"
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
              onChange={(e) => {
                void handleFilesUpload(e.target.files);
                e.currentTarget.value = '';
              }}
            />
          </div>
        </PageHeader>

        {/* Notification Banner */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              role={tone === 'danger' ? 'alert' : 'status'}
              aria-live="polite"
              className={`flex items-center justify-between rounded-xl p-3 text-xs font-medium border shadow-2xs ${
                tone === 'danger'
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : tone === 'warning'
                    ? 'bg-warning/10 border-warning/30 text-warning'
                    : 'bg-success/10 border-success/30 text-success'
              }`}
            >
              <span>{message}</span>
              <button
                type="button"
                className="hover:opacity-75 p-0.5 rounded"
                onClick={() => setMessage('')}
                aria-label="Dismiss feedback"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload Progress Banner */}
        <AnimatePresence>
          {uploadProgress !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Card className="border-primary/30 bg-primary-subtle shadow-xs">
                <CardContent className="flex items-center gap-3 p-3">
                  <LoaderCircle className="size-4 animate-spin text-primary shrink-0" />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        Uploading files… ({uploadProgress}%)
                      </span>
                      <span className="font-mono text-muted-foreground">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-border/50 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="bg-primary h-full transition-[width] duration-150"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Folder Pills Strip */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Button
            type="button"
            variant={selectedFolderId === '' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs shrink-0 rounded-lg gap-1.5"
            onClick={() => {
              setSelectedFolderId('');
              setPage(1);
            }}
          >
            <FolderIcon className="size-3" />
            All Media
            <span className="font-mono text-[10px] opacity-75">({pagination.totalItems})</span>
          </Button>

          <Button
            type="button"
            variant={selectedFolderId === 'unfiled' ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs shrink-0 rounded-lg gap-1.5"
            onClick={() => {
              setSelectedFolderId('unfiled');
              setPage(1);
            }}
          >
            Unfiled
          </Button>

          {folders.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            return (
              <div key={folder.id} className="inline-flex items-center shrink-0">
                <Button
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs rounded-l-lg rounded-r-none border-r-0 gap-1.5"
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setPage(1);
                  }}
                >
                  <FolderIcon className="size-3" />
                  {folder.name}
                  <span className="font-mono text-[10px] opacity-75">({folder.assetCount})</span>
                </Button>
                <Button
                  type="button"
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 px-1.5 text-xs rounded-r-lg rounded-l-none"
                  onClick={() => setEditingFolder(folder)}
                  title={`Rename "${folder.name}"`}
                  aria-label={`Rename "${folder.name}"`}
                >
                  <span className="sr-only">Edit</span>
                  ···
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs shrink-0 gap-1 text-primary hover:text-primary"
            onClick={() => setIsNewFolderOpen(true)}
          >
            <FolderPlus className="size-3.5" />
            New Folder
          </Button>
        </div>

        {/* Search & Filter Toolbar */}
        <Card className="shadow-xs border-border bg-card">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  aria-label="Search media assets"
                  placeholder="Search filenames, alt text, internal titles, or asset IDs… (Press /)"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 bg-card pl-8 text-xs pr-8"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Asset Type Filter */}
              <NativeSelect
                value={assetTypeFilter}
                onChange={(e) => {
                  setAssetTypeFilter(e.target.value as AssetTypeFilter);
                  setPage(1);
                }}
                aria-label="Filter by asset format"
                className="w-full text-xs sm:w-auto"
              >
                <NativeSelectOption value="">All Formats</NativeSelectOption>
                <NativeSelectOption value="IMAGE">Images Only</NativeSelectOption>
                <NativeSelectOption value="DOCUMENT">Documents (PDF)</NativeSelectOption>
              </NativeSelect>

              {/* Status filter */}
              <NativeSelect
                value={lifecycleFilter}
                onChange={(e) => {
                  setLifecycleFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by lifecycle status"
                className="w-full text-xs sm:w-auto"
              >
                <NativeSelectOption value="">All Lifecycles</NativeSelectOption>
                <NativeSelectOption value="READY">Ready</NativeSelectOption>
                <NativeSelectOption value="PROCESSING">Processing</NativeSelectOption>
                <NativeSelectOption value="PENDING_UPLOAD">Pending</NativeSelectOption>
                <NativeSelectOption value="FAILED">Failed</NativeSelectOption>
                <NativeSelectOption value="QUARANTINED">Quarantined</NativeSelectOption>
                <NativeSelectOption value="ARCHIVED">Archived</NativeSelectOption>
                <NativeSelectOption value="TRASHED">Trash</NativeSelectOption>
                <NativeSelectOption value="PURGING">Purging</NativeSelectOption>
              </NativeSelect>

              {/* Visibility filter */}
              <NativeSelect
                value={visibilityFilter}
                onChange={(e) => {
                  setVisibilityFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by visibility"
                className="w-full text-xs sm:w-auto"
              >
                <NativeSelectOption value="">All Visibility</NativeSelectOption>
                <NativeSelectOption value="PUBLIC">Public</NativeSelectOption>
                <NativeSelectOption value="PRIVATE">Private</NativeSelectOption>
              </NativeSelect>

              {/* Usage filter */}
              <NativeSelect
                value={usageFilter}
                onChange={(e) => {
                  setUsageFilter(e.target.value as UsageFilter);
                  setPage(1);
                }}
                aria-label="Filter by use"
                className="w-full text-xs sm:w-auto"
              >
                <NativeSelectOption value="ALL">All Uses</NativeSelectOption>
                <NativeSelectOption value="USED">Attached (In Use)</NativeSelectOption>
                <NativeSelectOption value="UNUSED">Unattached (Unused)</NativeSelectOption>
              </NativeSelect>

              {/* Sort filter */}
              <NativeSelect
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortOption);
                  setPage(1);
                }}
                aria-label="Sort media assets"
                className="w-full text-xs sm:w-auto"
              >
                <NativeSelectOption value="NEWEST">Newest First</NativeSelectOption>
                <NativeSelectOption value="OLDEST">Oldest First</NativeSelectOption>
                <NativeSelectOption value="NAME">Name A–Z</NativeSelectOption>
                <NativeSelectOption value="SIZE">Size (Largest)</NativeSelectOption>
              </NativeSelect>

              {/* View Mode Toggle */}
              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 shrink-0">
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={`size-8 rounded-md transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-card text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setViewMode('grid')}
                      aria-label="Grid view"
                      aria-pressed={viewMode === 'grid'}
                    >
                      <LayoutGrid className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Grid View</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={`size-8 rounded-md transition-colors ${
                        viewMode === 'list'
                          ? 'bg-card text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setViewMode('list')}
                      aria-label="List view"
                      aria-pressed={viewMode === 'list'}
                    >
                      <List className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">List View</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Sub-bar: Tag filters and active summary */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Tags:</span>
                {tags.length > 0 ? (
                  tags.slice(0, 8).map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className="cursor-pointer hover:border-primary/50 text-[11px]"
                      onClick={() => {
                        setSearchQuery(tag.name);
                        setPage(1);
                      }}
                    >
                      #{tag.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[11px] text-muted-foreground">No tags defined</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] text-primary"
                  onClick={() => setIsNewTagOpen(true)}
                >
                  <TagIcon className="size-3 mr-1" />
                  New Tag
                </Button>
              </div>

              <div className="font-mono tabular-nums text-[11px]">
                Showing {assets.length} of {pagination.totalItems} assets (Page {pagination.page} of{' '}
                {Math.max(1, pagination.totalPages)})
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Floating Bulk Action Bar */}
        <AnimatePresence>
          {selectedForBulk.size > 0 && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="sticky bottom-6 z-30 mx-auto max-w-xl"
            >
              <Card className="border-primary bg-background/95 backdrop-blur-md shadow-lg rounded-2xl overflow-hidden ring-1 ring-primary/20">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground font-semibold text-xs px-2.5 py-0.5">
                      {selectedForBulk.size} selected
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">across library</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => setIsBulkFolderOpen(true)}
                    >
                      <FolderIcon className="size-3.5" />
                      Move to Folder
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => setIsBulkTagOpen(true)}
                    >
                      <TagIcon className="size-3.5" />
                      Manage Tags
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => void handleBulkTrash()}
                    >
                      <Trash2 className="size-3.5" />
                      Trash Unused
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setSelectedForBulk(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Workspace Grid (Left: Assets, Right: Inspector) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Asset Gallery */}
          <div className="lg:col-span-8 space-y-4">
            <Card className="shadow-xs overflow-hidden border-border bg-card">
              <CardHeader className="p-3 sm:p-4 border-b border-border flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    checked={assets.length > 0 && assets.every((asset) => selectedForBulk.has(asset.id))}
                    onCheckedChange={handleToggleSelectAll}
                    aria-label="Select all assets on this page"
                  />
                  <span className="text-xs font-semibold text-foreground">Select All on Page</span>
                </div>

                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>Drag & drop or paste (Ctrl+V) anywhere</span>
                </div>
              </CardHeader>

              <CardContent className="min-h-[420px] p-4">
                {loadError ? (
                  <ErrorState message={loadError} onRetry={() => void load()} />
                ) : (
                  <MediaAssetResults
                    assets={assets}
                    loading={loading}
                    viewMode={viewMode}
                    selectedAssetId={selectedAssetId}
                    selectedForBulk={selectedForBulk}
                    onInspect={(assetId) => {
                      setSelectedAssetId(assetId);
                      if (window.matchMedia('(max-width: 1023px)').matches) {
                        window.requestAnimationFrame(() =>
                          document.getElementById('media-inspector')?.focus(),
                        );
                      }
                    }}
                    onToggleBulk={handleToggleSelectItem}
                  />
                )}
              </CardContent>

              {/* Pagination footer */}
              <CardFooter className="p-3.5 border-t border-border flex flex-row items-center justify-between bg-muted/10">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((c) => Math.max(1, c - 1))}
                >
                  Previous
                </Button>

                <span className="text-xs font-mono tabular-nums text-muted-foreground">
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

          {/* Right Column: Asset Inspector */}
          <MediaAssetInspector
            selectedAsset={selectedAsset}
            busy={busy}
            folders={folders}
            tags={tags}
            products={products}
            productLoadError={productLoadError}
            product={product}
            placementScope={placementScope}
            setPlacementScope={setPlacementScope}
            selectProduct={selectProduct}
            saveMetadata={saveMetadata}
            saveOrganization={saveOrganization}
            attach={attach}
            detach={detach}
            runAssetAction={runAssetAction}
            onOpenNewFolder={() => setIsNewFolderOpen(true)}
            onOpenNewTag={() => setIsNewTagOpen(true)}
            onCopyPublicUrl={() => {
              if (!selectedAsset) return;
              const url = `${window.location.origin}/api/media/public/${selectedAsset.id}?rendition=pdp`;
              void navigator.clipboard
                .writeText(url)
                .then(() => {
                  setMessage('Public CDN delivery URL copied to clipboard.');
                  setTone('success');
                })
                .catch(() => {
                  setMessage('Could not copy the public URL.');
                  setTone('danger');
                });
            }}
          />
        </div>

        {/* Dialogs */}
        <MediaWorkspaceDialogs
          health={health}
          isHealthOpen={isHealthOpen}
          onHealthOpenChange={(open) => {
            if (!open) healthAbort.current?.abort();
            setIsHealthOpen(open);
          }}
          isBulkFolderOpen={isBulkFolderOpen}
          setIsBulkFolderOpen={setIsBulkFolderOpen}
          isBulkTagOpen={isBulkTagOpen}
          setIsBulkTagOpen={setIsBulkTagOpen}
          isNewFolderOpen={isNewFolderOpen}
          setIsNewFolderOpen={setIsNewFolderOpen}
          isNewTagOpen={isNewTagOpen}
          setIsNewTagOpen={setIsNewTagOpen}
          editingFolder={editingFolder}
          setEditingFolder={setEditingFolder}
          deletingFolder={deletingFolder}
          setDeletingFolder={setDeletingFolder}
          deletingTag={deletingTag}
          setDeletingTag={setDeletingTag}
          bulkTargetFolderId={bulkTargetFolderId}
          setBulkTargetFolderId={setBulkTargetFolderId}
          selectedCount={selectedForBulk.size}
          folders={folders}
          tags={tags}
          handleBulkMoveToFolder={handleBulkMoveToFolder}
          handleBulkManageTags={handleBulkManageTags}
          createLibraryFolder={createLibraryFolder}
          updateLibraryFolder={handleUpdateFolder}
          deleteLibraryFolder={handleDeleteFolder}
          createLibraryTag={createLibraryTag}
          deleteLibraryTag={handleDeleteTag}
        />
      </AdminPage>
    </TooltipProvider>
  );
}
