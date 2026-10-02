'use client';

import { useState, type FormEvent } from 'react';
import type { AssetConditionDto, AssetDetailDto, AssetOptionsDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { humanizeAssetCode } from '@/lib/assets/format';
import { fetchApiData } from '@/lib/api';

const conditions: readonly AssetConditionDto[] = ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'];

interface AssetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  options: AssetOptionsDto | undefined;
  onSuccess: () => void;
}

export function AssetEditDialog({
  open,
  onOpenChange,
  asset,
  options,
  onSuccess,
}: AssetEditDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(event.currentTarget);

    try {
      await fetchApiData(`/admin/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: asset.version,
          name: String(f.get('name')),
          categoryId: String(f.get('categoryId')) || null,
          description: String(f.get('description')) || null,
          brand: String(f.get('brand')) || null,
          model: String(f.get('model')) || null,
          serialNumber: String(f.get('serialNumber')) || null,
          condition: String(f.get('condition')),
          warrantyExpiresOn: String(f.get('warrantyExpiresOn')) || null,
          notes: String(f.get('notes')) || null,
        }),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Asset could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Asset Details</DialogTitle>
          <DialogDescription>
            Update mutable physical specifications and identifiers. Historical financial facts and
            provenance remain immutable.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Asset Name
            <Input name="name" defaultValue={asset.name} required />
          </Label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Category
              <NativeSelect name="categoryId" defaultValue={asset.categoryId ?? ''}>
                <option value="">Uncategorized</option>
                {options?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Physical Condition
              <NativeSelect name="condition" defaultValue={asset.condition}>
                {conditions.map((v) => (
                  <option key={v} value={v}>
                    {humanizeAssetCode(v)}
                  </option>
                ))}
              </NativeSelect>
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Brand / Manufacturer
              <Input name="brand" defaultValue={asset.brand ?? ''} />
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Model
              <Input name="model" defaultValue={asset.model ?? ''} />
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Serial Number
              <Input name="serialNumber" defaultValue={asset.serialNumber ?? ''} />
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Warranty Expiry
              <Input
                name="warrantyExpiresOn"
                type="date"
                defaultValue={asset.warrantyExpiresOn ?? ''}
              />
            </Label>
          </div>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Description
            <Textarea name="description" rows={2} defaultValue={asset.description ?? ''} />
          </Label>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Internal Notes
            <Textarea name="notes" rows={3} defaultValue={asset.notes ?? ''} />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving Changes…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
