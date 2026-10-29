'use client';

import * as React from 'react';
import { Archive, Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { formatMoney } from '@/lib/format/numbers';
import type { VariantPriceItem } from './types';

interface ArchivePriceDialogProps {
  readonly item: VariantPriceItem | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: (archivedId: string, message: string) => void;
}

export function ArchivePriceDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: ArchivePriceDialogProps) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  if (!item) return null;

  async function handleConfirm() {
    if (!item) return;
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/admin/pricing/prices/${item.priceDefinitionId}/archive`, {
        method: 'POST',
      });

      onOpenChange(false);
      onSuccess(
        item.priceDefinitionId,
        `Archived price definition (${formatMoney(item.amount, item.currency)}) for ${item.sku}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Failed to archive price definition. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Archive className="size-4" />
            </div>
            <AlertDialogTitle>Archive Price Definition?</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            This will immediately deactivate this{' '}
            <strong className="text-foreground">
              {formatMoney(item.amount, item.currency)}
            </strong>{' '}
            schedule for <strong className="text-foreground">{item.sku}</strong> ({item.productTitle}).
            The price definition will be archived, preserving audit history.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Archiving…
              </>
            ) : (
              'Archive Definition'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

