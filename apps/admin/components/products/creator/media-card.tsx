'use client';

import {
  type ClipboardEvent,
  type DragEvent,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckSquare,
  FileText,
  FolderOpen,
  ImageIcon,
  Images,
  Layers,
  LoaderCircle,
  Square,
  Star,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssetPickerDialog, type SelectedMediaAsset } from '@/components/media/asset-picker-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { MediaPlacementField, type MediaScopeUpdate } from './media-placement-field';
import type { MediaCardScopeOption, StagedMediaItem } from './types';

export interface MediaCardProps {
  readonly mediaItems: readonly StagedMediaItem[];
  readonly isDraggingOver: boolean;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly onFilesSelected: (
    files: FileList | null,
    targetScope?: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      optionValueRef?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      variantId?: string | null;
    },
  ) => void;
  readonly onSetDraggingOver: (isDragging: boolean) => void;
  readonly onSetPrimaryMedia: (id: string) => void;
  readonly onRemoveMedia: (id: string) => void;
  readonly onUpdateMediaAlt: (id: string, altText: string) => void;
  readonly onMoveMedia?: (id: string, direction: 'left' | 'right') => void;
  readonly onUpdateMediaScope?: (id: string, scope: MediaScopeUpdate) => void;
  readonly onAddExistingAssets?: (
    assets: readonly SelectedMediaAsset[],
    targetScope?: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      optionValueRef?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      variantId?: string | null;
    },
  ) => void;
  readonly scopeOptions?: readonly MediaCardScopeOption[];
}

export function MediaCard({
  mediaItems,
  isDraggingOver,
  fileInputRef,
  onFilesSelected,
  onSetDraggingOver,
  onSetPrimaryMedia,
  onRemoveMedia,
  onUpdateMediaAlt,
  onMoveMedia,
  onUpdateMediaScope,
  onAddExistingAssets,
  scopeOptions = [],
}: MediaCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('shared');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveNotification, setMoveNotification] = useState<{
    readonly message: string;
    readonly targetTab: string;
  } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const visualScopes = useMemo(
    () => scopeOptions.filter((opt) => opt.type === 'COLOR'),
    [scopeOptions],
  );

  // Selected scope for upload based on active tab
  const currentUploadScope = useMemo(() => {
    if (activeTab === 'size-diagram') {
      return {
        role: 'SIZE_DIAGRAM' as const,
        optionValueRef: null,
        optionValueId: null,
      };
    }
    if (activeTab.startsWith('color:')) {
      const targetOpt = visualScopes.find((c) => c.id === activeTab);
      if (targetOpt) {
        return {
          role: 'COLOR_GALLERY' as const,
          optionValueRef: targetOpt.optionValueRef || targetOpt.optionValueId || null,
          optionValueId: targetOpt.optionValueId || null,
        };
      }
    }
    return {
      role: 'GALLERY' as const,
      optionValueRef: null,
      optionValueId: null,
    };
  }, [activeTab, visualScopes]);

  // Filtered media items based on active tab
  const filteredMedia = useMemo(() => {
    if (activeTab === 'all') return mediaItems;
    if (activeTab === 'shared') {
      return mediaItems.filter(
        (m) =>
          m.role !== 'SIZE_DIAGRAM' &&
          !m.optionValueRef &&
          !m.optionValueId &&
          !m.variantRef &&
          !m.variantId,
      );
    }
    if (activeTab === 'size-diagram') {
      return mediaItems.filter((m) => m.role === 'SIZE_DIAGRAM');
    }
    if (activeTab.startsWith('color:')) {
      const targetOpt = visualScopes.find((c) => c.id === activeTab);
      const matchKey = targetOpt?.optionValueRef || targetOpt?.optionValueId;
      return mediaItems.filter(
        (m) =>
          (m.optionValueRef && m.optionValueRef === matchKey) ||
          (m.optionValueId && m.optionValueId === matchKey) ||
          (m.role === 'COLOR_GALLERY' && m.optionValueRef === targetOpt?.optionValueRef),
      );
    }
    return mediaItems;
  }, [activeTab, mediaItems, visualScopes]);

  const activeTargetLabel = useMemo(() => {
    if (activeTab === 'size-diagram') return 'Size guide & specifications';
    if (activeTab.startsWith('color:')) {
      const option = visualScopes.find((item) => item.id === activeTab);
      return option ? `${option.label} gallery` : 'Selected color gallery';
    }
    if (activeTab === 'all') return 'Product media (General)';
    return 'Shared product gallery';
  }, [activeTab, visualScopes]);

  // Counts for tabs
  const sharedCount = useMemo(
    () =>
      mediaItems.filter(
        (m) =>
          m.role !== 'SIZE_DIAGRAM' &&
          !m.optionValueRef &&
          !m.optionValueId &&
          !m.variantRef &&
          !m.variantId,
      ).length,
    [mediaItems],
  );

  const sizeGuideCount = useMemo(
    () => mediaItems.filter((m) => m.role === 'SIZE_DIAGRAM').length,
    [mediaItems],
  );

  const handleDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onSetDraggingOver(true);
  };

  const handleDragLeave = () => {
    onSetDraggingOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onSetDraggingOver(false);
    onFilesSelected(e.dataTransfer.files, currentUploadScope);
  };

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
      onFilesSelected(dt.files, currentUploadScope);
    }
  };

  // Selection toggle
  const toggleSelectMedia = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredMedia.map((m) => m.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Batch action: Move selected to target gallery
  const handleBatchMove = (targetValue: string) => {
    if (!onUpdateMediaScope || selectedIds.size === 0) return;

    for (const id of selectedIds) {
      if (targetValue === 'size-guide') {
        onUpdateMediaScope(id, {
          role: 'SIZE_DIAGRAM',
          optionValueId: null,
          optionValueRef: null,
          variantId: null,
          variantRef: null,
        });
      } else if (targetValue === 'shared') {
        onUpdateMediaScope(id, {
          role: 'GALLERY',
          optionValueId: null,
          optionValueRef: null,
          variantId: null,
          variantRef: null,
        });
      } else if (targetValue.startsWith('color:')) {
        const targetOpt = visualScopes.find((c) => c.id === targetValue);
        if (targetOpt) {
          onUpdateMediaScope(id, {
            role: 'COLOR_GALLERY',
            optionValueRef: targetOpt.optionValueRef || targetOpt.optionValueId || null,
            optionValueId: targetOpt.optionValueId || null,
            variantId: null,
            variantRef: null,
          });
        }
      }
    }
    setSelectedIds(new Set());
  };

  // Batch action: Remove selected
  const handleBatchRemove = () => {
    for (const id of selectedIds) {
      onRemoveMedia(id);
    }
    setSelectedIds(new Set());
  };

  return (
    <Card className="shadow-xs" onPaste={handlePaste}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-base font-semibold">Product Media & Galleries</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Upload photos once and assign them to the shared product gallery, specific color options,
              or the size guide diagram.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                onFilesSelected(event.target.files, currentUploadScope);
                event.currentTarget.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 gap-1.5 text-xs font-medium sm:min-h-8"
              onClick={() => cameraInputRef.current?.click()}
              title="Take photo with device camera"
            >
              <Camera className="size-3.5 text-primary" aria-hidden="true" />
              <span className="hidden sm:inline">Take Photo</span>
              <span className="sm:hidden">Photo</span>
            </Button>

            {onAddExistingAssets && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 gap-1.5 text-xs font-medium sm:min-h-8"
                onClick={() => setPickerOpen(true)}
              >
                <FolderOpen className="size-3.5 text-primary" aria-hidden="true" />
                <span>Media Library</span>
              </Button>
            )}

            <Badge variant="secondary" className="font-mono text-xs font-normal" aria-live="polite">
              {mediaItems.length} asset{mediaItems.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>

        {/* Gallery Tabs Strip */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-foreground">
              Select gallery workspace to view or add photos:
            </p>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Active: <span className="font-semibold text-foreground">{activeTargetLabel}</span>
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {/* All Photos Tab */}
            <button
              type="button"
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                activeTab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('all')}
            >
              <Images className="size-3.5" aria-hidden="true" />
              <span>All Photos</span>
              <span className="font-mono text-[10px] opacity-80">({mediaItems.length})</span>
            </button>

            {/* Shared Gallery Tab */}
            <button
              type="button"
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                activeTab === 'shared'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('shared')}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              <span>{visualScopes.length > 0 ? 'Shared (All Choices)' : 'Main Gallery'}</span>
              <span className="font-mono text-[10px] opacity-80">({sharedCount})</span>
            </button>

            {/* Color Scope Tabs */}
            {visualScopes.map((opt) => {
              const matchKey = opt.optionValueRef || opt.optionValueId;
              const count = mediaItems.filter(
                (m) =>
                  (m.optionValueRef && m.optionValueRef === matchKey) ||
                  (m.optionValueId && m.optionValueId === matchKey) ||
                  (m.role === 'COLOR_GALLERY' && m.optionValueRef === opt.optionValueRef),
              ).length;

              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                    activeTab === opt.id
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab(opt.id)}
                >
                  {opt.colorHex ? (
                    <span
                      className="size-2.5 rounded-full border border-black/20"
                      style={{ backgroundColor: opt.colorHex }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {opt.isPrimary && (
                    <Star className="size-3 fill-warning text-warning" aria-hidden="true" />
                  )}
                  <span>{opt.label}</span>
                  <span className="font-mono text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}

            {/* Size Guide Tab */}
            <button
              type="button"
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                activeTab === 'size-diagram'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('size-diagram')}
            >
              <FileText className="size-3.5" aria-hidden="true" />
              <span>Size Guide</span>
              <span className="font-mono text-[10px] opacity-80">({sizeGuideCount})</span>
            </button>
          </div>

          <p className="text-pretty text-[11px] text-muted-foreground">
            {activeTab === 'all'
              ? 'Review all images across all galleries. Every image shows its assigned visibility below.'
              : activeTab === 'shared'
                ? 'Shared gallery photos are visible for all color choices. Perfect for packaging, lifestyle, fabric details, and common views.'
                : activeTab === 'size-diagram'
                  ? 'Size guide and technical specification images are shown exclusively in the sizing reference drawer.'
                  : `${activeTargetLabel} photos appear automatically when a shopper selects this color choice on the storefront.`}
          </p>
        </div>

        {/* Gallery Move Feedback Alert */}
        {moveNotification && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
            <div className="flex items-center gap-2">
              <Check className="size-3.5 text-primary" aria-hidden="true" />
              <span>{moveNotification.message}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => {
                  setActiveTab(moveNotification.targetTab);
                  setMoveNotification(null);
                }}
              >
                Switch Tab →
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setMoveNotification(null)}
                aria-label="Dismiss alert"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => {
            onFilesSelected(event.target.files, currentUploadScope);
            event.currentTarget.value = '';
          }}
        />

        {/* Upload Zone */}
        <button
          type="button"
          className={`flex min-h-32 w-full touch-manipulation flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 ${
            isDraggingOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          aria-label={`Add images to ${activeTargetLabel}`}
        >
          <span className="mb-2 rounded-full bg-muted p-2.5 text-muted-foreground">
            <UploadCloud className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-foreground">
            Add Photos to {activeTargetLabel}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            Click to upload, drag and drop, or paste an image · JPEG, PNG, WebP · up to 10&nbsp;MB
          </span>
        </button>

        {/* Batch Actions Toolbar */}
        {filteredMedia.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={selectedIds.size === filteredMedia.length ? clearSelection : selectAllFiltered}
              >
                {selectedIds.size === filteredMedia.length && filteredMedia.length > 0 ? (
                  <>
                    <CheckSquare className="size-3.5 text-primary" />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <Square className="size-3.5 text-muted-foreground" />
                    <span>Select All ({filteredMedia.length})</span>
                  </>
                )}
              </Button>
              {selectedIds.size > 0 && (
                <span className="font-mono text-muted-foreground">
                  ({selectedIds.size} selected)
                </span>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Move to:</span>
                <NativeSelect
                  size="sm"
                  className="h-7 w-auto py-0 text-xs"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBatchMove(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                >
                  <NativeSelectOption value="" disabled>Choose gallery…</NativeSelectOption>
                  <NativeSelectOption value="shared">Shared Gallery</NativeSelectOption>
                  {visualScopes.map((opt) => (
                    <NativeSelectOption key={opt.id} value={opt.id}>
                      {opt.label} Gallery
                    </NativeSelectOption>
                  ))}
                  <NativeSelectOption value="size-guide">Size Guide</NativeSelectOption>
                </NativeSelect>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={handleBatchRemove}
                >
                  <Trash2 className="size-3" />
                  <span>Delete</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Staged Media Grid */}
        {filteredMedia.length > 0 ? (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredMedia.map((media, idx) => {
              const matchedScope = visualScopes.find(
                (c) =>
                  (c.optionValueRef && c.optionValueRef === media.optionValueRef) ||
                  (c.optionValueId && c.optionValueId === media.optionValueId),
              );

              const isChecked = selectedIds.has(media.id);

              return (
                <div
                  key={media.id}
                  className={`group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-[border-color,box-shadow] duration-150 ${
                    media.isPrimary
                      ? 'border-primary ring-2 ring-primary ring-offset-2'
                      : isChecked
                        ? 'border-primary/80 ring-1 ring-primary/50'
                        : 'hover:border-primary/40'
                  }`}
                >
                  {/* Media Image Container */}
                  <div className="relative aspect-3/4 w-full overflow-hidden bg-muted">
                    {media.pendingImport ? (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImageIcon className="size-8" aria-hidden="true" />
                        <span className="text-xs">Image import pending</span>
                      </div>
                    ) : (
                      <Image
                        src={media.previewUrl}
                        alt={media.altText || 'Product preview'}
                        fill
                        className="object-cover"
                        unoptimized
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      />
                    )}

                    {/* Multi-select Checkbox */}
                    <button
                      type="button"
                      aria-label={isChecked ? 'Deselect image' : 'Select image'}
                      className={`absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded border transition-colors shadow-xs ${
                        isChecked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-white/60 bg-black/40 text-white hover:bg-black/60'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectMedia(media.id);
                      }}
                    >
                      {isChecked ? (
                        <Check className="size-3.5 stroke-[3]" />
                      ) : (
                        <span className="size-2 rounded-xs" />
                      )}
                    </button>

                    {media.isUploading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-xs">
                        <LoaderCircle className="size-5 animate-spin text-primary" />
                        <span className="text-[10px] font-medium text-foreground">
                          {media.processingStage === 'PROCESSING'
                            ? 'Generating variants…'
                            : `Uploading ${media.uploadProgress ?? 0}%`}
                        </span>
                      </div>
                    )}

                    {media.error && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/85 p-2 text-center text-[10px] text-white">
                        <span>{media.error}</span>
                      </div>
                    )}

                    {/* Status & Scope Badges on preview */}
                    <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                      {media.pendingImport ? (
                        <Badge variant="secondary" className="text-[10px] shadow-xs">Import pending</Badge>
                      ) : !media.isUploading && media.assetId && !media.error ? (
                        <Badge className="bg-success text-success-foreground text-[10px] shadow-xs">
                          Ready
                        </Badge>
                      ) : null}

                      {media.isPrimary && (
                        <Badge className="gap-1 bg-primary text-primary-foreground text-[10px] font-semibold shadow-xs">
                          <Star className="size-2.5 fill-current" />
                          {!media.optionValueRef && !media.optionValueId && !media.variantRef && !media.variantId
                            ? 'Catalog Cover'
                            : `${matchedScope?.label || 'Option'} Lead`}
                        </Badge>
                      )}

                      {matchedScope && (
                        <Badge
                          variant="secondary"
                          className="border bg-background/90 text-[9px] font-medium backdrop-blur-xs shadow-xs"
                        >
                          {matchedScope.label}
                        </Badge>
                      )}

                      {media.role === 'SIZE_DIAGRAM' && (
                        <Badge
                          variant="outline"
                          className="bg-background/90 text-[9px] font-medium backdrop-blur-xs shadow-xs"
                        >
                          Size Diagram
                        </Badge>
                      )}
                    </div>

                    {/* Reordering and Quick Actions Overlay */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2">
                      {/* Reordering Controls */}
                      <div className="flex items-center gap-1">
                        {onMoveMedia && (
                          <>
                            <button
                              type="button"
                              title="Move left in gallery"
                              aria-label="Move left in gallery"
                              disabled={idx === 0}
                              className="flex size-8 items-center justify-center rounded bg-white/20 text-white hover:bg-white/40 disabled:pointer-events-none disabled:opacity-30"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveMedia(media.id, 'left');
                              }}
                            >
                              <ArrowLeft className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Move right in gallery"
                              aria-label="Move right in gallery"
                              disabled={idx === filteredMedia.length - 1}
                              className="flex size-8 items-center justify-center rounded bg-white/20 text-white hover:bg-white/40 disabled:pointer-events-none disabled:opacity-30"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveMedia(media.id, 'right');
                              }}
                            >
                              <ArrowRight className="size-3.5" />
                            </button>
                          </>
                        )}

                        {!media.isPrimary && (
                          <button
                            type="button"
                            title={
                              !media.optionValueRef && !media.optionValueId && !media.variantRef && !media.variantId
                                ? 'Set as Product Catalog Cover (main product hero image)'
                                : `Set as Lead Photo for ${matchedScope?.label || 'Option'}`
                            }
                            aria-label="Set as cover"
                            className="flex size-8 items-center justify-center rounded bg-white/20 text-white hover:bg-white/40"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSetPrimaryMedia(media.id);
                            }}
                          >
                            <Star className="size-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        title="Remove image"
                        aria-label="Remove image"
                        className="flex size-8 items-center justify-center rounded bg-destructive/80 text-white hover:bg-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveMedia(media.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Controls */}
                  <div className="space-y-3 border-t bg-card p-3">
                    {onUpdateMediaScope ? (
                      <MediaPlacementField
                        media={media}
                        scopeOptions={scopeOptions}
                        onChange={(scope) => onUpdateMediaScope(media.id, scope)}
                        onScopeChanged={(scopeLabel) => {
                          if (activeTab !== 'all') {
                            setMoveNotification({
                              message: `Moved photo to ${scopeLabel}`,
                              targetTab: scopeLabel.toLowerCase().includes('size')
                                ? 'size-diagram'
                                : scopeLabel.toLowerCase().includes('shared')
                                  ? 'shared'
                                  : visualScopes.find((v) => scopeLabel.includes(v.label))?.id || 'all',
                            });
                          }
                        }}
                      />
                    ) : null}

                    {/* Alt Text / Image Description */}
                    <div className="space-y-1">
                      <Label htmlFor={`media-alt-${media.id}`} className="text-xs font-medium text-foreground">
                        Alt text (Accessibility & SEO)
                      </Label>
                      <Input
                        id={`media-alt-${media.id}`}
                        name={`media-alt-${media.id}`}
                        type="text"
                        autoComplete="off"
                        placeholder="e.g. Front view, fabric detail…"
                        value={media.altText}
                        className="h-8 text-xs bg-background"
                        onChange={(e) => onUpdateMediaAlt(media.id, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
            {activeTab !== 'all' ? (
              <span>No photos in {activeTargetLabel} yet. Add photos above or select existing media.</span>
            ) : (
              <span>No photos uploaded yet. Use the upload area above to get started.</span>
            )}
          </div>
        )}
      </CardContent>

      {/* Asset Picker Modal */}
      {onAddExistingAssets && (
        <AssetPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          multiple
          targetLabel={activeTargetLabel}
          excludedAssetIds={mediaItems.flatMap((item) => (item.assetId ? [item.assetId] : []))}
          onSelect={(assets) => {
            onAddExistingAssets(assets, currentUploadScope);
          }}
        />
      )}
    </Card>
  );
}
