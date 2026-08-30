'use client';

import { CheckCircle2, Save } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { CatalogProductSummaryDto } from '@maevelle/contracts';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData } from '@/lib/catalog/api';

type OrganizationDraft = {
  categoryIds: string[];
  primaryCategoryId: string;
  tagIds: string[];
  occasionIds: string[];
  collectionIds: string[];
  attributeValues: Record<string, string | boolean | null>;
};

function initialDraft(workspace: ProductEditorSectionProps['workspace']): OrganizationDraft {
  return {
    categoryIds: [...workspace.organization.categoryIds],
    primaryCategoryId: workspace.organization.primaryCategoryId ?? '',
    tagIds: [...workspace.organization.tagIds],
    occasionIds: [...workspace.organization.occasionIds],
    collectionIds: [...workspace.organization.collectionIds],
    attributeValues: Object.fromEntries(
      workspace.organization.attributes.map((attribute) => [attribute.id, attribute.value]),
    ),
  };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function ProductOrganizationForm({
  workspace,
  references,
  onRefresh,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const source = useMemo(() => initialDraft(workspace), [workspace]);
  const [baseline, setBaseline] = useState(source);
  const [draft, setDraft] = useState(source);
  const [currentVersion, setCurrentVersion] = useState(workspace.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = !same(baseline, draft);

  useEffect(() => {
    setBaseline(source);
    setDraft(source);
    setCurrentVersion(workspace.version);
  }, [source, workspace.version]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function toggle(field: 'categoryIds' | 'tagIds' | 'occasionIds' | 'collectionIds', id: string) {
    setDraft((current) => {
      const selected = current[field].includes(id)
        ? current[field].filter((candidate) => candidate !== id)
        : [...current[field], id];
      return {
        ...current,
        [field]: selected,
        ...(field === 'categoryIds' &&
        current.primaryCategoryId &&
        !selected.includes(current.primaryCategoryId)
          ? { primaryCategoryId: '' }
          : {}),
      };
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || busy) return;
    const missing = workspace.organization.attributes.filter(
      (attribute) =>
        attribute.required &&
        (draft.attributeValues[attribute.id] === null ||
          draft.attributeValues[attribute.id] === '' ||
          draft.attributeValues[attribute.id] === undefined),
    );
    if (missing.length > 0)
      return setError(
        `Complete required ${missing.map((attribute) => attribute.name).join(', ')} before saving.`,
      );
    setBusy(true);
    setError('');
    let version = currentVersion;
    let nextBaseline = baseline;
    try {
      const categoriesChanged =
        !same(baseline.categoryIds, draft.categoryIds) ||
        baseline.primaryCategoryId !== draft.primaryCategoryId;
      if (categoriesChanged) {
        const saved = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${workspace.id}/categories`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${version}"` },
            body: JSON.stringify({
              categoryIds: draft.categoryIds,
              primaryCategoryId: draft.primaryCategoryId || null,
            }),
          },
        );
        version = saved.version;
        setCurrentVersion(version);
        nextBaseline = {
          ...nextBaseline,
          categoryIds: [...draft.categoryIds],
          primaryCategoryId: draft.primaryCategoryId,
        };
        setBaseline(nextBaseline);
      }
      if (!same(baseline.attributeValues, draft.attributeValues)) {
        const saved = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${workspace.id}/attributes`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${version}"` },
            body: JSON.stringify({
              values: workspace.organization.attributes.map((attribute) => ({
                attributeDefinitionId: attribute.id,
                value: draft.attributeValues[attribute.id] ?? null,
              })),
            }),
          },
        );
        version = saved.version;
        setCurrentVersion(version);
        nextBaseline = { ...nextBaseline, attributeValues: { ...draft.attributeValues } };
        setBaseline(nextBaseline);
      }
      const vocabularyChanged =
        !same(baseline.tagIds, draft.tagIds) ||
        !same(baseline.occasionIds, draft.occasionIds) ||
        !same(baseline.collectionIds, draft.collectionIds);
      if (vocabularyChanged) {
        await catalogData(`/admin/catalog/products/${workspace.id}/vocabulary`, {
          method: 'PUT',
          body: JSON.stringify({
            version,
            tagIds: draft.tagIds,
            occasionIds: draft.occasionIds,
            collectionIds: draft.collectionIds,
          }),
        });
      }
      await onRefresh('Product organization and structured attributes saved.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message} Successfully saved sections remain saved; your remaining entries are preserved.`
          : 'Product organization could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={(event) => void save(event)}>
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Categories</h2>
          <p className="text-sm text-muted-foreground">
            Place this Product in every relevant navigation path and choose its main placement.
          </p>
        </header>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Assigned Categories</legend>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {references.categories.map((category) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  key={category.id}
                >
                  <input
                    checked={draft.categoryIds.includes(category.id)}
                    type="checkbox"
                    onChange={() => toggle('categoryIds', category.id)}
                  />
                  <span className="min-w-0 truncate">{category.path}</span>
                </label>
              ))}
              {references.categories.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  No active Categories are available.
                </p>
              ) : null}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="primary-category">Primary Category</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              disabled={draft.categoryIds.length === 0}
              id="primary-category"
              value={draft.primaryCategoryId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, primaryCategoryId: event.target.value }))
              }
            >
              <option value="">No primary category</option>
              {references.categories
                .filter((category) => draft.categoryIds.includes(category.id))
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.path}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The primary Category is the canonical merchandising placement.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Structured Attributes</h2>
          <p className="text-sm text-muted-foreground">
            Fields come from {workspace.productTypeName} and power filters, search, and customer
            details.
          </p>
        </header>
        <fieldset className="grid gap-5 p-5 sm:grid-cols-2">
          <legend className="sr-only">Product attributes</legend>
          {workspace.organization.attributes.map((attribute) => {
            const value = draft.attributeValues[attribute.id];
            return (
              <div className="space-y-2" key={attribute.id}>
                <Label htmlFor={`attribute-${attribute.id}`}>
                  {attribute.name}
                  {attribute.required ? (
                    <span className="ml-1 text-destructive" aria-label="required">
                      Required
                    </span>
                  ) : null}
                </Label>
                {attribute.valueType === 'BOOLEAN' ? (
                  <select
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    id={`attribute-${attribute.id}`}
                    value={value === null ? '' : value ? 'true' : 'false'}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        attributeValues: {
                          ...current.attributeValues,
                          [attribute.id]:
                            event.target.value === '' ? null : event.target.value === 'true',
                        },
                      }))
                    }
                  >
                    <option value="">Not set</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : attribute.valueType === 'REFERENCE' ? (
                  <select
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    id={`attribute-${attribute.id}`}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        attributeValues: {
                          ...current.attributeValues,
                          [attribute.id]: event.target.value || null,
                        },
                      }))
                    }
                  >
                    <option value="">Choose {attribute.name}</option>
                    {attribute.referenceOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                        {option.status === 'ARCHIVED' ? ' (Archived)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    autoComplete="off"
                    id={`attribute-${attribute.id}`}
                    inputMode={
                      attribute.valueType === 'INTEGER' || attribute.valueType === 'DECIMAL'
                        ? 'decimal'
                        : undefined
                    }
                    type={attribute.valueType === 'DATE' ? 'date' : 'text'}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        attributeValues: {
                          ...current.attributeValues,
                          [attribute.id]: event.target.value || null,
                        },
                      }))
                    }
                  />
                )}
              </div>
            );
          })}
          {workspace.organization.attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              This Product Type has no active Product-level attributes.
            </p>
          ) : null}
        </fieldset>
      </section>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Merchandising Labels</h2>
          <p className="text-sm text-muted-foreground">
            Controlled discovery labels do not create sellable Variants.
          </p>
        </header>
        <div className="grid gap-5 p-5 lg:grid-cols-3">
          {(
            [
              ['Tags', 'tagIds', references.tags],
              ['Occasions', 'occasionIds', references.occasions],
              ['Collections', 'collectionIds', references.collections],
            ] as const
          ).map(([label, field, items]) => (
            <fieldset key={field}>
              <legend className="mb-2 text-sm font-medium">{label}</legend>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                {items.map((item) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    key={item.id}
                  >
                    <input
                      checked={draft[field].includes(item.id)}
                      type="checkbox"
                      onChange={() => toggle(field, item.id)}
                    />
                    <span className="truncate">{item.name}</span>
                  </label>
                ))}
                {items.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">None available.</p>
                ) : null}
              </div>
            </fieldset>
          ))}
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
      <footer className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <span
          className="flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {dirty ? (
            'Unsaved organization changes'
          ) : (
            <>
              <CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" /> Organization
              is saved
            </>
          )}
        </span>
        <Button type="submit" disabled={!dirty || busy}>
          <Save aria-hidden="true" /> {busy ? 'Saving…' : 'Save Organization'}
        </Button>
      </footer>
    </form>
  );
}
