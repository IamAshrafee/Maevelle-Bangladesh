'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Check, FolderIcon, ImageIcon, LoaderCircle, Search, UploadCloud } from 'lucide-react';

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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
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
}

export function AssetPickerDialog({
  open,
  onOpenChange,
  onSelect,
  multiple = true,
  visibility = 'PUBLIC',
  assetType = 'IMAGE',
}: AssetPickerDialogProps) {
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library');
  const [items, setItems] = useState<readonly MediaLibraryItemDto[]>([]);
  const [folders, setFolders] = useState<readonly MediaFolderDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [selectedAssets, setSelectedAssets] = useState<Map<string, SelectedMediaAsset>>(new Map());

  // Upload tab state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'IDLE' | 'UPLOADING' | 'PROCESSING'>('IDLE');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const [libraryRes, foldersRes] = await Promise.all([
        listMediaLibrary({
          pageSize: 48,
          status: 'READY',
          ...(assetType === 'ALL' ? {} : { assetType }),
          visibility,
          ...(searchQuery.trim() ? { query: searchQuery.trim() } : {}),
          ...(selectedFolderId !== 'all'
            ? { folderId: selectedFolderId === 'unfiled' ? 'unfiled' : selectedFolderId }
            : {}),
        }),
        listMediaFolders().catch(() => []),
      ]);
      setItems(libraryRes.data);
      setFolders(foldersRes);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [assetType, searchQuery, selectedFolderId, visibility]);

  useEffect(() => {
    if (open) {
      void fetchLibrary();
      setSelectedAssets(new Map());
    }
  }, [open, fetchLibrary]);

  const toggleSelect = (item: MediaLibraryItemDto) => {
    setSelectedAssets((prev) => {
      const next = new Map(multiple ? prev : []);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, {
          id: item.id,
          filename: item.originalFilename,
          previewUrl: getAdminMediaUrl(item.id, { rendition: 'pdp' }),
          altText: item.altText,
          width: item.width,
          height: item.height,
        });
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onSelect(Array.from(selectedAssets.values()));
    onOpenChange(false);
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadStage('UPLOADING');
    setUploadProgress(0);

    const newlySelected: SelectedMediaAsset[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        const uploaded = await uploadMediaFile(file, {
          visibility,
          title: file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
          onProgress: (p) => setUploadProgress(p),
        });

        setUploadStage('PROCESSING');
        const status = await waitForMediaReady(uploaded.assetId);
        if (status !== 'READY') {
          throw new Error('Image processing failed or was quarantined.');
        }

        newlySelected.push({
          id: uploaded.assetId,
          filename: file.name,
          previewUrl: getAdminMediaUrl(uploaded.assetId, { rendition: 'pdp' }),
          altText: file.name.replace(/\.[^.]+$/, ''),
          width: null,
          height: null,
        });
      }

      // Switch to library tab and auto-select
      await fetchLibrary();
      setSelectedAssets((prev) => {
        const next = new Map(multiple ? prev : []);
        for (const asset of newlySelected) {
          next.set(asset.id, asset);
        }
        return next;
      });
      setActiveTab('library');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadStage('IDLE');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-6 border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold">Media Library</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Select existing photography or upload new high-resolution product media.
              </DialogDescription>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex text-xs font-medium">
              {items.length} available
            </Badge>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'library' | 'upload')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="border-b px-4 sm:px-6 bg-muted/20">
            <TabsList className="bg-transparent h-10 p-0 gap-4">
              <TabsTrigger
                value="library"
                className="relative h-10 rounded-none border-b-2 border-transparent px-2 text-xs font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                Browse Assets
              </TabsTrigger>
              <TabsTrigger
                value="upload"
                className="relative h-10 rounded-none border-b-2 border-transparent px-2 text-xs font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                Upload New
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Library Tab */}
          <TabsContent value="library" className="flex-1 flex flex-col m-0 p-0 overflow-hidden">
            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 sm:px-6 border-b bg-muted/10">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search filenames, tags, or alt text…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-background"
                />
              </div>

              {folders.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <FolderIcon className="size-3.5 text-muted-foreground" />
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    aria-label="Filter assets by folder"
                    className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">All Folders</option>
                    <option value="unfiled">Unfiled Only</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Grid of assets */}
            <ScrollArea className="flex-1 p-4 sm:p-6">
              {loading ? (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <LoaderCircle className="size-6 animate-spin text-primary" />
                  <span className="text-xs">Loading media assets…</span>
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <ImageIcon className="size-8 text-muted-foreground/40" />
                  <p className="text-xs font-semibold text-foreground">No media assets found</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    Try refining your search query or switch to the &quot;Upload New&quot; tab to
                    add photography.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {items.map((item) => {
                    const isSelected = selectedAssets.has(item.id);
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleSelect(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleSelect(item);
                          }
                        }}
                        className={`group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary ring-offset-1 bg-primary/5'
                            : 'hover:border-primary/50 bg-background'
                        }`}
                      >
                        <div className="aspect-square relative flex w-full items-center justify-center overflow-hidden bg-muted">
                          {item.assetType === 'IMAGE' ? (
                            <Image
                              src={getAdminMediaUrl(item.id, { rendition: 'thumbnail' })}
                              alt={item.altText || item.originalFilename}
                              fill
                              unoptimized
                              className="object-cover transition-transform group-hover:scale-105"
                              sizes="(max-width: 768px) 50vw, 20vw"
                            />
                          ) : (
                            <FolderIcon
                              className="size-10 text-muted-foreground"
                              aria-label="Document"
                            />
                          )}

                          {isSelected && (
                            <div className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                              <Check className="size-3 stroke-[3]" />
                            </div>
                          )}

                          {item.width && item.height && (
                            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
                              {item.width}×{item.height}
                            </span>
                          )}
                        </div>

                        <div className="p-2">
                          <p className="truncate text-[11px] font-medium text-foreground">
                            {item.originalFilename}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {(item.byteSize / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="flex-1 flex flex-col m-0 p-6 overflow-hidden">
            <div
              className={`flex-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                isUploading
                  ? 'border-primary/40 bg-muted/20 cursor-not-allowed'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onClick={() => {
                if (!isUploading) {
                  document.getElementById('picker-file-upload')?.click();
                }
              }}
            >
              <input
                id="picker-file-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple={multiple}
                className="hidden"
                disabled={isUploading}
                onChange={(e) => void handleUploadFiles(e.target.files)}
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <LoaderCircle className="size-8 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-xs font-semibold text-foreground">
                      {uploadStage === 'PROCESSING'
                        ? 'Processing image variants…'
                        : `Uploading ${uploadProgress}%`}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Generating responsive storefront renditions…
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-full bg-muted p-4 text-muted-foreground mb-3">
                    <UploadCloud className="size-8" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    Click to browse or drag and drop images here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Upload JPEG, PNG, or WebP photography. Images will be automatically normalized,
                    stripped of EXIF metadata, and generated into responsive WebP renditions.
                  </p>
                </>
              )}

              {uploadError && (
                <div className="mt-4 rounded-md bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
                  {uploadError}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <DialogFooter className="p-4 sm:px-6 border-t bg-muted/20 flex flex-row items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {selectedAssets.size > 0 ? (
              <span className="font-semibold text-foreground">
                {selectedAssets.size} asset{selectedAssets.size === 1 ? '' : 's'} selected
              </span>
            ) : (
              'No items selected'
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedAssets.size === 0}
              onClick={handleConfirm}
            >
              Use Selected ({selectedAssets.size})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
