'use client';

import { AlertTriangle, Save, Undo2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { CatalogProductUpdateDto } from '@maevelle/contracts';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData, CatalogRequestError } from '@/lib/catalog/api';

export function ProductOverviewForm({
  workspace,
  references,
  onRefresh,
  onMessage,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const baseline = useMemo(
    () => ({
      title: workspace.title,
      handle: workspace.handle,
      productTypeId: workspace.productTypeId,
      description: workspace.description ?? '',
    }),
    [workspace],
  );
  const [values, setValues] = useState(baseline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);

  useEffect(() => setValues(baseline), [baseline]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || busy) return;
    const title = values.title.trim();
    const handle = values.handle.trim();
    if (!title) return setError('Product name is required.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle))
      return setError('Storefront handle must use lowercase words separated by hyphens.');
    if (
      values.productTypeId !== baseline.productTypeId &&
      workspace.variants.length > 0 &&
      !window.confirm(
        'Changing Product Type may change required attributes and sizing expectations. Existing Variants remain intact. Continue?',
      )
    )
      return;
    const payload: CatalogProductUpdateDto = {
      title,
      handle,
      productTypeId: values.productTypeId,
      description: values.description.trim() || null,
    };
    setBusy(true);
    setError('');
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'if-match': `"${workspace.version}"` },
        body: JSON.stringify(payload),
      });
      await onRefresh('Product overview saved. Publishing readiness was recalculated.');
    } catch (caught) {
      setError(
        caught instanceof CatalogRequestError && caught.code === 'STALE_VERSION'
          ? 'This Product changed in another session. Your entries are preserved. Open the details page in another tab to compare, then retry after refreshing.'
          : caught instanceof Error
            ? caught.message
            : 'Product overview could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      noValidate
      onSubmit={(event) => void save(event)}
    >
      <header className="border-b px-5 py-4">
        <h2 className="font-semibold">Product Overview</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Shared customer identity and the structural Product Type.
        </p>
      </header>
      <fieldset className="grid gap-5 p-5 sm:grid-cols-2" disabled={busy}>
        <legend className="sr-only">Product overview</legend>
        <div className="space-y-2">
          <Label htmlFor="edit-product-title">Product Name</Label>
          <Input
            autoComplete="off"
            id="edit-product-title"
            maxLength={180}
            name="title"
            required
            value={values.title}
            onChange={(event) => {
              setValues((current) => ({ ...current, title: event.target.value }));
              setError('');
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-product-handle">Storefront Handle</Label>
          <Input
            autoCapitalize="none"
            autoComplete="off"
            id="edit-product-handle"
            maxLength={160}
            name="handle"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            spellCheck={false}
            value={values.handle}
            onChange={(event) => {
              setValues((current) => ({
                ...current,
                handle: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
              }));
              setError('');
            }}
          />
          <p className="text-xs text-muted-foreground">
            Changes preserve the old published handle as a redirect.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-product-type">Product Type</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            id="edit-product-type"
            name="productTypeId"
            value={values.productTypeId}
            onChange={(event) =>
              setValues((current) => ({ ...current, productTypeId: event.target.value }))
            }
          >
            {references.types
              .filter((type) => type.status === 'ACTIVE' || type.id === values.productTypeId)
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {type.status === 'ARCHIVED' ? ' (Archived)' : ''}
                </option>
              ))}
          </select>
          {values.productTypeId !== baseline.productTypeId ? (
            <p className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> Changing type
              recalculates required Product attributes. Incompatible values are never silently
              deleted.
            </p>
          ) : null}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex justify-between gap-3">
            <Label htmlFor="edit-product-description">Customer Description</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {values.description.length}/5000
            </span>
          </div>
          <textarea
            className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            id="edit-product-description"
            maxLength={5000}
            name="description"
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
          />
        </div>
      </fieldset>
      {error ? (
        <p
          className="mx-5 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <footer className="flex items-center justify-between gap-3 border-t bg-muted/35 px-5 py-4">
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {dirty ? 'Unsaved overview changes' : `Version ${workspace.version} is saved`}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || busy}
            onClick={() => {
              setValues(baseline);
              setError('');
              onMessage('Overview changes discarded.');
            }}
          >
            <Undo2 aria-hidden="true" /> Discard
          </Button>
          <Button type="submit" disabled={!dirty || busy}>
            <Save aria-hidden="true" /> {busy ? 'Saving…' : 'Save Overview'}
          </Button>
        </div>
      </footer>
    </form>
  );
}
