'use client';

import { AlertTriangle, ExternalLink, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import type { CatalogVariantMatrixDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { catalogData } from '@/lib/catalog/api';

type EditableMatrixRow = CatalogVariantMatrixDto['rows'][number] & {
  readonly variant: NonNullable<CatalogVariantMatrixDto['rows'][number]['variant']>;
};

type VariantFormValues = {
  variants: {
    id: string;
    version: number;
    title: string;
    sku: string;
    price: string;
    compareAtPrice: string;
    status: 'ACTIVE' | 'ARCHIVED';
  }[];
};

function formRows(rows: readonly EditableMatrixRow[]): VariantFormValues['variants'] {
  return rows.map((row) => ({
    id: row.variant.id,
    version: row.variant.version,
    title: row.variant.title ?? row.values.map((value) => value.valueLabel).join(' / '),
    sku: row.variant.sku,
    price: row.variant.currentPrice?.amount ?? '',
    compareAtPrice: row.variant.currentPrice?.compareAtAmount ?? '',
    status: row.variant.status,
  }));
}

export function ProductVariantsTable({
  matrix,
  onSaved,
  onDirtyChange,
  onMessage,
}: {
  matrix: CatalogVariantMatrixDto;
  onSaved: (message: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const editableRows = useMemo(
    () => matrix.rows.filter((row): row is EditableMatrixRow => row.variant !== null),
    [matrix.rows],
  );
  const form = useForm<VariantFormValues>({ defaultValues: { variants: formRows(editableRows) } });
  const { fields } = useFieldArray({ control: form.control, name: 'variants' });
  const isDirty = form.formState.isDirty;

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(() => form.reset({ variants: formRows(editableRows) }), [editableRows, form]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  async function onSubmit(data: VariantFormValues) {
    if (!isDirty || busy) return;
    const dirtyRows = form.formState.dirtyFields.variants;
    if (!dirtyRows) return;
    setBusy(true);
    let completedRows = 0;
    try {
      for (const [index, row] of data.variants.entries()) {
        const dirty = dirtyRows[index];
        if (!dirty) continue;
        const coreChanged = Boolean(dirty.title || dirty.sku || dirty.status);
        const priceChanged = Boolean(dirty.price || dirty.compareAtPrice);
        if (priceChanged && !row.price.trim())
          throw new Error(`Enter a selling price for ${row.sku} before saving its price.`);

        if (coreChanged) {
          await catalogData(`/admin/catalog/products/${matrix.product.id}/variants/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              version: row.version,
              title: row.title.trim() || null,
              sku: row.sku,
              status: row.status,
            }),
          });
        }
        if (priceChanged) {
          await catalogData(`/admin/pricing/variants/${row.id}/current`, {
            method: 'PUT',
            body: JSON.stringify({
              currency: matrix.product.defaultCurrency,
              amount: row.price,
              compareAtAmount: row.compareAtPrice || null,
            }),
          });
        }
        completedRows += 1;
      }
      await onSaved(`${completedRows} Variant${completedRows === 1 ? '' : 's'} updated.`);
    } catch (error) {
      await onSaved('');
      const detail = error instanceof Error ? error.message : 'Variants could not be saved.';
      onMessage(
        completedRows > 0
          ? `${completedRows} Variant${completedRows === 1 ? '' : 's'} saved before the operation stopped. ${detail} Review the refreshed values and retry the remaining changes.`
          : detail,
      );
    } finally {
      setBusy(false);
    }
  }

  if (editableRows.length === 0)
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        This page has no generated Variants. Generate its missing combinations above or move to
        another page.
      </div>
    );

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Combination</th>
              <th className="px-3 py-3 font-medium">SKU</th>
              <th className="px-3 py-3 font-medium">Price</th>
              <th className="px-3 py-3 font-medium">Compare At</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Inventory</th>
              <th className="px-3 py-3 font-medium">Setup</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((field, index) => {
              const source = editableRows[index]!;
              const combination = source.values.map((value) => value.valueLabel).join(' / ');
              return (
                <tr key={field.id} className="hover:bg-muted/30">
                  <td className="max-w-56 px-3 py-2">
                    <Input
                      aria-label={`Combination title for ${source.variant.sku}`}
                      autoComplete="off"
                      className="h-9 bg-transparent"
                      {...form.register(`variants.${index}.title`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`SKU for ${combination}`}
                      autoComplete="off"
                      className="h-9 min-w-40 bg-transparent font-mono text-xs uppercase"
                      spellCheck={false}
                      {...form.register(`variants.${index}.sku`, { required: true })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Selling price for ${source.variant.sku}`}
                      className="h-9 min-w-28 bg-transparent tabular-nums"
                      inputMode="decimal"
                      min="0"
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      {...form.register(`variants.${index}.price`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Compare-at price for ${source.variant.sku}`}
                      className="h-9 min-w-28 bg-transparent tabular-nums"
                      inputMode="decimal"
                      min="0"
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      {...form.register(`variants.${index}.compareAtPrice`)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Status for ${source.variant.sku}`}
                      className="h-9 min-w-28 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      {...form.register(`variants.${index}.status`)}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Link
                      href={`/inventory/stock?search=${encodeURIComponent(source.variant.sku)}`}
                      className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                      title={`View ${source.variant.sku} stock`}
                    >
                      Stock
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {source.variant.setupIssues.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
                        {source.variant.setupIssues.join(', ')}
                      </span>
                    ) : (
                      'Complete'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Catalog identity and Pricing are saved through their authoritative services. If one
          service rejects a row, completed rows remain saved and the table refreshes before retry.
        </p>
        <Button type="submit" disabled={!isDirty || busy} className="min-h-11 sm:min-h-8">
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {busy ? 'Saving…' : 'Save This Page'}
        </Button>
      </div>
    </form>
  );
}
