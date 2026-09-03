'use client';

import { Check, Loader2, Ruler } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { catalogData, catalogRequest } from '@/lib/catalog/api';
import type { SizeGuideSummaryDto } from '@maevelle/contracts';

export function ProductSizingForm({
  workspace,
  references,
  onRefresh,
  onMessage,
}: ProductEditorSectionProps) {
  const [busy, setBusy] = useState(false);
  const [guides, setGuides] = useState<SizeGuideSummaryDto[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(true);

  // Use the loaded workspace sizing configuration.
  const [systemId, setSystemId] = useState(workspace.sizeSystemId ?? '');
  const [guideId, setGuideId] = useState(workspace.sizeGuideId ?? '');

  useEffect(() => {
    let active = true;
    void catalogData<{ data: SizeGuideSummaryDto[] }>('/admin/sizing/guides')
      .then((res) => {
        if (active) {
          setGuides(res.data);
          setLoadingGuides(false);
        }
      })
      .catch(() => {
        if (active) setLoadingGuides(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        if (systemId) {
          await catalogRequest(`/admin/catalog/products/${workspace.id}/size-configuration`, {
            method: 'PUT',
            body: JSON.stringify({
              sizeSystemId: systemId,
              ...(guideId ? { sizeGuideId: guideId } : {}),
            }),
          });
        } else {
          await catalogRequest(`/admin/catalog/products/${workspace.id}/size-configuration`, {
            method: 'DELETE',
          });
        }
        await onRefresh('Sizing configuration updated.');
      } catch (error) {
        onMessage(error instanceof Error ? error.message : 'Could not save sizing configuration.');
      } finally {
        setBusy(false);
      }
    },
    [busy, workspace.id, systemId, guideId, onRefresh, onMessage],
  );

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <header className="mb-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <Ruler className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Sizing
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Attach a size system and a published size guide to this product.
        </p>
      </header>

      <form className="space-y-6" onSubmit={(e) => void submit(e)}>
        <fieldset className="space-y-4">
          <div>
            <label htmlFor="sizeSystemId" className="block text-sm font-medium text-foreground">
              Size System
            </label>
            <p className="mt-1 text-xs text-muted-foreground mb-2">
              Select the standardized sizing system used by this product's variants.
            </p>
            <select
              id="sizeSystemId"
              className="mt-1 block w-full rounded-md border-input bg-transparent py-2 pl-3 pr-10 text-sm shadow-sm focus:border-ring focus:ring-ring sm:text-sm"
              value={systemId}
              onChange={(e) => setSystemId(e.target.value)}
            >
              <option value="">No sizing system</option>
              {references.sizeSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sizeGuideId" className="block text-sm font-medium text-foreground">
              Size Guide
            </label>
            <p className="mt-1 text-xs text-muted-foreground mb-2">
              Attach a specific published size guide. If omitted, the product will fall back to the category default guide if available.
            </p>
            <select
              id="sizeGuideId"
              className="mt-1 block w-full rounded-md border-input bg-transparent py-2 pl-3 pr-10 text-sm shadow-sm focus:border-ring focus:ring-ring sm:text-sm"
              value={guideId}
              onChange={(e) => setGuideId(e.target.value)}
              disabled={loadingGuides}
            >
              <option value="">Use category default / No guide</option>
              {guides.map((guide) => (
                <option key={guide.id} value={guide.id}>
                  {guide.name} (v{guide.version})
                </option>
              ))}
            </select>
            {loadingGuides && <p className="mt-2 text-xs text-slate-500">Loading guides...</p>}
          </div>
        </fieldset>

        <div className="flex items-center gap-4 border-t pt-6">
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Save Sizing
          </Button>
        </div>
      </form>
    </section>
  );
}
