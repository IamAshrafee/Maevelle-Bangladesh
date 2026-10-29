'use client';

import { useRef, useState } from 'react';
import type { CatalogProductWorkspaceDto } from '@maevelle/contracts';
import { uploadMediaFile, waitForMediaReady } from '@/lib/media/api';
import { mapSettledLimited } from '@/lib/media/concurrency';
import type { SelectedMediaAsset } from '@/components/media/asset-picker-dialog';
import type { OptionAxisState, StagedMediaItem } from '../types';

interface UseCreatorMediaOptions {
  readonly isEditMode: boolean;
  readonly workspaceData: CatalogProductWorkspaceDto | null;
  readonly title: string;
  readonly optionAxes: readonly OptionAxisState[];
  readonly onError?: (message: string) => void;
  readonly onDirty?: () => void;
}

export function useCreatorMedia({
  isEditMode,
  workspaceData,
  title,
  optionAxes,
  onError,
  onDirty,
}: UseCreatorMediaOptions) {
  const [mediaItems, setMediaItems] = useState<StagedMediaItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [removedMediaPlacementIds, setRemovedMediaPlacementIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const markDirty = () => {
    onDirty?.();
  };

  const handleFilesSelected = async (
    files: FileList | File[] | null,
    targetScope?: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      optionValueRef?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      variantId?: string | null;
    },
  ) => {
    if (!files || files.length === 0) return;

    const acceptedFiles = Array.from(files).filter((file) => {
      const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      return supported && file.size > 0 && file.size <= 10 * 1024 * 1024;
    });
    if (acceptedFiles.length === 0) {
      onError?.('Choose a JPEG, PNG, or WebP image smaller than 10 MB.');
      return;
    }
    if (acceptedFiles.length !== files.length) {
      onError?.(
        'Some files were skipped because they were not JPEG, PNG, or WebP images under 10 MB.',
      );
    }

    markDirty();

    const visualAxis = optionAxes.find((a) => a.isVisual && a.values.length > 0);
    const primaryVisualVal = visualAxis?.values.find((v) => v.isPrimary) || visualAxis?.values[0];

    const hasExplicitTarget = targetScope !== undefined;
    const resolvedOptionValueRef = hasExplicitTarget
      ? targetScope.optionValueRef ?? null
      : visualAxis
        ? primaryVisualVal?.id ?? null
        : null;

    const resolvedOptionValueId = hasExplicitTarget
      ? targetScope.optionValueId ?? null
      : visualAxis
        ? primaryVisualVal?.id ?? null
        : null;

    const resolvedVariantRef = targetScope?.variantRef ?? null;
    const resolvedVariantId = targetScope?.variantId ?? null;

    const canBecomePrimary = targetScope?.role !== 'SIZE_DIAGRAM';
    const newItems: StagedMediaItem[] = acceptedFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      isPrimary: canBecomePrimary && mediaItems.length === 0 && idx === 0,
      role:
        targetScope?.role ??
        (canBecomePrimary && mediaItems.length === 0 && idx === 0 ? 'THUMBNAIL' : 'GALLERY'),
      optionValueRef: resolvedOptionValueRef,
      optionValueId: resolvedOptionValueId,
      variantRef: resolvedVariantRef,
      variantId: resolvedVariantId,
      altText: title || file.name.replace(/\.[^/.]+$/, ''),
      isUploading: true,
      uploadProgress: 0,
      processingStage: 'UPLOADING',
    }));

    setMediaItems((prev) => [...prev, ...newItems]);

    // Bound simultaneous upload and processing polls for large product galleries.
    await mapSettledLimited(newItems, 3, async (item) => {
        if (!item.file) return;

        try {
          const uploaded = await uploadMediaFile(item.file, {
            visibility: 'PUBLIC',
            title: item.file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText: item.altText || title || 'Product Image',
            onProgress: (uploadProgress) =>
              setMediaItems((current) =>
                current.map((media) =>
                  media.id === item.id ? { ...media, uploadProgress } : media,
                ),
              ),
          });
          const assetId = uploaded.assetId;
          setMediaItems((current) =>
            current.map((media) =>
              media.id === item.id ? { ...media, assetId, processingStage: 'PROCESSING' } : media,
            ),
          );
          const status = await waitForMediaReady(assetId, { timeoutMs: 90_000 });
          if (status !== 'READY')
            throw new Error(
              status === 'FAILED' || status === 'QUARANTINED'
                ? 'Media processing rejected this image.'
                : 'Image is still processing. Open the Media library to retry or check status.',
            );

          setMediaItems((prev) =>
            prev.map((m) =>
              m.id === item.id ? { ...m, assetId, isUploading: false, uploadProgress: 100 } : m,
            ),
          );
        } catch (err) {
          setMediaItems((prev) =>
            prev.map((m) =>
              m.id === item.id
                ? {
                    ...m,
                    isUploading: false,
                    error: err instanceof Error ? err.message : 'Upload failed',
                  }
                : m,
            ),
          );
        }
    });
  };

  const handleSetPrimaryMedia = (id: string) => {
    setMediaItems((prev) => {
      const target = prev.find((m) => m.id === id);
      if (!target) return prev;

      const isTargetShared =
        !target.optionValueRef && !target.optionValueId && !target.variantRef && !target.variantId;

      return prev.map((m) => {
        // Setting cover on a shared photo (Product-level Catalog Cover)
        if (isTargetShared) {
          const isThisShared =
            !m.optionValueRef && !m.optionValueId && !m.variantRef && !m.variantId;
          if (isThisShared) {
            const isTarget = m.id === id;
            return {
              ...m,
              isPrimary: isTarget,
              role: isTarget ? ('THUMBNAIL' as const) : ('GALLERY' as const),
            };
          }
          // Preserve option value scope primaries
          return m;
        }

        // Setting lead photo on a specific option/variant scope (e.g. Pattern 1, Pattern 2)
        const sameOptionScope =
          (Boolean(target.optionValueRef) && m.optionValueRef === target.optionValueRef) ||
          (Boolean(target.optionValueId) && m.optionValueId === target.optionValueId) ||
          (Boolean(target.variantRef) && m.variantRef === target.variantRef) ||
          (Boolean(target.variantId) && m.variantId === target.variantId);

        if (sameOptionScope) {
          const isTarget = m.id === id;
          return {
            ...m,
            isPrimary: isTarget,
          };
        }

        return m;
      });
    });
    markDirty();
  };

  const handleRemoveMedia = (id: string) => {
    if (isEditMode && workspaceData?.media.some((m) => m.id === id)) {
      setRemovedMediaPlacementIds((prev) => [...prev, id]);
    }
    setMediaItems((prev) => {
      const filtered = prev.filter((m) => m.id !== id);
      if (filtered.length > 0 && !filtered.some((m) => m.isPrimary)) {
        const replacement = filtered.find((item) => item.role !== 'SIZE_DIAGRAM');
        if (replacement) {
          return filtered.map((item) => ({
            ...item,
            isPrimary: item.id === replacement.id,
            role:
              item.id === replacement.id &&
              !item.optionValueRef &&
              !item.optionValueId &&
              !item.variantRef &&
              !item.variantId
                ? 'THUMBNAIL'
                : item.role,
          }));
        }
      }
      return filtered;
    });
    markDirty();
  };

  const handleUpdateMediaAlt = (id: string, altText: string) => {
    setMediaItems((prev) => prev.map((m) => (m.id === id ? { ...m, altText } : m)));
    markDirty();
  };

  const handleMoveMedia = (id: string, direction: 'left' | 'right') => {
    setMediaItems((prev) => {
      const index = prev.findIndex((m) => m.id === id);
      if (index === -1) return prev;
      const source = prev[index];
      if (!source) return prev;
      const sameGallery = (candidate: StagedMediaItem) =>
        candidate.role === source.role &&
        (candidate.optionValueRef || candidate.optionValueId || null) ===
          (source.optionValueRef || source.optionValueId || null) &&
        (candidate.variantRef || candidate.variantId || null) ===
          (source.variantRef || source.variantId || null);
      const targetIndex = direction === 'left'
        ? prev.findLastIndex((candidate, candidateIndex) =>
            candidateIndex < index && sameGallery(candidate),
          )
        : prev.findIndex((candidate, candidateIndex) =>
            candidateIndex > index && sameGallery(candidate),
          );
      if (targetIndex < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      if (item) next.splice(targetIndex, 0, item);
      return next;
    });
    markDirty();
  };

  const handleUpdateMediaScope = (
    id: string,
    scope: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      variantId?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      optionValueRef?: string | null;
    },
  ) => {
    setMediaItems((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              ...(scope.role !== undefined ? { role: scope.role } : {}),
              ...(scope.variantId !== undefined ? { variantId: scope.variantId } : {}),
              ...(scope.optionValueId !== undefined ? { optionValueId: scope.optionValueId } : {}),
              ...(scope.variantRef !== undefined ? { variantRef: scope.variantRef } : {}),
              ...(scope.optionValueRef !== undefined
                ? { optionValueRef: scope.optionValueRef }
                : {}),
            }
          : m,
      ),
    );
    markDirty();
  };

  const handleAddExistingAssets = (
    assets: readonly SelectedMediaAsset[],
    targetScope?: {
      role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
      optionValueRef?: string | null;
      optionValueId?: string | null;
      variantRef?: string | null;
      variantId?: string | null;
    },
  ) => {
    if (assets.length === 0) return;
    const visualAxis = optionAxes.find((a) => a.isVisual && a.values.length > 0);
    const primaryVisualVal = visualAxis?.values.find((v) => v.isPrimary) || visualAxis?.values[0];

    const hasExplicitTarget = targetScope !== undefined;
    const resolvedOptionValueRef = hasExplicitTarget
      ? targetScope.optionValueRef ?? null
      : visualAxis
        ? primaryVisualVal?.id ?? null
        : null;

    const resolvedOptionValueId = hasExplicitTarget
      ? targetScope.optionValueId ?? null
      : visualAxis
        ? primaryVisualVal?.id ?? null
        : null;

    const resolvedVariantRef = targetScope?.variantRef ?? null;
    const resolvedVariantId = targetScope?.variantId ?? null;

    const canBecomePrimary = targetScope?.role !== 'SIZE_DIAGRAM';
    const newItems: StagedMediaItem[] = assets.map((asset, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 9)}`,
      assetId: asset.id,
      previewUrl: asset.previewUrl,
      isPrimary: canBecomePrimary && mediaItems.length === 0 && idx === 0,
      role:
        targetScope?.role ??
        (canBecomePrimary && mediaItems.length === 0 && idx === 0 ? 'THUMBNAIL' : 'GALLERY'),
      optionValueRef: resolvedOptionValueRef,
      optionValueId: resolvedOptionValueId,
      variantRef: resolvedVariantRef,
      variantId: resolvedVariantId,
      altText: asset.altText || title || 'Product Image',
      isUploading: false,
      uploadProgress: 100,
      processingStage: 'PROCESSING',
    }));

    setMediaItems((prev) => [...prev, ...newItems]);
    markDirty();
  };

  return {
    mediaItems,
    setMediaItems,
    isDraggingOver,
    setIsDraggingOver,
    removedMediaPlacementIds,
    fileInputRef,
    handleFilesSelected,
    handleSetPrimaryMedia,
    handleRemoveMedia,
    handleUpdateMediaAlt,
    handleMoveMedia,
    handleUpdateMediaScope,
    handleAddExistingAssets,
  };
}
