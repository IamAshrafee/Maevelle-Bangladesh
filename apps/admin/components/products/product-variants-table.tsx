'use client';

import { Check, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import type { CatalogProductWorkspaceDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { catalogData } from '@/lib/catalog/api';

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

export function ProductVariantsTable({
  workspace,
  onRefresh,
  onMessage,
}: {
  workspace: CatalogProductWorkspaceDto;
  onRefresh: (message?: string) => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const form = useForm<VariantFormValues>({
    defaultValues: {
      variants: workspace.variants.map((v) => ({
        id: v.id,
        version: v.version,
        title: v.title ?? '',
        sku: v.sku,
        price: '', // Would normally come from pricing API, but we'll allow setting it
        compareAtPrice: '',
        status: v.status,
      })),
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: 'variants',
  });

  useEffect(() => {
    form.reset({
      variants: workspace.variants.map((v) => {
        const existing = form.getValues().variants.find((ev) => ev.id === v.id);
        return {
          id: v.id,
          version: v.version,
          title: v.title ?? '',
          sku: v.sku,
          price: existing?.price ?? '',
          compareAtPrice: existing?.compareAtPrice ?? '',
          status: v.status,
        };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.variants]);

  async function onSubmit(data: VariantFormValues) {
    if (!form.formState.isDirty || busy) return;
    setBusy(true);

    try {
      const dirtyFields = form.formState.dirtyFields.variants;
      if (!dirtyFields) {
        setBusy(false);
        return;
      }

      const promises = data.variants
        .map((row, index) => {
          if (!dirtyFields[index]) return null;
          
          const requests = [];
          
          // Update core variant if title, sku, or status changed
          if (dirtyFields[index]?.title || dirtyFields[index]?.sku || dirtyFields[index]?.status) {
            requests.push(
              catalogData(`/admin/catalog/products/${workspace.id}/variants/${row.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  version: row.version,
                  title: row.title || null,
                  sku: row.sku,
                  status: row.status,
                }),
              })
            );
          }

          // Update pricing if price changed
          if (row.price && dirtyFields[index]?.price) {
            requests.push(
              catalogData(`/admin/pricing/variants/${row.id}/current`, {
                method: 'PUT',
                body: JSON.stringify({
                  currency: workspace.operationalSignals.defaultCurrency ?? 'USD',
                  amount: row.price,
                  compareAtAmount: row.compareAtPrice || null,
                }),
              })
            );
          }

          return requests;
        })
        .flat()
        .filter(Boolean);

      if (promises.length > 0) {
        // @ts-ignore
        await Promise.all(promises);
        await onRefresh('Variants updated successfully.');
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not save variants.');
    } finally {
      setBusy(false);
    }
  }

  if (workspace.variants.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        No active variants. Add options and generate them to get started.
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Variant</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Compare At</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((field, index) => (
              <tr key={field.id} className="hover:bg-muted/30">
                <td className="px-4 py-2">
                  <Input
                    className="h-8 bg-transparent"
                    placeholder="Title"
                    {...form.register(`variants.${index}.title`)}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    className="h-8 bg-transparent font-mono text-xs uppercase"
                    placeholder="SKU"
                    {...form.register(`variants.${index}.sku`)}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    className="h-8 bg-transparent"
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    {...form.register(`variants.${index}.price`)}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    className="h-8 bg-transparent"
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    {...form.register(`variants.${index}.compareAtPrice`)}
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    className="h-8 rounded-md border-input bg-transparent px-2 text-xs"
                    {...form.register(`variants.${index}.status`)}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="flex justify-end">
        <Button type="submit" disabled={!form.formState.isDirty || busy}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Save Variants
        </Button>
      </div>
    </form>
  );
}
