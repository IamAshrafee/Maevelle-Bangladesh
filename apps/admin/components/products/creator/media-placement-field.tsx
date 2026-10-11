'use client';

import { useId, useMemo } from 'react';
import {
  HelpCircle,
  Images,
  Info,
  PackageSearch,
  Ruler,
  Sparkles,
  SwatchBook,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { MediaCardScopeOption, StagedMediaItem } from './types';

export type MediaScopeUpdate = {
  role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  variantId?: string | null;
  optionValueId?: string | null;
  variantRef?: string | null;
  optionValueRef?: string | null;
};

export interface MediaPlacementFieldProps {
  readonly media: StagedMediaItem;
  readonly scopeOptions: readonly MediaCardScopeOption[];
  readonly onChange: (scope: MediaScopeUpdate) => void;
  readonly onScopeChanged?: (scopeLabel: string) => void;
}

function optionValue(option: MediaCardScopeOption): string {
  return `option:${option.optionValueRef || option.optionValueId || option.id}`;
}

function variantValue(option: MediaCardScopeOption): string {
  return `variant:${option.variantRef || option.variantId || option.id}`;
}

export function MediaPlacementField({
  media,
  scopeOptions,
  onChange,
  onScopeChanged,
}: MediaPlacementFieldProps) {
  const selectId = useId();
  const helpId = useId();

  const visualOptions = useMemo(
    () => scopeOptions.filter((option) => option.type === 'COLOR'),
    [scopeOptions],
  );
  const variantOptions = useMemo(
    () => scopeOptions.filter((option) => option.type === 'VARIANT'),
    [scopeOptions],
  );

  const value =
    media.role === 'SIZE_DIAGRAM'
      ? 'size-guide'
      : media.optionValueRef || media.optionValueId
        ? `option:${media.optionValueRef || media.optionValueId}`
        : media.variantRef || media.variantId
          ? `variant:${media.variantRef || media.variantId}`
          : 'shared';

  const selectedVisual = visualOptions.find((option) => optionValue(option) === value);
  const selectedVariant = variantOptions.find((option) => variantValue(option) === value);

  // Dynamic friendly explanation of what this placement does on the storefront
  const placementInfo = useMemo(() => {
    if (value === 'size-guide') {
      return {
        badge: 'Size Guide',
        badgeVariant: 'outline' as const,
        icon: Ruler,
        headline: 'Size guide & specifications',
        detail:
          'Kept separate from the main fashion gallery. Displayed when shoppers tap "Size Guide" or view measurements.',
      };
    }
    if (selectedVisual) {
      return {
        badge: `${selectedVisual.label} Gallery`,
        badgeVariant: 'secondary' as const,
        icon: SwatchBook,
        colorHex: selectedVisual.colorHex,
        headline: `Shows for ${selectedVisual.label}`,
        detail: `Appears in the product image gallery whenever a shopper clicks the ${selectedVisual.label} color swatch.`,
      };
    }
    if (selectedVariant) {
      return {
        badge: 'SKU Override',
        badgeVariant: 'secondary' as const,
        icon: PackageSearch,
        headline: 'Single SKU override',
        detail: `Appears only when this exact variation (${selectedVariant.label}) is selected.`,
      };
    }
    return {
      badge: visualOptions.length > 0 ? 'Shared (All Choices)' : 'Main Gallery',
      badgeVariant: 'secondary' as const,
      icon: Images,
      headline:
        visualOptions.length > 0
          ? 'Visible across all color choices'
          : 'Visible in product gallery',
      detail:
        visualOptions.length > 0
          ? 'Visible to all shoppers regardless of selected color. Ideal for packaging, lifestyle, fabric details, and group shots.'
          : 'Shown to all shoppers in the main product image gallery.',
    };
  }, [value, selectedVisual, selectedVariant, visualOptions.length]);

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;

    if (nextValue === 'size-guide') {
      onChange({
        role: 'SIZE_DIAGRAM',
        optionValueId: null,
        optionValueRef: null,
        variantId: null,
        variantRef: null,
      });
      onScopeChanged?.('Size Guide');
      return;
    }

    if (nextValue === 'shared') {
      onChange({
        role: media.isPrimary ? 'THUMBNAIL' : 'GALLERY',
        optionValueId: null,
        optionValueRef: null,
        variantId: null,
        variantRef: null,
      });
      onScopeChanged?.(visualOptions.length > 0 ? 'Shared Gallery' : 'Main Gallery');
      return;
    }

    if (nextValue.startsWith('option:')) {
      const option = visualOptions.find((item) => optionValue(item) === nextValue);
      if (!option) return;
      onChange({
        role: 'COLOR_GALLERY',
        optionValueRef: option.optionValueRef || option.optionValueId || null,
        optionValueId: option.optionValueId || null,
        variantId: null,
        variantRef: null,
      });
      onScopeChanged?.(`${option.label} Gallery`);
      return;
    }

    const option = variantOptions.find((item) => variantValue(item) === nextValue);
    if (!option) return;
    onChange({
      role: 'GALLERY',
      variantRef: option.variantRef || option.variantId || null,
      variantId: option.variantId || null,
      optionValueId: null,
      optionValueRef: null,
    });
    onScopeChanged?.(`SKU: ${option.label}`);
  };

  const IconComponent = placementInfo.icon;

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={selectId} className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <IconComponent className="size-3.5 text-primary" aria-hidden="true" />
          <span>Placement & Visibility</span>
        </Label>
        <div className="flex items-center gap-1">
          {placementInfo.colorHex && (
            <span
              className="size-2.5 rounded-full border border-black/20 shadow-2xs"
              style={{ backgroundColor: placementInfo.colorHex }}
              aria-hidden="true"
            />
          )}
          <Badge variant={placementInfo.badgeVariant} className="px-1.5 py-0 text-[10px] font-medium">
            {placementInfo.badge}
          </Badge>
        </div>
      </div>

      <NativeSelect
        id={selectId}
        size="sm"
        className="w-full text-xs font-medium"
        value={value}
        aria-describedby={helpId}
        onChange={handleSelectChange}
      >
        {visualOptions.length === 0 ? (
          <>
            <NativeSelectOption value="shared">
              Product Gallery (Default · all shoppers)
            </NativeSelectOption>
            <NativeSelectOption value="size-guide">
              Size Guide or Measurement Diagram
            </NativeSelectOption>
          </>
        ) : (
          <>
            <NativeSelectOptGroup label="General Merchandising">
              <NativeSelectOption value="shared">
                Shared Gallery (Visible for all colors & choices)
              </NativeSelectOption>
            </NativeSelectOptGroup>

            <NativeSelectOptGroup label={`Color Galleries (${visualOptions[0]?.groupLabel || 'Visual Choice'})`}>
              {visualOptions.map((option) => (
                <NativeSelectOption key={option.id} value={optionValue(option)}>
                  {option.label}
                  {option.isPrimary ? ' (Default / Primary Choice)' : ''}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>

            <NativeSelectOptGroup label="Reference & Sizing">
              <NativeSelectOption value="size-guide">
                Size Guide or Measurement Chart
              </NativeSelectOption>
            </NativeSelectOptGroup>

            {variantOptions.length > 0 ? (
              <NativeSelectOptGroup label="Advanced · Specific SKU Override">
                {variantOptions.map((option) => (
                  <NativeSelectOption key={option.id} value={variantValue(option)}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ) : null}
          </>
        )}
      </NativeSelect>

      {/* Instant visual explanation box */}
      <div
        id={helpId}
        className="flex items-start gap-1.5 rounded bg-background/80 p-1.5 text-[11px] leading-relaxed text-muted-foreground border border-border/40"
      >
        <Info className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <span className="font-medium text-foreground">{placementInfo.headline}: </span>
          <span>{placementInfo.detail}</span>
        </div>
      </div>
    </div>
  );
}
