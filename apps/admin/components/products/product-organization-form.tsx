'use client';

import { CheckCircle2, Save, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import type { CatalogProductSummaryDto, SizeGuideSummaryDto } from '@maevelle/contracts';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData, catalogRequest } from '@/lib/catalog/api';

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function ProductOrganizationForm({
  workspace,
  references,
  onRefresh,
  onMessage,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const [error, setError] = useState('');
  const [guides, setGuides] = useState<SizeGuideSummaryDto[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(true);

  useEffect(() => {
    let active = true;
    void catalogData<SizeGuideSummaryDto[]>('/admin/sizing/guides')
      .then((res) => {
        if (active) {
          setGuides(res ?? []);
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

  const dynamicSchema = useMemo(() => {
    return z.object({
      categoryIds: z.array(z.string()),
      primaryCategoryId: z.string().optional().nullable(),
      tagIds: z.array(z.string()),
      occasionIds: z.array(z.string()),
      collectionIds: z.array(z.string()),
      sizeSystemId: z.string().optional().nullable(),
      sizeGuideId: z.string().optional().nullable(),
      attributeValues: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()]))
    }).superRefine((data, ctx) => {
      workspace.organization.attributes.forEach((attr) => {
        if (attr.required) {
          const val = data.attributeValues[attr.id];
          if (val === null || val === '' || val === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${attr.name} is required.`,
              path: ['attributeValues', attr.id],
            });
          }
        }
      });
    });
  }, [workspace.organization.attributes]);

  type FormValues = z.infer<typeof dynamicSchema>;

  const baseline = useMemo(() => ({
    categoryIds: [...workspace.organization.categoryIds],
    primaryCategoryId: workspace.organization.primaryCategoryId ?? '',
    tagIds: [...workspace.organization.tagIds],
    occasionIds: [...workspace.organization.occasionIds],
    collectionIds: [...workspace.organization.collectionIds],
    sizeSystemId: workspace.sizeSystemId ?? '',
    sizeGuideId: workspace.sizeGuideId ?? '',
    attributeValues: Object.fromEntries(
      workspace.organization.attributes.map((attribute) => [attribute.id, attribute.value]),
    ),
  }), [workspace.organization]);

  const form = useForm<FormValues>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: baseline,
  });

  useEffect(() => {
    form.reset(baseline);
  }, [baseline, form]);

  useEffect(() => onDirtyChange(form.formState.isDirty), [form.formState.isDirty, onDirtyChange]);

  function toggleArrayField(field: 'categoryIds' | 'tagIds' | 'occasionIds' | 'collectionIds', id: string) {
    const current = form.getValues(field);
    const selected = current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id];
    
    form.setValue(field, selected, { shouldDirty: true, shouldValidate: true });

    if (field === 'categoryIds') {
      const primary = form.getValues('primaryCategoryId');
      if (primary && !selected.includes(primary)) {
        form.setValue('primaryCategoryId', '', { shouldDirty: true, shouldValidate: true });
      }
    }
  }

  async function onSubmit(values: FormValues) {
    if (!form.formState.isDirty) return;
    
    setError('');
    let version = workspace.version;
    
    try {
      const categoriesChanged =
        !same(baseline.categoryIds, values.categoryIds) ||
        baseline.primaryCategoryId !== values.primaryCategoryId;
      
      if (categoriesChanged) {
        const saved = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${workspace.id}/categories`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${version}"` },
            body: JSON.stringify({
              categoryIds: values.categoryIds,
              primaryCategoryId: values.primaryCategoryId || null,
            }),
          },
        );
        version = saved.version;
      }
      
      if (!same(baseline.attributeValues, values.attributeValues)) {
        const saved = await catalogData<CatalogProductSummaryDto>(
          `/admin/catalog/products/${workspace.id}/attributes`,
          {
            method: 'PUT',
            headers: { 'if-match': `"${version}"` },
            body: JSON.stringify({
              values: workspace.organization.attributes.map((attribute) => ({
                attributeDefinitionId: attribute.id,
                value: values.attributeValues[attribute.id] ?? null,
              })),
            }),
          },
        );
        version = saved.version;
      }
      
      const vocabularyChanged =
        !same(baseline.tagIds, values.tagIds) ||
        !same(baseline.occasionIds, values.occasionIds) ||
        !same(baseline.collectionIds, values.collectionIds);
        
      if (vocabularyChanged) {
        await catalogData(`/admin/catalog/products/${workspace.id}/vocabulary`, {
          method: 'PUT',
          body: JSON.stringify({
            version,
            tagIds: values.tagIds,
            occasionIds: values.occasionIds,
            collectionIds: values.collectionIds,
          }),
        });
      }

      if (baseline.sizeSystemId !== values.sizeSystemId || baseline.sizeGuideId !== values.sizeGuideId) {
        if (values.sizeSystemId) {
          await catalogRequest(`/admin/catalog/products/${workspace.id}/size-configuration`, {
            method: 'PUT',
            body: JSON.stringify({
              sizeSystemId: values.sizeSystemId,
              ...(values.sizeGuideId ? { sizeGuideId: values.sizeGuideId } : {}),
            }),
          });
        } else {
          await catalogRequest(`/admin/catalog/products/${workspace.id}/size-configuration`, {
            method: 'DELETE',
          });
        }
      }
      
      await onRefresh('Product organization and structured attributes saved.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `${caught.message} Successfully saved sections remain saved; your remaining entries are preserved.`
          : 'Product organization could not be saved.',
      );
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <header className="border-b px-5 py-4">
          <h2 className="font-semibold">Categories</h2>
          <p className="text-sm text-muted-foreground">
            Place this Product in every relevant navigation path and choose its main placement.
          </p>
        </header>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <fieldset disabled={form.formState.isSubmitting}>
            <legend className="mb-2 text-sm font-medium">Assigned Categories</legend>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {references.categories.map((category) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  key={category.id}
                >
                  <input
                    checked={form.watch('categoryIds').includes(category.id)}
                    type="checkbox"
                    onChange={() => toggleArrayField('categoryIds', category.id)}
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
            {form.formState.errors.categoryIds && (
              <p className="mt-1 text-sm text-destructive">{form.formState.errors.categoryIds.message}</p>
            )}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="primary-category">Primary Category</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              disabled={form.watch('categoryIds').length === 0 || form.formState.isSubmitting}
              id="primary-category"
              {...form.register('primaryCategoryId')}
            >
              <option value="">No primary category</option>
              {references.categories
                .filter((category) => form.watch('categoryIds').includes(category.id))
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
        <fieldset className="grid gap-5 p-5 sm:grid-cols-2" disabled={form.formState.isSubmitting}>
          <legend className="sr-only">Product attributes</legend>
          {workspace.organization.attributes.map((attribute) => {
            const value = form.watch(`attributeValues.${attribute.id}`);
            const errorObj = form.formState.errors.attributeValues?.[attribute.id];
            
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
                    value={value === null || value === undefined ? '' : value ? 'true' : 'false'}
                    onChange={(event) =>
                      form.setValue(
                        `attributeValues.${attribute.id}`, 
                        event.target.value === '' ? null : event.target.value === 'true',
                        { shouldDirty: true, shouldValidate: true }
                      )
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
                      form.setValue(
                        `attributeValues.${attribute.id}`, 
                        event.target.value || null,
                        { shouldDirty: true, shouldValidate: true }
                      )
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
                      form.setValue(
                        `attributeValues.${attribute.id}`, 
                        event.target.value || null,
                        { shouldDirty: true, shouldValidate: true }
                      )
                    }
                  />
                )}
                {errorObj && <p className="text-sm text-destructive">{errorObj.message}</p>}
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
          <h2 className="font-semibold">Sizing</h2>
          <p className="text-sm text-muted-foreground">
            Attach a size system and a published size guide to this product.
          </p>
        </header>
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <fieldset disabled={form.formState.isSubmitting} className="space-y-2">
            <Label htmlFor="sizeSystemId">Size System</Label>
            <select
              id="sizeSystemId"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              {...form.register('sizeSystemId')}
            >
              <option value="">No sizing system</option>
              {references.sizeSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Select the standardized sizing system used by this product's variants.
            </p>
          </fieldset>

          <fieldset disabled={form.formState.isSubmitting} className="space-y-2">
            <Label htmlFor="sizeGuideId">Size Guide</Label>
            <select
              id="sizeGuideId"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              disabled={loadingGuides || form.formState.isSubmitting}
              {...form.register('sizeGuideId')}
            >
              <option value="">Use category default / No guide</option>
              {guides.map((guide) => (
                <option key={guide.id} value={guide.id}>
                  {guide.name} (v{guide.version})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Attach a specific published size guide.
            </p>
          </fieldset>
        </div>
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
            <fieldset key={field} disabled={form.formState.isSubmitting}>
              <legend className="mb-2 text-sm font-medium">{label}</legend>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                {items.map((item) => (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    key={item.id}
                  >
                    <input
                      checked={form.watch(field).includes(item.id)}
                      type="checkbox"
                      onChange={() => toggleArrayField(field, item.id)}
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
          {form.formState.isDirty ? (
            'Unsaved organization changes'
          ) : (
            <>
              <CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" /> Organization
              is saved
            </>
          )}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
            onClick={() => {
              form.reset();
              setError('');
              onMessage('Organization changes discarded.');
            }}
          >
            <Undo2 aria-hidden="true" /> Discard
          </Button>
          <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
            <Save aria-hidden="true" /> {form.formState.isSubmitting ? 'Saving…' : 'Save Organization'}
          </Button>
        </div>
      </footer>
    </form>
  );
}
