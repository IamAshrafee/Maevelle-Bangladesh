'use client';

import Image from 'next/image';
import {
  AlertCircle,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileIcon,
  FolderIcon,
  FolderPlus,
  ImageIcon,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react';
import type { MediaFolderDto, MediaLibraryItemDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TabsContent } from '@/components/ui/tabs';
import { getAdminMediaUrl } from '@/lib/media/api';
import { formatFileSize } from './media-file-size';

interface Props {
  readonly items: readonly MediaLibraryItemDto[];
  readonly folders: readonly MediaFolderDto[];
  readonly loading: boolean;
  readonly loadError: string | null;
  readonly searchInput: string;
  readonly searchQuery: string;
  readonly setSearchInput: (value: string) => void;
  readonly clearSearch: () => void;
  readonly selectedFolderId: string;
  readonly setSelectedFolderId: (id: string) => void;
  readonly setIsCreatingFolder: (open: boolean) => void;
  readonly usageFilter: 'all' | 'used' | 'unused';
  readonly setUsageFilter: (filter: 'all' | 'used' | 'unused') => void;
  readonly sortBy: 'newest' | 'oldest' | 'name' | 'size';
  readonly setSortBy: (sort: 'newest' | 'oldest' | 'name' | 'size') => void;
  readonly page: number;
  readonly setPage: React.Dispatch<React.SetStateAction<number>>;
  readonly totalPages: number;
  readonly multiple: boolean;
  readonly selectedAssets: ReadonlyMap<string, unknown>;
  readonly excludedIds: ReadonlySet<string>;
  readonly selectAllCurrentPage: () => void;
  readonly clearAllSelected: () => void;
  readonly fetchLibrary: () => Promise<void>;
  readonly setActiveTab: (tab: 'library' | 'upload') => void;
  readonly toggleSelect: (item: MediaLibraryItemDto) => void;
  readonly setInspectItem: (item: MediaLibraryItemDto | null) => void;
}

export function AssetPickerLibrary({
  items,
  folders,
  loading,
  loadError,
  searchInput,
  searchQuery,
  setSearchInput,
  clearSearch,
  selectedFolderId,
  setSelectedFolderId,
  setIsCreatingFolder,
  usageFilter,
  setUsageFilter,
  sortBy,
  setSortBy,
  page,
  setPage,
  totalPages,
  multiple,
  selectedAssets,
  excludedIds,
  selectAllCurrentPage,
  clearAllSelected,
  fetchLibrary,
  setActiveTab,
  toggleSelect,
  setInspectItem,
}: Props) {
  return (
    <>
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
                aria-label="Create new folder"
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
                aria-pressed={usageFilter === 'all'}
                className={`min-h-9 rounded px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
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
                aria-pressed={usageFilter === 'used'}
                className={`min-h-9 rounded px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  usageFilter === 'used'
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setUsageFilter('used');
                  setPage(1);
                }}
              >
                Used
              </button>
              <button
                type="button"
                aria-pressed={usageFilter === 'unused'}
                className={`min-h-9 rounded px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
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
                aria-label="Sort media assets"
                onChange={(e) => {
                  setSortBy(e.target.value as 'newest' | 'oldest' | 'name' | 'size');
                  setPage(1);
                }}
                className="h-9 w-auto py-0 text-xs"
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
                  className="h-9 px-2 text-xs gap-1"
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
                    className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
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
              <div
                className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground"
                aria-live="polite"
              >
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchLibrary()}
                >
                  Try Again
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <ImageIcon className="size-8 text-muted-foreground/40" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">No matching files found</p>
                  <p className="mt-1 max-w-sm text-xs">
                    {searchQuery || selectedFolderId !== 'all' || usageFilter !== 'all'
                      ? 'Try clearing the search query or changing your filters.'
                      : 'Upload files to start your media library.'}
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
                    Upload Files
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
                            <FileIcon
                              className="size-10 text-muted-foreground"
                              aria-hidden="true"
                            />
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
                          className="size-9 p-0 text-muted-foreground hover:text-foreground"
                          title="Inspect high-res preview and details"
                          aria-label={`Inspect ${item.title || item.originalFilename}`}
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
    </>
  );
}
