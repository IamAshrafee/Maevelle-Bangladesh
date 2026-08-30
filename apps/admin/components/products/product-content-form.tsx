'use client';

import { useEffect, useMemo, useState } from 'react';

import type { CatalogProductWorkspaceDto } from '@maevelle/contracts';

import { CatalogContentEditor } from '@/components/catalog-content-editor';
import {
  catalogContentFromWorkspace,
  catalogContentPayload,
  isCatalogContentDirty,
  mergeCatalogContent,
  type CatalogContentConflict,
  type CatalogContentValues,
  useCurrentCatalogContentConflicts,
} from '@/components/catalog-content-state';
import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { CatalogRequestError, catalogData } from '@/lib/catalog/api';

export function ProductContentForm({
  workspace,
  onRefresh,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const source = useMemo(() => catalogContentFromWorkspace(workspace), [workspace]);
  const [baseline, setBaseline] = useState<CatalogContentValues>(source);
  const [draft, setDraft] = useState<CatalogContentValues>(source);
  const [current, setCurrent] = useState<CatalogContentValues>(source);
  const [conflicts, setConflicts] = useState<readonly CatalogContentConflict[]>([]);
  const [transientDirty, setTransientDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = isCatalogContentDirty(baseline, draft);

  useEffect(() => {
    if (dirty || transientDirty) return;
    setBaseline(source);
    setDraft(source);
    setCurrent(source);
    setConflicts([]);
  }, [dirty, source, transientDirty]);
  useEffect(() => onDirtyChange(dirty || transientDirty), [dirty, onDirtyChange, transientDirty]);

  async function save() {
    if (!dirty || busy || conflicts.length > 0) return;
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/content`, {
        method: 'PUT',
        headers: { 'if-match': `"${workspace.version}"` },
        body: JSON.stringify(catalogContentPayload(draft)),
      });
      setBaseline(draft);
      await onRefresh('Customer information, FAQs, and search content saved.');
    } catch (caught) {
      if (caught instanceof CatalogRequestError && caught.status === 409) {
        try {
          const latest = await catalogData<CatalogProductWorkspaceDto>(
            `/admin/catalog/products/${workspace.id}`,
          );
          const latestContent = catalogContentFromWorkspace(latest);
          const merged = mergeCatalogContent(baseline, draft, latestContent);
          setDraft(merged.draft);
          setCurrent(latestContent);
          setConflicts(merged.conflicts);
          setError(
            merged.conflicts.length > 0
              ? 'Another operator changed the same content. Choose which version to keep.'
              : 'New server changes were merged with your draft. Review and save again.',
          );
        } catch {
          setError(
            'This Product changed elsewhere. Your draft is preserved; reload before saving.',
          );
        }
      } else
        setError(caught instanceof Error ? caught.message : 'Product content could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function resolve(choice: 'LOCAL' | 'CURRENT') {
    if (choice === 'CURRENT')
      setDraft(useCurrentCatalogContentConflicts(draft, current, conflicts));
    setConflicts([]);
    setError('');
  }

  return (
    <CatalogContentEditor
      busy={busy}
      conflicts={conflicts}
      dirty={dirty}
      draft={draft}
      error={error}
      handle={workspace.handle}
      productDescription={workspace.description ?? ''}
      productTitle={workspace.title}
      onChange={setDraft}
      onDiscard={() => {
        setDraft(baseline);
        setConflicts([]);
        setError('');
      }}
      onResolveConflicts={resolve}
      onSave={() => void save()}
      onTransientDirtyChange={setTransientDirty}
    />
  );
}
