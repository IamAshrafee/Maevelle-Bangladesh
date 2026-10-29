'use client';

import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  MediaAsset,
  PlacementScope,
  ProductSummary,
  ProductWorkspace,
} from './media-workspace-types';

interface Props {
  readonly selectedAsset: MediaAsset;
  readonly busy: boolean;
  readonly products: readonly ProductSummary[];
  readonly productLoadError: string | null;
  readonly product: ProductWorkspace | null;
  readonly placementScope: PlacementScope;
  readonly setPlacementScope: (scope: PlacementScope) => void;
  readonly selectProduct: (productId: string) => Promise<void>;
  readonly attach: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function MediaPlacementForm({
  selectedAsset,
  busy,
  products,
  productLoadError,
  product,
  placementScope,
  setPlacementScope,
  selectProduct,
  attach,
}: Props) {
  const isImageReady = selectedAsset.status === 'READY';
  const isPublic = selectedAsset.visibility === 'PUBLIC';

  return (
    <form
      key={`placement-${selectedAsset.id}`}
      className="space-y-3.5"
      onSubmit={(event) => void attach(event)}
    >
      {productLoadError ? (
        <div role="alert" className="p-2.5 rounded-lg border border-warning/30 bg-warning/10 text-xs text-warning">
          {productLoadError}
        </div>
      ) : null}

      {!productLoadError && products.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No catalog products found. Create a product in Catalog first.
        </p>
      ) : null}

      {(!isImageReady || !isPublic) && (
        <div className="p-2.5 rounded-lg border border-muted bg-muted/30 text-xs text-muted-foreground">
          {!isPublic
            ? 'This asset has private visibility. Switch visibility to Public in the Details tab before attaching it to storefront products.'
            : 'This asset is still processing. Wait until status is Ready before attaching to products.'}
        </div>
      )}

      <div>
        <label
          htmlFor="media-target-product"
          className="text-xs font-medium text-foreground block mb-1"
        >
          Target Product
        </label>
        <NativeSelect
          id="media-target-product"
          defaultValue=""
          onChange={(e) => void selectProduct(e.target.value)}
          disabled={Boolean(productLoadError) || products.length === 0 || busy}
          className="w-full text-xs bg-card"
          required
        >
          <NativeSelectOption value="" disabled>
            Select a product to attach…
          </NativeSelectOption>
          {products.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {product && (
        <div>
          <label
            htmlFor="media-placement-scope"
            className="text-xs font-medium text-foreground block mb-1"
          >
            Placement Scope
          </label>
          <NativeSelect
            id="media-placement-scope"
            value={placementScope}
            onChange={(event) => setPlacementScope(event.target.value as PlacementScope)}
            className="w-full text-xs bg-card"
          >
            <NativeSelectOption value="PRODUCT">Product-wide (All variants)</NativeSelectOption>
            <NativeSelectOption value="VARIANT">Specific variant SKU</NativeSelectOption>
            <NativeSelectOption value="OPTION">Option value swatch gallery (e.g. Color)</NativeSelectOption>
          </NativeSelect>
        </div>
      )}

      {product && placementScope === 'VARIANT' && (
        <div>
          <label
            htmlFor="media-variant"
            className="text-xs font-medium text-foreground block mb-1"
          >
            Select Variant
          </label>
          <NativeSelect
            id="media-variant"
            name="scopedId"
            defaultValue=""
            required
            className="w-full text-xs bg-card"
          >
            <NativeSelectOption value="">Choose a variant SKU…</NativeSelectOption>
            {product.variants.map((variant) => (
              <NativeSelectOption key={variant.id} value={variant.id}>
                {variant.sku} ({variant.status})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}

      {product && placementScope === 'OPTION' && (
        <div>
          <label
            htmlFor="media-option-value"
            className="text-xs font-medium text-foreground block mb-1"
          >
            Select Option Value
          </label>
          <NativeSelect
            id="media-option-value"
            name="scopedId"
            defaultValue=""
            required
            className="w-full text-xs bg-card"
          >
            <NativeSelectOption value="">Choose an option value…</NativeSelectOption>
            {product.options.map((axis) => (
              <optgroup key={axis.id} label={axis.name}>
                {axis.values
                  .filter((value) => value.status === 'ACTIVE')
                  .map((value) => (
                    <NativeSelectOption key={value.id} value={value.id}>
                      {value.label}
                    </NativeSelectOption>
                  ))}
              </optgroup>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label
            htmlFor="media-role"
            className="text-xs font-medium text-foreground block mb-1"
          >
            Gallery Role
          </label>
          <NativeSelect
            id="media-role"
            name="role"
            defaultValue="GALLERY"
            className="w-full text-xs bg-card"
          >
            <NativeSelectOption value="GALLERY">Gallery Item</NativeSelectOption>
            <NativeSelectOption value="THUMBNAIL">Main Cover</NativeSelectOption>
            <NativeSelectOption value="COLOR_GALLERY">Color Swatch Gallery</NativeSelectOption>
            <NativeSelectOption value="SIZE_DIAGRAM">Size Guide Diagram</NativeSelectOption>
          </NativeSelect>
        </div>

        <div>
          <label
            htmlFor="media-position"
            className="text-xs font-medium text-foreground block mb-1"
          >
            Display Order
          </label>
          <Input
            id="media-position"
            name="position"
            type="number"
            min={0}
            defaultValue={0}
            className="h-9 text-xs bg-card"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          id="is-primary-checkbox"
          name="isPrimary"
          type="checkbox"
          className="size-4 rounded border-input text-primary accent-primary"
        />
        <label htmlFor="is-primary-checkbox" className="text-xs text-foreground cursor-pointer select-none">
          Set as primary cover for this scope
        </label>
      </div>

      <div>
        <label
          htmlFor="media-placement-alt"
          className="text-xs font-medium text-foreground block mb-1"
        >
          Placement Alt Text Override
        </label>
        <Textarea
          id="media-placement-alt"
          name="altTextOverride"
          rows={2}
          maxLength={500}
          className="text-xs bg-card resize-none"
          placeholder="Optional override specifically for this product placement"
        />
      </div>

      <Button
        type="submit"
        size="sm"
        className="w-full h-9 text-xs"
        disabled={busy || !product || !isImageReady || !isPublic}
      >
        Attach to Product
      </Button>
    </form>
  );
}
