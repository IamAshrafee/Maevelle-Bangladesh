'use client';

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileIcon,
  Filter,
  FolderIcon,
  FolderPlus,
  ImageIcon,
  Images,
  Info,
  Layers,
  LoaderCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
} from 'lucide-react';

import type { MediaFolderDto, MediaLibraryItemDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  bulkOrganizeMedia,
  createMediaFolder,
  getAdminMediaUrl,
  listMediaFolders,
  listMediaLibrary,
  uploadMediaFile,
  waitForMediaReady,
} from '@/lib/media/api';

export interface SelectedMediaAsset {
  readonly id: string;
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

interface UploadQueueItem {
  id: string;
  file: File;
  progress: number;
  stage: 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR';
  error?: string;
  assetId?: string;
}

function toSelectedAsset(item: MediaLibraryItemDto): SelectedMediaAsset {
  return {
    id: item.id,
    filename: item.originalFilename,
    previewUrl: getAdminMediaUrl(item.id, { rendition: 'pdp' }),
    altText: item.altText,
    width: item.width,
    height: item.height,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      });

      if (requestId !== requestIdRef.current) return;

      let fetched = response.data;
      // Client-side sort if needed
      if (sortBy === 'name') {
        fetched = [...fetched].sort((a, b) =>
          (a.title || a.originalFilename).localeCompare(b.title || b.originalFilename),
        );
      } else if (sortBy === 'size') {
        fetched = [...fetched].sort((a, b) => b.byteSize - a.byteSize);
      } else if (sortBy === 'oldest') {
        fetched = [...fetched].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      }

      setItems(fetched);
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

  // High speed concurrent uploading
  const handleUploadFiles = async (fileList: FileList | readonly File[] | null) => {
    if (!fileList || fileList.length === 0 || isUploading) return;
    const files = Array.from(fileList);
    const supported = files.filter(
      (file) =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
        file.size > 0 &&
        file.size <= 10 * 1024 * 1024,
    );

    if (supported.length === 0) {
      setUploadError('Please select JPEG, PNG, or WebP images smaller than 10 MB.');
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
    setUploadError(null);

    const newlyReady: SelectedMediaAsset[] = [];

    // Parallel concurrent uploads
    await Promise.all(
      queue.map(async (item) => {
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
            }).catch(() => undefined);
          }

          const status = await waitForMediaReady(uploaded.assetId, { timeoutMs: 90_000 });
          if (status !== 'READY') throw new Error('Processing failed');

          setUploadQueue((current) =>
            current.map((q) => (q.id === item.id ? { ...q, stage: 'READY', progress: 100 } : q)),
          );

          newlyReady.push({
            id: uploaded.assetId,
            filename: item.file.name,
            previewUrl: getAdminMediaUrl(uploaded.assetId, { rendition: 'pdp' }),
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
      }),
    );

    setIsUploading(false);

    if (newlyReady.length > 0) {
      setSelectedAssets((prev) => {
        const next = new Map(multiple ? prev : []);
        for (const asset of newlyReady) next.set(asset.id, asset);
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
      <Dialog open={open} onOpenChange={onOpenChange}>
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
                    ? `Selecting media for ${targetLabel}. You can assign or reorder images anytime.`
                    : 'Browse ready images or upload new media for your products.'}
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

            {/* TAB: Browse Library */}
            <TabsContent value="library" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Filter & Search Toolbar */}
              <div className="flex flex-col gap-2.5 border-b bg-muted/10 p-3 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {/* Search Input */}
                  <div className="relative min-w-0 flex-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      name="media-search"
                      type="search"
                      autoComplete="off"
                      placeholder="Search filename, title, alt text…"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="h-9 bg-background pl-9 pr-9 text-xs"
                      aria-label="Search media library"
                    />
                    {searchInput ? (
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={clearSearch}
                        aria-label="Clear search"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>

                  {/* Folder Selector + New Folder Button */}
                  <div className="flex items-center gap-1.5 sm:w-64">
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <NativeSelect
                      size="sm"
                      value={selectedFolderId}
                      onChange={(e) => {
                        setSelectedFolderId(e.target.value);
                        setPage(1);
                      }}
                      className="h-9 w-full text-xs"
                      aria-label="Filter by folder"
                    >
                      <NativeSelectOption value="all">All folders</NativeSelectOption>
                      <NativeSelectOption value="unfiled">Unfiled</NativeSelectOption>
                      {folders.map((folder) => (
                        <NativeSelectOption key={folder.id} value={folder.id}>
                          {folder.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-2 text-xs"
                      title="Create new folder"
                      onClick={() => setIsCreatingFolder(true)}
                    >
                      <FolderPlus className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Secondary Filter strip (Usage, Sorting, Select All) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-[11px]">Filter:</span>
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        usageFilter === 'all'
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => {
                        setUsageFilter('all');
                        setPage(1);
                      }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        usageFilter === 'unused'
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => {
                        setUsageFilter('unused');
                        setPage(1);
                      }}
                    >
                      Unused Only
                    </button>

                    <span className="ml-2 text-muted-foreground text-[11px]">Sort:</span>
                    <NativeSelect
                      size="sm"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'name' | 'size')}
                      className="h-7 w-auto py-0 text-xs"
                    >
                      <NativeSelectOption value="newest">Newest first</NativeSelectOption>
                      <NativeSelectOption value="oldest">Oldest first</NativeSelectOption>
                      <NativeSelectOption value="name">Name (A-Z)</NativeSelectOption>
                      <NativeSelectOption value="size">File size</NativeSelectOption>
                    </NativeSelect>
                  </div>

                  {multiple && items.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={selectAllCurrentPage}
                      >
                        <CheckSquare className="size-3" />
                        <span>Select page</span>
                      </Button>
                      {selectedAssets.size > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={clearAllSelected}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Main Library Grid */}
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4 sm:p-6">
                  {loading ? (
                    <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground" aria-live="polite">
                      <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden="true" />
                      <span className="text-xs">Loading media assets…</span>
                    </div>
                  ) : loadError ? (
                    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                      <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Failed to load media</p>
                        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{loadError}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => void fetchLibrary()}>
                        Try Again
                      </Button>
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                      <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">No matching images found</p>
                        <p className="mt-1 max-w-sm text-xs">
                          {searchQuery || selectedFolderId !== 'all' || usageFilter !== 'all'
                            ? 'Try clearing the search query or changing your filters.'
                            : 'Upload images to start your media library.'}
                        </p>
                      </div>
                      {searchQuery || selectedFolderId !== 'all' || usageFilter !== 'all' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            clearSearch();
                            setSelectedFolderId('all');
                            setUsageFilter('all');
                          }}
                        >
                          Clear All Filters
                        </Button>
                      ) : (
                        <Button type="button" size="sm" onClick={() => setActiveTab('upload')}>
                          Upload Photos
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                      {items.map((item) => {
                        const selected = selectedAssets.has(item.id);
                        const excluded = excludedIds.has(item.id);

                        return (
                          <div
                            key={item.id}
                            className={`group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-[border-color,box-shadow] duration-150 ${
                              selected
                                ? 'border-primary ring-2 ring-primary ring-offset-1'
                                : excluded
                                  ? 'opacity-50 border-border/40'
                                  : 'hover:border-primary/60'
                            }`}
                          >
                            {/* Clickable Image Box */}
                            <button
                              type="button"
                              disabled={excluded}
                              aria-pressed={selected}
                              onClick={() => toggleSelect(item)}
                              className="relative aspect-3/4 w-full cursor-pointer overflow-hidden bg-muted outline-none disabled:cursor-not-allowed"
                            >
                              {item.assetType === 'IMAGE' ? (
                                <Image
                                  src={getAdminMediaUrl(item.id, { rendition: 'thumbnail' })}
                                  alt={item.altText || item.originalFilename}
                                  fill
                                  unoptimized
                                  className="object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                                />
                              ) : (
                                <div className="flex size-full items-center justify-center">
                                  <FileIcon className="size-10 text-muted-foreground" aria-hidden="true" />
                                </div>
                              )}

                              {/* Selection Indicator Checkbox */}
                              <span
                                className={`absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded border transition-colors shadow-xs ${
                                  selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-white/60 bg-black/40 text-white group-hover:bg-black/60'
                                }`}
                              >
                                {selected ? <Check className="size-3.5 stroke-[3]" /> : null}
                              </span>

                              {excluded && (
                                <Badge className="absolute right-2 top-2 bg-background/90 text-foreground text-[10px] shadow-xs">
                                  Already added
                                </Badge>
                              )}

                              {item.width && item.height && (
                                <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                                  {item.width}×{item.height}
                                </span>
                              )}
                            </button>

                            {/* Info & Inspect Bar */}
                            <div className="flex items-center justify-between border-t bg-card p-2">
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-foreground">
                                  {item.title || item.originalFilename}
                                </span>
                                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                                  {formatFileSize(item.byteSize)}
                                  {item.usageCount > 0 ? ` · ${item.usageCount}× used` : ' · unused'}
                                </span>
                              </div>

                              {/* Lightbox / Inspect Button */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="size-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Inspect high-res preview and details"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInspectItem(item);
                                }}
                              >
                                <Eye className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Pagination Bar */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t bg-card px-4 py-2 sm:px-6">
                  <p className="font-mono text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((current) => current - 1)}
                    >
                      <ChevronLeft aria-hidden="true" /> Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB: Upload New */}
            <TabsContent value="upload" className="m-0 flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <FolderIcon className="size-4 text-primary" />
                  <span className="font-medium text-foreground">Upload into folder:</span>
                </div>
                <div className="flex items-center gap-2">
                  <NativeSelect
                    size="sm"
                    value={uploadDestinationFolderId}
                    onChange={(e) => setUploadDestinationFolderId(e.target.value)}
                    className="h-8 text-xs"
                  >
                    <NativeSelectOption value="unfiled">Unfiled (Default)</NativeSelectOption>
                    {folders.map((folder) => (
                      <NativeSelectOption key={folder.id} value={folder.id}>
                        {folder.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setIsCreatingFolder(true)}
                  >
                    <Plus className="mr-1 size-3" /> New Folder
                  </Button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple={multiple}
                className="hidden"
                disabled={isUploading}
                onChange={(event) => void handleUploadFiles(event.target.files)}
              />

              <button
                type="button"
                disabled={isUploading}
                className={`flex min-h-60 flex-1 touch-manipulation flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/30 hover:border-primary/60'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <span className="rounded-full bg-muted p-4 text-muted-foreground">
                  <UploadCloud className="size-8" aria-hidden="true" />
                </span>
                <span className="mt-3 text-sm font-semibold text-foreground">
                  Choose Images or Drop Them Here
                </span>
                <span className="mt-1 max-w-md text-pretty text-xs text-muted-foreground">
                  JPEG, PNG, or WebP · up to 10&nbsp;MB each. Uploaded images are automatically optimized into high-definition responsive web renditions.
                </span>
              </button>

              {/* Upload Progress Queue */}
              {uploadQueue.length > 0 && (
                <div className="space-y-2 rounded-lg border bg-card p-3">
                  <p className="text-xs font-semibold text-foreground">
                    Uploading {uploadQueue.length} {uploadQueue.length === 1 ? 'file' : 'files'}:
                  </p>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {uploadQueue.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-mono text-[11px] text-foreground max-w-[200px]">
                          {item.file.name}
                        </span>
                        <div className="flex items-center gap-2">
                          {item.stage === 'UPLOADING' && (
                            <span className="text-[11px] font-mono text-primary">
                              Uploading {item.progress}%
                            </span>
                          )}
                          {item.stage === 'PROCESSING' && (
                            <span className="flex items-center gap-1 text-[11px] text-amber-500">
                              <LoaderCircle className="size-3 animate-spin" /> Processing renditions…
                            </span>
                          )}
                          {item.stage === 'READY' && (
                            <Badge className="bg-success text-success-foreground text-[10px]">
                              Ready
                            </Badge>
                          )}
                          {item.stage === 'ERROR' && (
                            <Badge variant="destructive" className="text-[10px]">
                              {item.error || 'Failed'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{uploadError}</span>
                </div>
              )}
            </TabsContent>
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
                    className="group relative size-10 shrink-0 overflow-hidden rounded border bg-muted"
                  >
                    <Image
                      src={asset.previewUrl}
                      alt={asset.filename}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove asset"
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white"
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
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={selectedAssets.size === 0}
                  onClick={handleConfirm}
                >
                  Add {selectedAssets.size || ''} {selectedAssets.size === 1 ? 'Image' : 'Images'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox / Inspector Dialog */}
      {inspectItem && (
        <Dialog open={Boolean(inspectItem)} onOpenChange={(open) => !open && setInspectItem(null)}>
          <DialogContent className="max-w-2xl sm:rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                {inspectItem.title || inspectItem.originalFilename}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Asset Details & High-Resolution Preview
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
              <div className="relative aspect-3/4 w-full overflow-hidden rounded-lg bg-muted border">
                <Image
                  src={getAdminMediaUrl(inspectItem.id, { rendition: 'pdp' })}
                  alt={inspectItem.altText || inspectItem.originalFilename}
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-foreground">Filename: </span>
                  <span className="font-mono text-muted-foreground break-all">
                    {inspectItem.originalFilename}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Dimensions: </span>
                  <span className="font-mono text-muted-foreground">
                    {inspectItem.width && inspectItem.height
                      ? `${inspectItem.width} × ${inspectItem.height} px`
                      : 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">File Size: </span>
                  <span className="font-mono text-muted-foreground">
                    {formatFileSize(inspectItem.byteSize)}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">MIME Type: </span>
                  <span className="font-mono text-muted-foreground">{inspectItem.mimeType}</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Folder: </span>
                  <span className="text-muted-foreground">
                    {inspectItem.folderName || 'Unfiled'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Usage Count: </span>
                  <span className="font-mono text-muted-foreground">
                    {inspectItem.usageCount > 0 ? `Used in ${inspectItem.usageCount} products` : 'Unused'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Created: </span>
                  <span className="text-muted-foreground">
                    {new Date(inspectItem.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="pt-3">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      toggleSelect(inspectItem);
                      setInspectItem(null);
                    }}
                  >
                    {selectedAssets.has(inspectItem.id) ? (
                      'Deselect Image'
                    ) : (
                      <>
                        <Check className="mr-1.5 size-3.5" /> Select for Product
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setInspectItem(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create New Folder Modal */}
      {isCreatingFolder && (
        <Dialog open={isCreatingFolder} onOpenChange={setIsCreatingFolder}>
          <DialogContent className="max-w-md sm:rounded-xl">
            <form onSubmit={handleCreateFolder}>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">Create Media Folder</DialogTitle>
                <DialogDescription className="text-xs">
                  Create a folder to organize your product images, lookbooks, and banners.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-3">
                <div className="space-y-1">
                  <Label htmlFor="new-folder-name" className="text-xs font-medium">
                    Folder Name
                  </Label>
                  <Input
                    id="new-folder-name"
                    type="text"
                    autoFocus
                    placeholder="e.g. Eid Collection 2026, Tops, Size Charts…"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="h-9 text-xs"
                    disabled={isSavingFolder}
                  />
                </div>

                {folderError && (
                  <p className="text-xs text-destructive">{folderError}</p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreatingFolder(false)}
                  disabled={isSavingFolder}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newFolderName.trim() || isSavingFolder}
                >
                  {isSavingFolder ? (
                    <>
                      <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> Creating…
                    </>
                  ) : (
                    'Create Folder'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
