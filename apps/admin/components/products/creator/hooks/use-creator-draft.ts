'use client';

import { useEffect, useState } from 'react';
import type { ProductCreatorDraft } from '../types';

export const DRAFT_STORAGE_KEY = 'maevelle_product_creator_draft_v2';

export function getDraftStorageKey(productId?: string): string {
  return productId ? `maevelle_product_draft_${productId}` : 'maevelle_product_creator_draft_new';
}

interface UseCreatorDraftOptions {
  readonly productId?: string | undefined;
  readonly isEditMode: boolean;
  readonly isDirty: boolean;
  readonly loading: boolean;
  readonly getDraftData: () => Omit<ProductCreatorDraft, 'timestamp'>;
  readonly onRestore: (draft: ProductCreatorDraft) => void;
  readonly onError?: (message: string) => void;
}

export function useCreatorDraft({
  productId,
  isEditMode,
  isDirty,
  loading,
  getDraftData,
  onRestore,
  onError,
}: UseCreatorDraftOptions) {
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);

  // Check for local draft on initial load
  useEffect(() => {
    if (loading) return;
    try {
      const activeKey = getDraftStorageKey(productId);
      const rawDraft =
        localStorage.getItem(activeKey) || (!isEditMode ? localStorage.getItem(DRAFT_STORAGE_KEY) : null);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as ProductCreatorDraft;
        if (parsed && parsed.timestamp && (parsed.title || parsed.description)) {
          setDraftTimestamp(parsed.timestamp);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [productId, isEditMode, loading]);

  // Draft Autosave to localStorage (Debounced 1.5s)
  useEffect(() => {
    if (!isDirty || loading) return;

    const timer = setTimeout(() => {
      try {
        const draft: ProductCreatorDraft = {
          timestamp: Date.now(),
          ...getDraftData(),
        };
        const activeKey = getDraftStorageKey(productId);
        localStorage.setItem(activeKey, JSON.stringify(draft));
      } catch {
        // quota exceeded or storage disabled
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isDirty, loading, productId, getDraftData]);

  const handleRestoreDraft = () => {
    try {
      const activeKey = getDraftStorageKey(productId);
      const raw = localStorage.getItem(activeKey) || localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as ProductCreatorDraft;
      if (!d) return;

      onRestore(d);
      setDraftTimestamp(null);
    } catch {
      onError?.('Failed to parse cached draft.');
    }
  };

  const handleDiscardDraft = () => {
    const activeKey = getDraftStorageKey(productId);
    localStorage.removeItem(activeKey);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraftTimestamp(null);
  };

  const clearDraft = () => {
    const activeKey = getDraftStorageKey(productId);
    localStorage.removeItem(activeKey);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  return {
    draftTimestamp,
    setDraftTimestamp,
    handleRestoreDraft,
    handleDiscardDraft,
    clearDraft,
  };
}
