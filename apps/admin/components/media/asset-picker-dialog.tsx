'use client';

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  FileIcon,
  Images,
  UploadCloud,
  X,
} from 'lucide-react';

import type { MediaFolderDto, MediaLibraryItemDto, MediaUploadPolicyDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  bulkOrganizeMedia,
  createMediaFolder,
  getAdminMediaUrl,
  getMediaUploadPolicy,
  listMediaFolders,
  listMediaLibrary,
  uploadMediaFile,
  waitForMediaReady,
} from '@/lib/media/api';
import { mapSettledLimited } from '@/lib/media/concurrency';
import { AssetPickerDialogs } from './asset-picker-dialogs';
import { formatFileSize } from './media-file-size';
import { AssetPickerLibrary } from './asset-picker-library';
import { AssetPickerUpload, type UploadQueueItem } from './asset-picker-upload';

export interface SelectedMediaAsset {
  readonly id: string;
  readonly assetType: 'IMAGE' | 'DOCUMENT';
  readonly filename: string;
  readonly previewUrl: string;
  readonly altText: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface AssetPickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (assets: readonly SelectedMediaAsset[]) => void;
  readonly multiple?: boolean;
  readonly visibility?: 'PUBLIC' | 'PRIVATE';
  readonly assetType?: 'IMAGE' | 'DOCUMENT' | 'ALL';
  readonly targetLabel?: string;
  readonly excludedAssetIds?: readonly string[];
}

const PAGE_SIZE = 40;

function toSelectedAsset(item: MediaLibraryItemDto): SelectedMediaAsset {
  return {
    id: item.id,
    assetType: item.assetType,
    filename: item.originalFilename,
    previewUrl: getAdminMediaUrl(item.id, { rendition: item.assetType === 'IMAGE' ? 'pdp' : 'original' }),
    altText: item.altText,
    width: item.width,
    height: item.height,
  };
}

export function AssetPickerDialog({
  open,
  onOpenChange,
  onSelect,
  multiple = true,
  visibility = 'PUBLIC',
  assetType = 'IMAGE',
  targetLabel,
  excludedAssetIds = [],
}: AssetPickerDialogProps) {
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library');
  const [items, setItems] = useState<readonly MediaLibraryItemDto[]>([]);
  const [folders, setFolders] = useState<readonly MediaFolderDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters & Search
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'unused' | 'used'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Selected Assets
  const [selectedAssets, setSelectedAssets] = useState<Map<string, SelectedMediaAsset>>(new Map());

  // Lightbox / Inspector modal
  const [inspectItem, setInspectItem] = useState<MediaLibraryItemDto | null>(null);

  // New Folder creation
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isSavingFolder, setIsSavingFolder] = useState(false);

  // Upload state
  const [uploadDestinationFolderId, setUploadDestinationFolderId] = useState<string>('unfiled');
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadPolicy, setUploadPolicy] = useState<MediaUploadPolicyDto | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const excludedIds = useMemo(() => new Set(excludedAssetIds), [excludedAssetIds]);

  // Debounced search
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  // Fetch library items
  const fetchLibrary = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await listMediaLibrary({
        page,
        pageSize: PAGE_SIZE,
        status: 'READY',
        ...(assetType === 'ALL' ? {} : { assetType }),
        visibility,
        ...(searchQuery ? { query: searchQuery } : {}),
        ...(selectedFolderId !== 'all'
          ? { folderId: selectedFolderId === 'unfiled' ? 'unfiled' : selectedFolderId }
          : {}),
        ...(usageFilter === 'unused' ? { unused: true } : {}),
        ...(usageFilter === 'used' ? { usage: 'USED' as const } : {}),
        sort: sortBy.toUpperCase() as 'NEWEST' | 'OLDEST' | 'NAME' | 'SIZE',
      });

      if (requestId !== requestIdRef.current) return;

      setItems(response.data);
      setTotalItems(response.pagination.totalItems);
      setTotalPages(Math.max(1, response.pagination.totalPages));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setItems([]);
      setTotalItems(0);
      setTotalPages(1);
      setLoadError(error instanceof Error ? error.message : 'Could not load the media library.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [assetType, page, searchQuery, selectedFolderId, usageFilter, sortBy, visibility]);

  useEffect(() => {
    if (!open) return;
    void fetchLibrary();
  }, [fetchLibrary, open]);

  // Load folders on open
  useEffect(() => {
    if (!open) return;
    setSelectedAssets(new Map());
    setUploadError(null);
    setUploadQueue([]);
    void listMediaFolders().then(setFolders).catch(() => setFolders([]));
    void getMediaUploadPolicy().then(setUploadPolicy).catch((error: unknown) => {
      setUploadPolicy(null);
      setUploadError(error instanceof Error ? error.message : 'Could not load the upload policy.');
    });
  }, [open]);

  // Selection toggle
  const toggleSelect = (item: MediaLibraryItemDto) => {
    if (excludedIds.has(item.id)) return;
    setSelectedAssets((previous) => {
      const next = new Map(multiple ? previous : []);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, toSelectedAsset(item));
      return next;
    });
  };

  const selectAllCurrentPage = () => {
    setSelectedAssets((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (!excludedIds.has(item.id)) {
          next.set(item.id, toSelectedAsset(item));
        }
      }
      return next;
    });
  };

  const clearAllSelected = () => {
    setSelectedAssets(new Map());
  };

  const removeSelectedAsset = (id: string) => {
    setSelectedAssets((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleConfirm = () => {
    onSelect(Array.from(selectedAssets.values()));
    onOpenChange(false);
  };

  // Create folder handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || isSavingFolder) return;
    setIsSavingFolder(true);
    setFolderError(null);
    try {
      const created = await createMediaFolder({ name: newFolderName.trim() });
      setFolders((prev) => [...prev, created]);
      setSelectedFolderId(created.id);
      setUploadDestinationFolderId(created.id);
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Could not create folder.');
    } finally {
      setIsSavingFolder(false);
    }
  };

  // Keep browser, API, and processor load within a predictable upload budget.
  const handleUploadFiles = async (fileList: FileList | readonly File[] | null) => {
    if (!fileList || fileList.length === 0 || isUploading) return;
    if (!uploadPolicy) {
      setUploadError('Upload rules are unavailable. Close and reopen the picker to retry.');
      return;
    }
    const files = Array.from(fileList);
    if (!multiple && files.length > 1) {
      setUploadError('Choose one image for this field.');
      return;
    }
    const supported = files.filter(
      (file) =>
        uploadPolicy.acceptedMimeTypes.includes(file.type as MediaUploadPolicyDto['acceptedMimeTypes'][number]) &&
        (assetType === 'ALL' || (assetType === 'IMAGE' ? file.type.startsWith('image/') : file.type === 'application/pdf')) &&
        file.size > 0 &&
        file.size <= uploadPolicy.maxUploadBytes,
    );

    if (supported.length === 0) {
      setUploadError(`Choose ${assetType === 'DOCUMENT' ? 'PDF documents' : assetType === 'ALL' ? 'JPEG, PNG, WebP, or PDF files' : 'JPEG, PNG, or WebP images'} up to ${formatFileSize(uploadPolicy.maxUploadBytes)} each.`);
      return;
    }

    const queue: UploadQueueItem[] = supported.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      stage: 'QUEUED',
    }));

    setUploadQueue(queue);
    setIsUploading(true);
    setUploadError(supported.length < files.length
      ? `${files.length - supported.length} file(s) were skipped because of format or size. The allowed limit is ${formatFileSize(uploadPolicy.maxUploadBytes)}.`
      : null);

    const newlyReady: SelectedMediaAsset[] = [];

    await mapSettledLimited(queue, 3, async (item) => {
        try {
          setUploadQueue((current) =>
            current.map((q) => (q.id === item.id ? { ...q, stage: 'UPLOADING' } : q)),
          );

          const uploaded = await uploadMediaFile(item.file, {
            visibility,
            title: item.file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText: item.file.name.replace(/\.[^.]+$/, ''),
            onProgress: (progress) =>
              setUploadQueue((current) =>
                current.map((q) => (q.id === item.id ? { ...q, progress } : q)),
              ),
          });

          setUploadQueue((current) =>
            current.map((q) =>
              q.id === item.id
                ? { ...q, stage: 'PROCESSING', assetId: uploaded.assetId }
                : q,
            ),
          );

          // If a destination folder was chosen, organize it
          if (uploadDestinationFolderId && uploadDestinationFolderId !== 'unfiled') {
            await bulkOrganizeMedia({
              assetIds: [uploaded.assetId],
              folderId: uploadDestinationFolderId,
            });
          }

          const status = await waitForMediaReady(uploaded.assetId, { timeoutMs: 90_000 });
          if (status !== 'READY') throw new Error(status === 'PROCESSING'
            ? 'Processing is still running. Find this image in the Media Library later.'
            : 'File processing failed. Check the Media Library for details.');

          setUploadQueue((current) =>
            current.map((q) => (q.id === item.id ? { ...q, stage: 'READY', progress: 100 } : q)),
          );

          newlyReady.push({
            id: uploaded.assetId,
            assetType: item.file.type === 'application/pdf' ? 'DOCUMENT' : 'IMAGE',
            filename: item.file.name,
            previewUrl: getAdminMediaUrl(uploaded.assetId, { rendition: item.file.type === 'application/pdf' ? 'original' : 'pdp' }),
            altText: item.file.name.replace(/\.[^.]+$/, ''),
            width: null,
            height: null,
          });
        } catch (err) {
          setUploadQueue((current) =>
            current.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    stage: 'ERROR',
                    error: err instanceof Error ? err.message : 'Upload failed',
                  }
                : q,
            ),
          );
        }
    });

    setIsUploading(false);

    if (newlyReady.length > 0) {
      setSelectedAssets((prev) => {
        const next = new Map(multiple ? prev : []);
        for (const asset of multiple ? newlyReady : newlyReady.slice(0, 1)) next.set(asset.id, asset);
        return next;
      });
      setPage(1);
      setActiveTab('library');
      await fetchLibrary();
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleUploadFiles(event.dataTransfer.files);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => {
        if (!next && isUploading) return;
        onOpenChange(next);
      }}>
        <DialogContent className="inset-0 top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 [overscroll-behavior:contain] sm:top-1/2 sm:left-1/2 sm:h-[min(90vh,820px)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
          {/* Header */}
          <DialogHeader className="border-b bg-card p-4 pr-14 sm:p-5 sm:pr-16">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold sm:text-lg">
                    Media Library
                  </DialogTitle>
                  <Badge variant="secondary" className="font-mono text-xs font-normal">
                    {totalItems} assets
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  {targetLabel
                    ? `Selecting media for ${targetLabel}. You can change the selection later.`
                    : 'Browse ready files or upload new media.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Tabs: Browse vs Upload */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'library' | 'upload')}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="border-b bg-muted/20 px-4 sm:px-6">
              <TabsList className="h-10 gap-3 bg-transparent p-0">
                <TabsTrigger
                  value="library"
                  className="min-h-9 px-3 text-xs font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary"
                >
                  <Images className="mr-1.5 size-3.5" />
                  Browse Library
                </TabsTrigger>
                <TabsTrigger
                  value="upload"
                  className="min-h-9 px-3 text-xs font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary"
                >
                  <UploadCloud className="mr-1.5 size-3.5" />
                  Upload New
                </TabsTrigger>
              </TabsList>
            </div>

            <AssetPickerLibrary
              items={items}
              folders={folders}
              loading={loading}
              loadError={loadError}
              searchInput={searchInput}
              searchQuery={searchQuery}
              setSearchInput={setSearchInput}
              clearSearch={clearSearch}
              selectedFolderId={selectedFolderId}
              setSelectedFolderId={setSelectedFolderId}
              setIsCreatingFolder={setIsCreatingFolder}
              usageFilter={usageFilter}
              setUsageFilter={setUsageFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              page={page}
              setPage={setPage}
              totalPages={totalPages}
              multiple={multiple}
              selectedAssets={selectedAssets}
              excludedIds={excludedIds}
              selectAllCurrentPage={selectAllCurrentPage}
              clearAllSelected={clearAllSelected}
              fetchLibrary={fetchLibrary}
              setActiveTab={setActiveTab}
              toggleSelect={toggleSelect}
              setInspectItem={setInspectItem}
            />
            <AssetPickerUpload
              folders={folders}
              uploadDestinationFolderId={uploadDestinationFolderId}
              setUploadDestinationFolderId={setUploadDestinationFolderId}
              setIsCreatingFolder={setIsCreatingFolder}
              fileInputRef={fileInputRef}
              multiple={multiple}
              isUploading={isUploading}
              handleUploadFiles={handleUploadFiles}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              handleDrop={handleDrop}
              uploadPolicy={uploadPolicy}
              uploadQueue={uploadQueue}
              uploadError={uploadError}
              assetType={assetType}
            />
          </Tabs>

          {/* Selected Assets Tray & Confirmation Footer */}
          <div className="flex shrink-0 flex-col gap-3 border-t bg-background p-4 sm:px-6">
            {/* Selected Thumbnails Strip */}
            {selectedAssets.size > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                <span className="text-xs font-semibold text-foreground shrink-0">Selected:</span>
                {Array.from(selectedAssets.values()).map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted"
                  >
                    {asset.assetType === 'IMAGE' ? <Image
                      src={asset.previewUrl}
                      alt={asset.filename}
                      fill
                      unoptimized
                      className="object-cover"
                    /> : <FileIcon className="m-auto size-7 text-muted-foreground" aria-hidden="true" />}
                    <button
                      type="button"
                      aria-label={`Remove ${asset.filename} from selection`}
                      className="absolute right-0 top-0 flex size-9 items-center justify-center rounded-bl bg-background/90 text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => removeSelectedAsset(asset.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {selectedAssets.size > 0
                  ? `${selectedAssets.size} image${selectedAssets.size === 1 ? '' : 's'} selected${targetLabel ? ` for ${targetLabel}` : ''}`
                  : 'Select an image to add to your product gallery.'}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={selectedAssets.size === 0}
                  onClick={handleConfirm}
                >
                  Add {selectedAssets.size || ''} {selectedAssets.size === 1 ? 'File' : 'Files'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AssetPickerDialogs
        inspectItem={inspectItem}
        onInspectChange={setInspectItem}
        selectedIds={new Set(selectedAssets.keys())}
        onToggleSelect={toggleSelect}
        isCreatingFolder={isCreatingFolder}
        setIsCreatingFolder={setIsCreatingFolder}
        handleCreateFolder={handleCreateFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        folderError={folderError}
        isSavingFolder={isSavingFolder}
      />
    </>
  );
}
