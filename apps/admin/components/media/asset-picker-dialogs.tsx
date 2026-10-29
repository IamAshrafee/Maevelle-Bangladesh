'use client';

import type { FormEvent } from 'react';
import Image from 'next/image';
import { Check, FileIcon, LoaderCircle } from 'lucide-react';
import type { MediaLibraryItemDto } from '@maevelle/contracts';
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
import { getAdminMediaUrl } from '@/lib/media/api';
import { formatFileSize } from './media-file-size';

interface AssetPickerDialogsProps {
  readonly inspectItem: MediaLibraryItemDto | null;
  readonly onInspectChange: (item: MediaLibraryItemDto | null) => void;
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggleSelect: (item: MediaLibraryItemDto) => void;
  readonly isCreatingFolder: boolean;
  readonly setIsCreatingFolder: (open: boolean) => void;
  readonly handleCreateFolder: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly newFolderName: string;
  readonly setNewFolderName: (name: string) => void;
  readonly folderError: string | null;
  readonly isSavingFolder: boolean;
}

export function AssetPickerDialogs({
  inspectItem,
  onInspectChange,
  selectedIds,
  onToggleSelect,
  isCreatingFolder,
  setIsCreatingFolder,
  handleCreateFolder,
  newFolderName,
  setNewFolderName,
  folderError,
  isSavingFolder,
}: AssetPickerDialogsProps) {
  return (
    <>
      {/* Lightbox / Inspector Dialog */}
      {inspectItem && (
        <Dialog open={Boolean(inspectItem)} onOpenChange={(open) => !open && onInspectChange(null)}>
          <DialogContent className="max-w-2xl sm:rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                {inspectItem.title || inspectItem.originalFilename}
              </DialogTitle>
              <DialogDescription className="text-xs">
                File details{inspectItem.assetType === 'IMAGE' ? ' and preview' : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
              <div className="relative aspect-3/4 w-full overflow-hidden rounded-lg bg-muted border">
                {inspectItem.assetType === 'IMAGE' ? (
                  <Image
                    src={getAdminMediaUrl(inspectItem.id, { rendition: 'pdp' })}
                    alt={inspectItem.altText || inspectItem.originalFilename}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <FileIcon className="size-16 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
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
                    {inspectItem.usageCount > 0 ? `Used ${inspectItem.usageCount} times` : 'Unused'}
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
                      onToggleSelect(inspectItem);
                      onInspectChange(null);
                    }}
                  >
                    {selectedIds.has(inspectItem.id) ? (
                      'Deselect Image'
                    ) : (
                      <>
                        <Check className="mr-1.5 size-3.5" /> Select File
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onInspectChange(null)}
              >
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

                {folderError && <p className="text-xs text-destructive">{folderError}</p>}
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
                <Button type="submit" size="sm" disabled={!newFolderName.trim() || isSavingFolder}>
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
