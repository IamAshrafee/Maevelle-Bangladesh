'use client';

import { AlertTriangle, ArrowRight, Save, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { CatalogProductUpdateDto, CatalogProductCreateDto, CatalogProductSummaryDto } from '@maevelle/contracts';

import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData, CatalogRequestError } from '@/lib/catalog/api';

const formSchema = z.object({
  title: z.string().min(1, 'Enter the customer-facing Product name.'),
  handle: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Storefront handle must use lowercase words separated by hyphens.'),
  productTypeId: z.string().min(1, 'Choose a Product Type.'),
  description: z.string().max(5000).optional().nullable()
});

type FormValues = z.infer<typeof formSchema>;

function handleFromTitle(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function ProductOverviewForm({
  workspace,
  references,
  onRefresh,
  onMessage,
  onDirtyChange,
}: ProductEditorSectionProps) {
  const router = useRouter();
  const isNew = workspace.id === '';
  const [error, setError] = useState('');
  const [handleEdited, setHandleEdited] = useState(!isNew); // If editing, don't auto-update handle

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: workspace.title || '',
      handle: workspace.handle || '',
      productTypeId: workspace.productTypeId || '',
      description: workspace.description || ''
    }
  });

  // Automatically select first active product type if new and none selected
  useEffect(() => {
    if (isNew && !form.getValues('productTypeId')) {
      const activeType = references.types.find(t => t.status === 'ACTIVE');
      if (activeType) {
        form.setValue('productTypeId', activeType.id, { shouldValidate: true, shouldDirty: false });
      }
    }
  }, [isNew, references.types, form]);

  useEffect(() => onDirtyChange(form.formState.isDirty), [form.formState.isDirty, onDirtyChange]);

  async function onSubmit(values: FormValues) {
    if (!form.formState.isDirty) return;

    if (
      !isNew &&
      values.productTypeId !== workspace.productTypeId &&
      workspace.variants.length > 0 &&
      !window.confirm(
        'Changing Product Type may change required attributes and sizing expectations. Existing Variants remain intact. Continue?',
      )
    ) {
      return;
    }

    setError('');

    try {
      if (isNew) {
        const payload: CatalogProductCreateDto = {
          title: values.title.trim(),
          handle: values.handle.trim(),
          productTypeId: values.productTypeId,
          ...(values.description?.trim() ? { description: values.description.trim() } : {}),
        };
        
        const product = await catalogData<CatalogProductSummaryDto>('/admin/catalog/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        
        // Reset so we don't block navigation with unsaved changes prompt
        form.reset(values);
        onDirtyChange(false);
        
        router.replace(`/products/${product.id}/edit?setup=1&section=organization`);
      } else {
        const payload: CatalogProductUpdateDto = {
          title: values.title.trim(),
          handle: values.handle.trim(),
          productTypeId: values.productTypeId,
          description: values.description?.trim() || null,
        };

        await catalogData(`/admin/catalog/products/${workspace.id}`, {
          method: 'PATCH',
          headers: { 'if-match': `"${workspace.version}"` },
          body: JSON.stringify(payload),
        });
        
        form.reset(values);
        await onRefresh('Product overview saved. Publishing readiness was recalculated.');
      }
    } catch (caught) {
      setError(
        caught instanceof CatalogRequestError && caught.code === 'STALE_VERSION'
          ? 'This Product changed in another session. Your entries are preserved. Open the details page in another tab to compare, then retry after refreshing.'
          : caught instanceof Error
            ? caught.message
            : 'Product overview could not be saved.',
      );
    }
  }

  return (
    <form
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <header className="border-b px-5 py-4">
        <h2 className="font-semibold">Product Overview</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Shared customer identity and the structural Product Type.
        </p>
      </header>
      <fieldset className="grid gap-5 p-5 sm:grid-cols-2" disabled={form.formState.isSubmitting}>
        <legend className="sr-only">Product overview</legend>
        <div className="space-y-2">
          <Label htmlFor="edit-product-title">Product Name</Label>
          <Input
            autoComplete="off"
            id="edit-product-title"
            maxLength={180}
            placeholder="Example: Linen Wrap Dress…"
            {...form.register('title')}
            onChange={(event) => {
              const value = event.target.value;
              form.setValue('title', value, { shouldValidate: true, shouldDirty: true });
              if (!handleEdited) {
                form.setValue('handle', handleFromTitle(value), { shouldValidate: true, shouldDirty: true });
              }
              setError('');
            }}
          />
          {form.formState.errors.title && (
            <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-product-handle">Storefront Handle</Label>
          <Input
            autoCapitalize="none"
            autoComplete="off"
            id="edit-product-handle"
            maxLength={160}
            placeholder="linen-wrap-dress…"
            spellCheck={false}
            {...form.register('handle')}
            onChange={(event) => {
              setHandleEdited(true);
              form.setValue('handle', handleFromTitle(event.target.value), { shouldValidate: true, shouldDirty: true });
              setError('');
            }}
          />
          {form.formState.errors.handle ? (
            <p className="text-sm text-destructive">{form.formState.errors.handle.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isNew ? 'Storefront URL preview.' : 'Changes preserve the old published handle as a redirect.'}
            </p>
          )}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="edit-product-type">Product Type</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            id="edit-product-type"
            {...form.register('productTypeId')}
          >
            {isNew && <option value="">Choose a Product Type</option>}
            {references.types
              .filter((type) => type.status === 'ACTIVE' || type.id === form.getValues('productTypeId'))
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {type.status === 'ARCHIVED' ? ' (Archived)' : ''}
                </option>
              ))}
          </select>
          {form.formState.errors.productTypeId && (
            <p className="text-sm text-destructive">{form.formState.errors.productTypeId.message}</p>
          )}
          {!isNew && form.watch('productTypeId') !== workspace.productTypeId ? (
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
              {form.watch('description')?.length || 0}/5000
            </span>
          </div>
          <textarea
            className="min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            id="edit-product-description"
            maxLength={5000}
            placeholder="Describe the material, silhouette, finish, use, and customer value…"
            {...form.register('description')}
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
          {isNew ? 'New product draft' : (form.formState.isDirty ? 'Unsaved overview changes' : `Version ${workspace.version} is saved`)}
        </span>
        <div className="flex gap-2">
          {!isNew && (
            <Button
              type="button"
              variant="outline"
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
              onClick={() => {
                form.reset();
                setError('');
                onMessage('Overview changes discarded.');
              }}
            >
              <Undo2 aria-hidden="true" /> Discard
            </Button>
          )}
          <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
            {isNew ? (
              <>Save & Continue <ArrowRight aria-hidden="true" className="ml-2 size-4" /></>
            ) : (
              <><Save aria-hidden="true" /> {form.formState.isSubmitting ? 'Saving…' : 'Save Overview'}</>
            )}
          </Button>
        </div>
      </footer>
    </form>
  );
}
