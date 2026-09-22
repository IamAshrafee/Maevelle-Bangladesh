'use client';

import { useState } from 'react';
import { AlertTriangle, Archive, Loader2, Trash2 } from 'lucide-react';

import type { CatalogColorDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { catalogData, catalogRequest } from '@/lib/catalog/api';

import { ColorSwatch } from './color-swatch';

interface ColorDeleteDialogProps {
  color?: CatalogColorDto | undefined;
  open: boolean;
  onClose: () => void;
  onDeleted: (colorId: string) => void;
  onArchived: (updated: CatalogColorDto) => void;
}

export function ColorDeleteDialog({
  color,
  open,
  onClose,
  onDeleted,
  onArchived,
}: ColorDeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!color) return null;

  const inUse = (color.usageCount ?? 0) > 0;

  async function handleDelete() {
    if (!color) return;
    setBusy(true);
    setError('');

    try {
      await catalogRequest(`/admin/catalog/colors/${color.id}`, {
        method: 'DELETE',
      });
      onDeleted(color.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete color.');
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!color) return;
    setBusy(true);
    setError('');

    try {
      const updated = await catalogData<CatalogColorDto>(`/admin/catalog/colors/${color.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: color.version,
          status: 'ARCHIVED',
        }),
      });
      onArchived(updated);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not archive color.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" />
            Delete Color
          </DialogTitle>
          <DialogDescription>
            Confirm deletion of this color definition from the catalog library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4">
            <ColorSwatch hexValue={color.hexValue} name={color.name} size="lg" showHex />
            <div className="ml-auto text-right text-xs text-muted-foreground">
              <span className="font-mono block">{color.code}</span>
              <span className="capitalize">{color.status.toLowerCase()}</span>
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          {inUse ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2.5 font-medium">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>This color cannot be deleted</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                It is currently assigned to{' '}
                <strong>
                  {color.usageCount} product option{color.usageCount === 1 ? '' : 's'} or variant
                  {color.usageCount === 1 ? '' : 's'}
                </strong>
                . Deleting it would break existing products. You can <strong>Archive</strong> it
                instead so it will no longer appear for new products while keeping existing
                inventory intact.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This color is currently <strong>not used</strong> by any products or variants. It can
              be safely and permanently deleted from the library.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {inUse ? (
            <Button
              type="button"
              variant="secondary"
              onClick={handleArchive}
              disabled={busy || color.status === 'ARCHIVED'}
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Archive className="mr-2 size-4" />
              )}
              {color.status === 'ARCHIVED' ? 'Already Archived' : 'Archive Instead'}
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Delete Permanently
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
