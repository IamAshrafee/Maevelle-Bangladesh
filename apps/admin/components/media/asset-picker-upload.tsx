'use client';

import type { DragEvent, RefObject } from 'react';
import { AlertCircle, FolderIcon, LoaderCircle, Plus, UploadCloud } from 'lucide-react';
import type { MediaFolderDto, MediaUploadPolicyDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { TabsContent } from '@/components/ui/tabs';
import { formatFileSize } from './media-file-size';

export interface UploadQueueItem {
  id: string;
  file: File;
  progress: number;
  stage: 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR';
  error?: string;
  assetId?: string;
}

interface Props {
  readonly folders: readonly MediaFolderDto[];
  readonly uploadDestinationFolderId: string;
  readonly setUploadDestinationFolderId: (id: string) => void;
  readonly setIsCreatingFolder: (open: boolean) => void;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly multiple: boolean;
  readonly isUploading: boolean;
  readonly handleUploadFiles: (files: FileList | readonly File[] | null) => Promise<void>;
  readonly isDragging: boolean;
  readonly setIsDragging: (dragging: boolean) => void;
  readonly handleDrop: (event: DragEvent<HTMLButtonElement>) => void;
  readonly uploadPolicy: MediaUploadPolicyDto | null;
  readonly uploadQueue: readonly UploadQueueItem[];
  readonly uploadError: string | null;
  readonly assetType: 'IMAGE' | 'DOCUMENT' | 'ALL';
}

export function AssetPickerUpload({
  folders,
  uploadDestinationFolderId,
  setUploadDestinationFolderId,
  setIsCreatingFolder,
  fileInputRef,
  multiple,
  isUploading,
  handleUploadFiles,
  isDragging,
  setIsDragging,
  handleDrop,
  uploadPolicy,
  uploadQueue,
  uploadError,
  assetType,
}: Props) {
  return (
    <>
      {/* TAB: Upload New */}
      <TabsContent
        value="upload"
        className="m-0 flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-xs">
          <div className="flex items-center gap-2">
            <FolderIcon className="size-4 text-primary" />
            <span className="font-medium text-foreground">Upload into folder:</span>
          </div>
          <div className="flex items-center gap-2">
            <NativeSelect
              size="sm"
              value={uploadDestinationFolderId}
              aria-label="Upload destination folder"
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
          accept={
            assetType === 'IMAGE'
              ? 'image/jpeg,image/png,image/webp'
              : assetType === 'DOCUMENT'
                ? 'application/pdf'
                : 'image/jpeg,image/png,image/webp,application/pdf'
          }
          multiple={multiple}
          className="hidden"
          disabled={isUploading}
          onChange={(event) => void handleUploadFiles(event.target.files)}
        />

        <button
          type="button"
          disabled={isUploading || !uploadPolicy}
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
            Choose{' '}
            {assetType === 'DOCUMENT' ? 'Documents' : assetType === 'ALL' ? 'Files' : 'Images'} or
            Drop Them Here
          </span>
          <span className="mt-1 max-w-md text-pretty text-xs text-muted-foreground">
            {assetType === 'DOCUMENT'
              ? 'PDF'
              : assetType === 'ALL'
                ? 'JPEG, PNG, WebP, or PDF'
                : 'JPEG, PNG, or WebP'}{' '}
            ·{' '}
            {uploadPolicy
              ? `up to ${formatFileSize(uploadPolicy.maxUploadBytes)} each`
              : 'loading upload rules…'}
            .
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
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{uploadError}</span>
          </div>
        )}
      </TabsContent>
    </>
  );
}
