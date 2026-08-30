'use client';

import { ArrowLeft, CheckCircle2, FileCheck2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { ProductReadiness } from '@/components/products/product-readiness';
import { Button } from '@/components/ui/button';
import { catalogData } from '@/lib/catalog/api';

export function ProductReview({ workspace, onRefresh, onDirtyChange }: ProductEditorSectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => onDirtyChange(false), [onDirtyChange]);

  async function publish() {
    if (!workspace.readiness.canPublish || busy) return;
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ version: workspace.version }),
      });
      await onRefresh('Product published. It is now eligible for Storefront discovery.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product could not be published.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ProductReadiness productId={workspace.id} readiness={workspace.readiness} />
      <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Final Decision
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {workspace.publicationStatus === 'PUBLISHED'
                ? 'This Product is Published'
                : workspace.readiness.canPublish
                  ? 'Ready to Publish'
                  : 'Keep as a Draft'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {workspace.publicationStatus === 'PUBLISHED'
                ? 'Changes to pricing, inventory, galleries, and product content continue to update the active Product under their normal visibility rules.'
                : workspace.readiness.canPublish
                  ? 'All required commerce data is present. Publishing makes this Product eligible for customer search, category listings, and its Storefront URL.'
                  : 'Drafts are safe to leave incomplete. Resolve each publishing blocker above; warnings are recommendations and do not prevent publishing.'}
            </p>
          </div>
          <div className="grid gap-2">
            {workspace.publicationStatus !== 'PUBLISHED' ? (
              <Button
                className="w-full"
                disabled={busy || !workspace.readiness.canPublish}
                onClick={() => void publish()}
              >
                <CheckCircle2 aria-hidden="true" /> {busy ? 'Publishing…' : 'Publish Product'}
              </Button>
            ) : null}
            <Button
              className="w-full"
              variant="outline"
              render={<Link href={`/products/${workspace.id}`} />}
            >
              <FileCheck2 aria-hidden="true" /> View Full Product Details
            </Button>
            <Button className="w-full" variant="ghost" render={<Link href="/products" />}>
              <ArrowLeft aria-hidden="true" /> Finish and Return to Products
            </Button>
          </div>
        </div>
      </section>
      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
