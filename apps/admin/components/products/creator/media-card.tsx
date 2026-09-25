'use client';

import { type DragEvent, type RefObject } from 'react';
import Image from 'next/image';
import { ImageIcon, LoaderCircle, Star, Trash2, UploadCloud } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { StagedMediaItem } from './types';

interface MediaCardProps {
  readonly mediaItems: readonly StagedMediaItem[];
  readonly isDraggingOver: boolean;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly onFilesSelected: (files: FileList | null) => void;
  readonly onSetDraggingOver: (isDragging: boolean) => void;
  readonly onSetPrimaryMedia: (id: string) => void;
  readonly onRemoveMedia: (id: string) => void;
  readonly onUpdateMediaAlt: (id: string, altText: string) => void;
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
}: MediaCardProps) {
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

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Product Media</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">
            {mediaItems.length} image{mediaItems.length === 1 ? '' : 's'}
          </span>
        </div>
        <CardDescription>
          Upload high-resolution photography. The primary image is used as the catalog cover.
        </CardDescription>
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
            Click to upload or drag and drop images
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            PNG, JPG, WebP up to 10MB each. High portrait orientation (3:4) recommended.
          </p>
        </div>

        {/* Staged Media Grid */}
        {mediaItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {mediaItems.map((media) => (
              <div
                key={media.id}
                className={`group relative overflow-hidden rounded-lg border bg-muted/30 transition-all ${
                  media.isPrimary ? 'ring-2 ring-primary ring-offset-2' : 'hover:border-primary/50'
                }`}
              >
                <div className="aspect-3/4 relative w-full overflow-hidden bg-muted">
                  <Image
                    src={media.previewUrl}
                    alt={media.altText || 'Product preview'}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />

                  {media.isUploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-xs">
                      <LoaderCircle className="size-5 animate-spin text-primary" />
                      <span className="text-[10px] font-medium text-foreground">
                        {media.processingStage === 'PROCESSING'
                          ? 'Processing image…'
                          : `Uploading ${media.uploadProgress ?? 0}%`}
                      </span>
                    </div>
                  )}

                  {media.error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/80 p-2 text-center text-[10px] text-white">
                      <span>Failed to upload</span>
                    </div>
                  )}

                  {/* Cover Badge */}
                  {media.isPrimary && (
                    <div className="absolute left-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-xs">
                      Cover
                    </div>
                  )}

                  {/* Quick Action Overlay */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    {!media.isPrimary && (
                      <button
                        type="button"
                        title="Set as primary cover"
                        aria-label="Set as primary cover"
                        className="flex size-11 items-center justify-center rounded-md bg-white/20 text-white hover:bg-white/40"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetPrimaryMedia(media.id);
                        }}
                      >
                        <Star className="size-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      title="Remove image"
                      aria-label="Remove image"
                      className="ml-auto flex size-11 items-center justify-center rounded-md bg-destructive/80 text-white hover:bg-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveMedia(media.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Alt Text Input */}
                <div className="p-1.5 bg-background border-t">
                  <input
                    type="text"
                    placeholder="Alt text for SEO…"
                    value={media.altText}
                    className="w-full bg-transparent text-[11px] text-foreground outline-none"
                    onChange={(e) => onUpdateMediaAlt(media.id, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
