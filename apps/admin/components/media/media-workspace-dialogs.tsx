'use client';

import { useState, type FormEvent } from 'react';
import { FolderEdit, FolderPlus, ShieldCheck, TagIcon, Trash2 } from 'lucide-react';

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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MediaHealthSummary } from '@/lib/media/health-scan';
import type { MediaFolder, MediaTag } from './media-workspace-types';

export interface MediaWorkspaceDialogsProps {
  readonly health: MediaHealthSummary | null;
  readonly isHealthOpen: boolean;
  readonly onHealthOpenChange: (open: boolean) => void;
  readonly isBulkFolderOpen: boolean;
  readonly setIsBulkFolderOpen: (open: boolean) => void;
  readonly isBulkTagOpen: boolean;
  readonly setIsBulkTagOpen: (open: boolean) => void;
  readonly isNewFolderOpen: boolean;
  readonly setIsNewFolderOpen: (open: boolean) => void;
  readonly isNewTagOpen: boolean;
  readonly setIsNewTagOpen: (open: boolean) => void;
  readonly editingFolder: MediaFolder | null;
  readonly setEditingFolder: (folder: MediaFolder | null) => void;
  readonly deletingFolder: MediaFolder | null;
  readonly setDeletingFolder: (folder: MediaFolder | null) => void;
  readonly deletingTag: MediaTag | null;
  readonly setDeletingTag: (tag: MediaTag | null) => void;
  readonly bulkTargetFolderId: string;
  readonly setBulkTargetFolderId: (id: string) => void;
  readonly selectedCount: number;
  readonly folders: readonly MediaFolder[];
  readonly tags: readonly MediaTag[];
  readonly handleBulkMoveToFolder: () => Promise<void>;
  readonly handleBulkManageTags: (addTagIds: string[], removeTagIds: string[]) => Promise<void>;
  readonly createLibraryFolder: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly updateLibraryFolder: (folderId: string, version: number, name: string) => Promise<void>;
  readonly deleteLibraryFolder: (folderId: string) => Promise<void>;
  readonly createLibraryTag: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly deleteLibraryTag: (tagId: string) => Promise<void>;
}

export function MediaWorkspaceDialogs({
  health,
  isHealthOpen,
  onHealthOpenChange,
  isBulkFolderOpen,
  setIsBulkFolderOpen,
  isBulkTagOpen,
  setIsBulkTagOpen,
  isNewFolderOpen,
  setIsNewFolderOpen,
  isNewTagOpen,
  setIsNewTagOpen,
  editingFolder,
  setEditingFolder,
  deletingFolder,
  setDeletingFolder,
  deletingTag,
  setDeletingTag,
  bulkTargetFolderId,
  setBulkTargetFolderId,
  selectedCount,
  folders,
  tags,
  handleBulkMoveToFolder,
  handleBulkManageTags,
  createLibraryFolder,
  updateLibraryFolder,
  deleteLibraryFolder,
  createLibraryTag,
  deleteLibraryTag,
}: MediaWorkspaceDialogsProps) {
  // State for Bulk Tag Management
  const [bulkAddTags, setBulkAddTags] = useState<Set<string>>(new Set());
  const [bulkRemoveTags, setBulkRemoveTags] = useState<Set<string>>(new Set());
  const [renameFolderName, setRenameFolderName] = useState('');

  return (
    <>
      {/* Health Check Modal */}
      <Dialog
        open={isHealthOpen}
        onOpenChange={(open) => {
          onHealthOpenChange(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Storage Health Diagnostics
            </DialogTitle>
            <DialogDescription className="text-xs">
              Inspected {health?.checkedObjectCount ?? 0} storage records. Found{' '}
              {health?.verifiedObjectCount ?? 0} objects with matching recorded byte sizes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div
              role="status"
              aria-live="polite"
              className={`rounded-lg p-3 text-xs font-medium border ${
                health?.status === 'HEALTHY'
                  ? 'bg-success/10 border-success/30 text-success'
                  : health?.status === 'SCANNING'
                    ? 'bg-info/10 border-info/30 text-info'
                    : 'bg-warning/10 border-warning/30 text-warning'
              }`}
            >
              Status:{' '}
              <strong className="uppercase">
                {health?.status === 'HEALTHY'
                  ? 'Healthy — no missing or mismatched files'
                  : health?.status === 'SCANNING'
                    ? 'Scanning — results in progress…'
                    : health?.status === 'FAILED'
                      ? 'Scan failed — unable to complete check'
                      : 'Issues detected'}
              </strong>
              {health?.status === 'SCANNING' && (
                <p className="mt-1 font-normal">
                  {health.checkedObjectCount} records inspected so far.
                </p>
              )}
              {health?.error && <p className="mt-1 font-normal">{health.error}</p>}
            </div>

            {health && health.issueCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {health.issueCount} issue{health.issueCount === 1 ? '' : 's'} found.
                {health.issuesTruncated && ` Showing the first ${health.issues.length}.`}
              </p>
            )}

            {health?.issues && health.issues.length > 0 && (
              <ScrollArea className="max-h-60 rounded-md border border-border p-2 bg-muted/20">
                <div className="space-y-2 text-xs">
                  {health.issues.map((issue, idx) => (
                    <div key={idx} className="border-b border-border/50 pb-2 last:border-b-0">
                      <p className="font-semibold text-destructive">{issue.code}</p>
                      <p className="text-muted-foreground text-[11px]">{issue.detail}</p>
                      <p className="text-[10px] text-muted-foreground/80 font-mono mt-0.5">
                        Asset: {issue.assetId}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => onHealthOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move To Folder Modal */}
      <Dialog open={isBulkFolderOpen} onOpenChange={setIsBulkFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Move Selected Assets</DialogTitle>
            <DialogDescription className="text-xs">
              Assign {selectedCount} selected asset{selectedCount === 1 ? '' : 's'} to a destination folder.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2">
            <label htmlFor="media-bulk-destination" className="text-xs font-medium text-foreground block">
              Destination Folder
            </label>
            <NativeSelect
              id="media-bulk-destination"
              value={bulkTargetFolderId}
              onChange={(e) => setBulkTargetFolderId(e.target.value)}
              className="w-full text-xs bg-card"
            >
              <NativeSelectOption value="">Choose a destination folder…</NativeSelectOption>
              <NativeSelectOption value="unfiled">Unfiled (Root)</NativeSelectOption>
              {folders.map((f) => (
                <NativeSelectOption key={f.id} value={f.id}>
                  {f.name} ({f.assetCount} assets)
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsBulkFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleBulkMoveToFolder()}
              disabled={!bulkTargetFolderId}
            >
              Move Assets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Manage Tags Modal */}
      <Dialog
        open={isBulkTagOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBulkAddTags(new Set());
            setBulkRemoveTags(new Set());
          }
          setIsBulkTagOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Manage Tags ({selectedCount} Selected)</DialogTitle>
            <DialogDescription className="text-xs">
              Apply or strip classification tags across all selected assets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {tags.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-foreground block mb-1">
                    Select tags to apply or remove:
                  </span>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 rounded-lg border border-border bg-muted/20">
                    {tags.map((tag) => {
                      const isAdding = bulkAddTags.has(tag.id);
                      const isRemoving = bulkRemoveTags.has(tag.id);

                      return (
                        <div
                          key={tag.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border bg-card"
                        >
                          <span className="font-medium text-foreground">#{tag.name}</span>
                          <div className="flex items-center gap-1 ml-1 border-l pl-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setBulkAddTags((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(tag.id)) next.delete(tag.id);
                                  else {
                                    next.add(tag.id);
                                    setBulkRemoveTags((r) => {
                                      const rn = new Set(r);
                                      rn.delete(tag.id);
                                      return rn;
                                    });
                                  }
                                  return next;
                                });
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                isAdding ? 'bg-success text-success-foreground font-semibold' : 'text-muted-foreground hover:text-success'
                              }`}
                            >
                              +Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBulkRemoveTags((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(tag.id)) next.delete(tag.id);
                                  else {
                                    next.add(tag.id);
                                    setBulkAddTags((a) => {
                                      const an = new Set(a);
                                      an.delete(tag.id);
                                      return an;
                                    });
                                  }
                                  return next;
                                });
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                isRemoving ? 'bg-destructive text-destructive-foreground font-semibold' : 'text-muted-foreground hover:text-destructive'
                              }`}
                            >
                              -Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  {bulkAddTags.size > 0 && `Adding ${bulkAddTags.size} tag(s). `}
                  {bulkRemoveTags.size > 0 && `Removing ${bulkRemoveTags.size} tag(s). `}
                  {bulkAddTags.size === 0 && bulkRemoveTags.size === 0 && 'No tag changes selected.'}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No tags created yet. Create tags first using "New Tag".
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsBulkTagOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleBulkManageTags(Array.from(bulkAddTags), Array.from(bulkRemoveTags))}
              disabled={bulkAddTags.size === 0 && bulkRemoveTags.size === 0}
            >
              Apply Tag Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Modal */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <form onSubmit={(e) => void createLibraryFolder(e)}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-1.5 text-sm">
                <FolderPlus className="size-4 text-primary" /> Create New Folder
              </DialogTitle>
              <DialogDescription className="text-xs">
                Organize images and documents hierarchically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3">
              <div>
                <label htmlFor="media-new-folder-name" className="text-xs font-medium text-foreground block mb-1">
                  Folder Name
                </label>
                <Input
                  id="media-new-folder-name"
                  name="name"
                  placeholder="e.g. Eid 2026 Collection"
                  maxLength={120}
                  required
                  className="h-9 text-xs bg-card"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="media-new-folder-parent" className="text-xs font-medium text-foreground block mb-1">
                  Parent Folder (optional)
                </label>
                <NativeSelect
                  id="media-new-folder-parent"
                  name="parentId"
                  defaultValue=""
                  className="w-full text-xs bg-card"
                >
                  <NativeSelectOption value="">Top Level (Root)</NativeSelectOption>
                  {folders.map((f) => (
                    <NativeSelectOption key={f.id} value={f.id}>
                      {f.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewFolderOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create Folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Modal */}
      <Dialog
        open={Boolean(editingFolder)}
        onOpenChange={(open) => {
          if (!open) setEditingFolder(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingFolder || !renameFolderName.trim()) return;
              void updateLibraryFolder(editingFolder.id, editingFolder.version, renameFolderName.trim());
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-1.5 text-sm">
                <FolderEdit className="size-4 text-primary" /> Rename Folder
              </DialogTitle>
              <DialogDescription className="text-xs">
                Update the display name of this collection folder.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3">
              <label htmlFor="media-rename-folder" className="text-xs font-medium text-foreground block mb-1">
                Folder Name
              </label>
              <Input
                id="media-rename-folder"
                value={renameFolderName || (editingFolder?.name ?? '')}
                onChange={(e) => setRenameFolderName(e.target.value)}
                maxLength={120}
                required
                className="h-9 text-xs bg-card"
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingFolder(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Modal */}
      <Dialog
        open={Boolean(deletingFolder)}
        onOpenChange={(open) => {
          if (!open) setDeletingFolder(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-sm text-destructive">
              <Trash2 className="size-4" /> Delete Folder
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete folder &ldquo;{deletingFolder?.name}&rdquo;? Assets in this folder will not be deleted; they will become unfiled.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingFolder(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deletingFolder) void deleteLibraryFolder(deletingFolder.id);
              }}
            >
              Delete Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Tag Modal */}
      <Dialog open={isNewTagOpen} onOpenChange={setIsNewTagOpen}>
        <DialogContent className="max-w-sm">
          <form onSubmit={(e) => void createLibraryTag(e)}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-1.5 text-sm">
                <TagIcon className="size-4 text-primary" /> Create New Tag
              </DialogTitle>
              <DialogDescription className="text-xs">
                Add a classification tag across multiple assets.
              </DialogDescription>
            </DialogHeader>

            <div className="py-3">
              <label htmlFor="media-new-tag-name" className="text-xs font-medium text-foreground block mb-1">
                Tag Name
              </label>
              <Input
                id="media-new-tag-name"
                name="name"
                placeholder="e.g. Silk, Lookbook, Studio"
                maxLength={80}
                required
                className="h-9 text-xs bg-card"
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewTagOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create Tag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Tag Modal */}
      <Dialog
        open={Boolean(deletingTag)}
        onOpenChange={(open) => {
          if (!open) setDeletingTag(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-sm text-destructive">
              <Trash2 className="size-4" /> Delete Tag
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete tag #{deletingTag?.name}? This removes the tag from all assigned media assets.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingTag(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (deletingTag) void deleteLibraryTag(deletingTag.id);
              }}
            >
              Delete Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
