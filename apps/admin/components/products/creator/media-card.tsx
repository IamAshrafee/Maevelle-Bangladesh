'use client';

import { type ClipboardEvent, type DragEvent, type RefObject, useState } from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  Star,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssetPickerDialog, type SelectedMediaAsset } from '@/components/media/asset-picker-dialog';
import type { StagedMediaItem } from './types';

export interface MediaCardScopeOption {
  readonly id: string;
  readonly label: string;
  readonly type: 'GENERAL' | 'COLOR' | 'VARIANT';
  readonly optionValueId?: string | undefined;
  readonly variantId?: string | undefined;
}

interface MediaCardProps {
  readonly mediaItems: readonly StagedMediaItem[];
  readonly isDraggingOver: boolean;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly onFilesSelected: (files: FileList | null) => void;
  readonly onSetDraggingOver: (isDragging: boolean) => void;
  readonly onSetPrimaryMedia: (id: string) => void;
  readonly onRemoveMedia: (id: string) => void;
  readonly onUpdateMediaAlt: (id: string, altText: string) => void;
  readonly onMoveMedia?: (id: string, direction: 'left' | 'right') => void;
  readonly onUpdateMediaScope?: (
    id: string,
    scope: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      variantId?: string | null;
      optionValueId?: string | null;
    },
  ) => void;
  readonly onAddExistingAssets?: (assets: readonly SelectedMediaAsset[]) => void;
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

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onSetDraggingOver(true);
  };

  const handleDragLeave = () => {
    onSetDraggingOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onSetDraggingOver(false);
    onFilesSelected(e.dataTransfer.files);
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
      onFilesSelected(dt.files);
    }
  };

  return (
    <Card className="shadow-xs" onPaste={handlePaste}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-base font-semibold">Product Media & Gallery</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Upload photography or choose from your Media Library. Reorder, designate cover, or
              assign to color variants.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {onAddExistingAssets && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={() => setPickerOpen(true)}
              >
                <FolderOpen className="size-3.5 text-primary" />
                Media Library
              </Button>
            )}

            <Badge variant="secondary" className="text-xs font-normal">
              {mediaItems.length} asset{mediaItems.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Drag and Drop Zone */}
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
            isDraggingOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => onFilesSelected(e.target.files)}
          />
          <div className="rounded-full bg-muted p-3 text-muted-foreground mb-2">
            <UploadCloud className="size-6" />
          </div>
          <p className="text-xs font-semibold text-foreground">
            Click to upload, drag and drop, or paste from clipboard (Ctrl+V)
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            JPEG, PNG, WebP up to 10MB each. High portrait orientation (3:4) recommended.
          </p>
        </div>

        {/* Staged Media Grid */}
        {mediaItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {mediaItems.map((media, idx) => (
              <div
                key={media.id}
                className={`group relative flex flex-col overflow-hidden rounded-lg border bg-muted/20 transition-all ${
                  media.isPrimary
                    ? 'ring-2 ring-primary ring-offset-2 border-primary'
                    : 'hover:border-primary/40'
                }`}
              >
                {/* Media Image Container */}
                <div className="aspect-3/4 relative w-full overflow-hidden bg-muted">
                  <Image
                    src={media.previewUrl}
                    alt={media.altText || 'Product preview'}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                  />

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

                  {/* Badges on preview */}
                  <div className="absolute left-2 top-2 flex flex-col gap-1">
                    {media.isPrimary && (
                      <Badge className="bg-primary text-primary-foreground text-[10px] font-semibold shadow-xs">
                        Catalog Cover
                      </Badge>
                    )}
                    {media.role === 'COLOR_GALLERY' && (
                      <Badge
                        variant="outline"
                        className="bg-background/90 text-[9px] font-medium backdrop-blur-xs"
                      >
                        Color Gallery
                      </Badge>
                    )}
                    {media.role === 'SIZE_DIAGRAM' && (
                      <Badge
                        variant="outline"
                        className="bg-background/90 text-[9px] font-medium backdrop-blur-xs"
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
                            className="flex size-7 items-center justify-center rounded bg-white/20 text-white hover:bg-white/40 disabled:opacity-30 disabled:pointer-events-none"
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
                            disabled={idx === mediaItems.length - 1}
                            className="flex size-7 items-center justify-center rounded bg-white/20 text-white hover:bg-white/40 disabled:opacity-30 disabled:pointer-events-none"
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
                          title="Set as catalog cover"
                          aria-label="Set as catalog cover"
                          className="flex size-7 items-center justify-center rounded bg-white/20 text-white hover:bg-white/40"
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
                      className="flex size-7 items-center justify-center rounded bg-destructive/80 text-white hover:bg-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveMedia(media.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Placement Details: Scope & Alt text */}
                <div className="p-2 space-y-1.5 bg-background border-t">
                  {/* Scope Selector (Color / Variant assignment) */}
                  {onUpdateMediaScope && scopeOptions.length > 0 && (
                    <select
                      value={
                        media.optionValueId
                          ? `color:${media.optionValueId}`
                          : media.variantId
                            ? `variant:${media.variantId}`
                            : 'general'
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'general') {
                          onUpdateMediaScope(media.id, {
                            role: media.isPrimary ? 'THUMBNAIL' : 'GALLERY',
                            variantId: null,
                            optionValueId: null,
                          });
                        } else if (val.startsWith('color:')) {
                          onUpdateMediaScope(media.id, {
                            role: 'COLOR_GALLERY',
                            optionValueId: val.replace('color:', ''),
                            variantId: null,
                          });
                        } else if (val.startsWith('variant:')) {
                          onUpdateMediaScope(media.id, {
                            role: 'GALLERY',
                            variantId: val.replace('variant:', ''),
                            optionValueId: null,
                          });
                        }
                      }}
                      className="w-full h-7 rounded border border-input bg-muted/30 px-1.5 text-[10px] text-foreground outline-none"
                    >
                      <option value="general">Product Gallery (All)</option>
                      {scopeOptions.map((opt) => (
                        <option
                          key={opt.id}
                          value={
                            opt.type === 'COLOR'
                              ? `color:${opt.optionValueId}`
                              : `variant:${opt.variantId}`
                          }
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Alt Text Input */}
                  <input
                    type="text"
                    placeholder="Alt text for SEO & accessibility…"
                    value={media.altText}
                    className="w-full bg-transparent text-[11px] text-foreground outline-none border-b border-transparent focus:border-input pb-0.5 placeholder:text-muted-foreground/60"
                    onChange={(e) => onUpdateMediaAlt(media.id, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Asset Picker Modal */}
      {onAddExistingAssets && (
        <AssetPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          multiple
          onSelect={(assets) => {
            onAddExistingAssets(assets);
          }}
        />
      )}
    </Card>
  );
}
