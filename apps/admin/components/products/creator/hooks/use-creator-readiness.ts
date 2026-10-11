'use client';

import { useMemo } from 'react';
import type { ReadinessChecklistItem, StagedMediaItem, VariantMatrixRow } from '../types';

interface UseCreatorReadinessOptions {
  readonly title: string;
  readonly productTypeId: string;
  readonly primaryCategoryId: string;
  readonly selectedCategoryIds: readonly string[];
  readonly priceAmount: string;
  readonly variantMode: 'simple' | 'variants';
  readonly sku: string;
  readonly matrixRows: readonly VariantMatrixRow[];
  readonly mediaItems: readonly StagedMediaItem[];
}

export function useCreatorReadiness({
  title,
  productTypeId,
  primaryCategoryId,
  selectedCategoryIds,
  priceAmount,
  variantMode,
  sku,
  matrixRows,
  mediaItems,
}: UseCreatorReadinessOptions) {
  return useMemo(() => {
    const hasTitle = Boolean(title.trim().length >= 3);
    const hasType = Boolean(productTypeId);
    const hasCategory = Boolean(primaryCategoryId || selectedCategoryIds.length > 0);
    const hasPricing =
      variantMode === 'simple'
        ? Boolean(Number(priceAmount) > 0)
        : matrixRows.some((r) => r.enabled && Boolean(Number(r.priceAmount) > 0)) ||
          Boolean(Number(priceAmount) > 0);
    const hasSkuOrVariants =
      variantMode === 'simple'
        ? Boolean(sku.trim())
        : matrixRows.some((r) => r.enabled && Boolean(r.sku.trim()));
    const hasMedia = mediaItems.length > 0;

    const items: ReadinessChecklistItem[] = [
      { id: 'title', label: 'Product Name defined', isComplete: hasTitle },
      { id: 'type', label: 'Product Type assigned', isComplete: hasType },
      { id: 'category', label: 'Primary Category assigned', isComplete: hasCategory },
      { id: 'pricing', label: 'Base Selling Price configured', isComplete: hasPricing },
      {
        id: 'variants',
        label:
          variantMode === 'simple' ? 'SKU code assigned' : 'At least 1 variant active with SKU',
        isComplete: hasSkuOrVariants,
      },
      { id: 'media', label: 'At least 1 product image uploaded', isComplete: hasMedia },
    ];

    const completedCount = items.filter((i) => i.isComplete).length;
    const progressPercent = Math.round((completedCount / items.length) * 100);

    return {
      items,
      completedCount,
      totalCount: items.length,
      progressPercent,
      isReadyToPublish: completedCount === items.length,
    };
  }, [
    title,
    productTypeId,
    primaryCategoryId,
    selectedCategoryIds,
    priceAmount,
    variantMode,
    sku,
    matrixRows,
    mediaItems,
  ]);
}
