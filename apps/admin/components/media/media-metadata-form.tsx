'use client';

import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { MediaAsset } from './media-workspace-types';

interface Props {
  readonly selectedAsset: MediaAsset;
  readonly busy: boolean;
  readonly saveMetadata: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function MediaMetadataForm({ selectedAsset, busy, saveMetadata }: Props) {
  return (
    <form
      key={`metadata-${selectedAsset.id}`}
      className="space-y-3.5"
      onSubmit={(event) => void saveMetadata(event)}
    >
      <div>
        <label
          htmlFor="media-title"
          className="text-xs font-medium text-foreground block mb-1"
        >
          Internal Title
        </label>
        <Input
          id="media-title"
          name="title"
          defaultValue={selectedAsset.title ?? ''}
          maxLength={160}
          className="h-9 text-xs bg-card"
          placeholder="e.g. Silk Embroidered Kurti — Editorial Cover"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Identifies this asset across the library and product picker.
        </p>
      </div>

      <div>
        <label
          htmlFor="media-alt-text"
          className="text-xs font-medium text-foreground block mb-1"
        >
          Alternative Text (Alt Text)
        </label>
        <Textarea
          id="media-alt-text"
          name="altText"
          defaultValue={selectedAsset.altText ?? ''}
          rows={2}
          maxLength={500}
          className="text-xs bg-card resize-none"
          placeholder="Concise, contextual description for screen readers and search engines"
        />
      </div>

      <div>
        <label
          htmlFor="media-caption"
          className="text-xs font-medium text-foreground block mb-1"
        >
          Caption
        </label>
        <Textarea
          id="media-caption"
          name="caption"
          defaultValue={selectedAsset.caption ?? ''}
          rows={2}
          maxLength={1000}
          className="text-xs bg-card resize-none"
          placeholder="Optional storefront or customer-facing caption"
        />
      </div>

      <div>
        <label
          htmlFor="media-notes"
          className="text-xs font-medium text-foreground block mb-1"
        >
          Internal Operational Notes
        </label>
        <Textarea
          id="media-notes"
          name="internalDescription"
          defaultValue={selectedAsset.internalDescription ?? ''}
          rows={2}
          maxLength={4000}
          className="text-xs bg-card resize-none"
          placeholder="Licensing, photographer, color profile, or usage rights notes"
        />
      </div>

      <div>
        <label
          htmlFor="media-visibility"
          className="text-xs font-medium text-foreground block mb-1"
        >
          Visibility Class
        </label>
        <NativeSelect
          id="media-visibility"
          name="visibility"
          defaultValue={selectedAsset.visibility}
          className="w-full text-xs bg-card"
        >
          <NativeSelectOption
            value="PRIVATE"
            disabled={
              selectedAsset.visibility === 'PUBLIC' &&
              ['PROCESSING', 'READY', 'ARCHIVED'].includes(selectedAsset.status)
            }
          >
            Private — internal admin and staff access only
          </NativeSelectOption>
          <NativeSelectOption value="PUBLIC">
            Public — storefront delivery & CDN cached
          </NativeSelectOption>
        </NativeSelect>
        {selectedAsset.visibility === 'PUBLIC' && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Public renditions are generated and delivered over public URLs.
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full h-9 text-xs"
        disabled={busy}
      >
        Save Metadata
      </Button>
    </form>
  );
}
