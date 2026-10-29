'use client';

import type { FormEvent } from 'react';
import { FolderPlus, TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { MediaAsset, MediaFolder, MediaTag } from './media-workspace-types';

interface Props {
  readonly selectedAsset: MediaAsset;
  readonly busy: boolean;
  readonly folders: readonly MediaFolder[];
  readonly tags: readonly MediaTag[];
  readonly saveOrganization: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly onOpenNewFolder?: (() => void) | undefined;
  readonly onOpenNewTag?: (() => void) | undefined;
}

export function MediaOrganizationForm({
  selectedAsset,
  busy,
  folders,
  tags,
  saveOrganization,
  onOpenNewFolder,
  onOpenNewTag,
}: Props) {
  return (
    <form
      key={`org-${selectedAsset.id}`}
      className="space-y-4"
      onSubmit={(event) => void saveOrganization(event)}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="media-folder"
            className="text-xs font-medium text-foreground"
          >
            Folder
          </label>
          {onOpenNewFolder && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-primary hover:text-primary"
              onClick={onOpenNewFolder}
            >
              <FolderPlus className="size-3 mr-1" />
              New Folder
            </Button>
          )}
        </div>
        <NativeSelect
          id="media-folder"
          name="folderId"
          defaultValue={selectedAsset.folderId ?? ''}
          className="w-full text-xs bg-card"
        >
          <NativeSelectOption value="">Unfiled (Root)</NativeSelectOption>
          {folders.map((f) => (
            <NativeSelectOption key={f.id} value={f.id}>
              {f.name} ({f.assetCount} assets)
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Organize assets into logical collections and lookbooks.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">
            Taxonomy Tags
          </label>
          {onOpenNewTag && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-primary hover:text-primary"
              onClick={onOpenNewTag}
            >
              <TagIcon className="size-3 mr-1" />
              New Tag
            </Button>
          )}
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2 p-2.5 rounded-lg border border-border bg-muted/20 min-h-16">
            {tags.map((tag) => {
              const isChecked = selectedAsset.tags.some((t) => t.id === tag.id);
              return (
                <label
                  key={tag.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors select-none ${
                    isChecked
                      ? 'bg-primary/10 border-primary text-primary font-medium'
                      : 'bg-card border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={isChecked}
                    className="sr-only"
                    onChange={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        if (e.currentTarget.checked) {
                          parent.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors select-none bg-primary/10 border-primary text-primary font-medium';
                        } else {
                          parent.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors select-none bg-card border-border text-muted-foreground hover:border-primary/50';
                        }
                      }
                    }}
                  />
                  <span>#{tag.name}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            No tags created yet.
            {onOpenNewTag && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 ml-1 text-xs text-primary"
                onClick={onOpenNewTag}
              >
                Create your first tag
              </Button>
            )}
          </div>
        )}
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full h-9 text-xs"
        disabled={busy}
      >
        Save Organization
      </Button>
    </form>
  );
}
