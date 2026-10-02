'use client';

import { useState, type FormEvent } from 'react';
import { Archive, Plus, RotateCcw, Tag } from 'lucide-react';
import type { AssetCategoryDto } from '@maevelle/contracts';
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
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { humanizeAssetCode, newIdempotencyKey } from '@/lib/assets/format';

interface AssetCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: readonly AssetCategoryDto[];
  onChanged: () => void;
}

export function AssetCategoriesDialog({
  open,
  onOpenChange,
  categories,
  onChanged,
}: AssetCategoriesDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);

    try {
      await fetchApiData('/admin/assets/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name')),
          description: String(form.get('description')) || undefined,
          idempotencyKey: newIdempotencyKey('asset-category'),
        }),
      });
      setFeedback('Asset category created successfully.');
      onChanged();
      (event.target as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Category could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(category: AssetCategoryDto) {
    setBusy(true);
    setError('');

    try {
      await fetchApiData(`/admin/assets/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: category.name,
          description: category.description,
          status: category.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
          expectedVersion: category.version,
        }),
      });
      setFeedback(
        category.status === 'ACTIVE'
          ? `Archived "${category.name}". Existing assets retain this category.`
          : `Restored "${category.name}".`,
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Category status could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-5 text-primary" />
            <span>Manage Asset Categories</span>
          </DialogTitle>
          <DialogDescription>
            Organize durable property into a focused operational taxonomy. Archived categories
            remain safely preserved on historical assets.
          </DialogDescription>
        </DialogHeader>

        {feedback ? (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            {feedback}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Existing Categories ({categories.length})
          </span>

          <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                No categories created yet.
              </p>
            ) : (
              categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <strong className="text-sm font-semibold text-foreground truncate block">
                      {c.name}
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      {c.assetCount} {c.assetCount === 1 ? 'Asset' : 'Assets'} ·{' '}
                      {humanizeAssetCode(c.status)}
                    </p>
                    {c.description ? (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={c.status === 'ACTIVE' ? 'outline' : 'secondary'}
                    disabled={busy}
                    onClick={() => void toggleStatus(c)}
                    className="shrink-0 text-xs"
                  >
                    {c.status === 'ACTIVE' ? (
                      <>
                        <Archive className="size-3.5 mr-1 text-muted-foreground" />
                        Archive
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-3.5 mr-1" />
                        Restore
                      </>
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <form className="grid gap-3 border-t pt-4" onSubmit={handleCreate}>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Create New Category
          </span>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Category Name
            <Input
              name="name"
              placeholder="e.g. IT Equipment, Office Furniture, Vehicles"
              required
            />
          </Label>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Description (Optional)
            <Textarea
              name="description"
              rows={2}
              placeholder="Scope or guidelines for this category…"
            />
          </Label>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={busy}>
              <Plus className="size-4 mr-1" />
              {busy ? 'Creating…' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
