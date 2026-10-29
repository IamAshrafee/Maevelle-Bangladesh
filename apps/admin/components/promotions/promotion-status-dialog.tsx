'use client';

import * as React from 'react';
import { AlertTriangle, Archive, CheckCircle2, Loader2, PauseCircle, PlayCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiRequest, ApiRequestError } from '@/lib/api';
import type { PromotionItem, PromotionStatus } from './types';

interface PromotionStatusDialogProps {
  readonly promotion: PromotionItem | null;
  readonly targetStatus: PromotionStatus | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function PromotionStatusDialog({
  promotion,
  targetStatus,
  open,
  onOpenChange,
  onSuccess,
}: PromotionStatusDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setError(null);
  }, [open]);

  if (!promotion || !targetStatus) return null;

  const isPausing = targetStatus === 'INACTIVE';
  const isActivating = targetStatus === 'ACTIVE';
  const isArchiving = targetStatus === 'ARCHIVED';

  async function handleConfirm() {
    if (!promotion || !targetStatus) return;
    setBusy(true);
    setError(null);

    try {
      await apiRequest(`/admin/promotions/${promotion.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change campaign status.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className={`flex size-8 items-center justify-center rounded-lg ${
                isPausing
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : isActivating
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPausing ? (
                <PauseCircle className="size-4" />
              ) : isActivating ? (
                <PlayCircle className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
            </div>
            <div>
              <DialogTitle>
                {isPausing
                  ? 'Pause Promotion Campaign?'
                  : isActivating
                    ? 'Activate Promotion Campaign?'
                    : 'Archive Promotion Campaign?'}
              </DialogTitle>
              <DialogDescription>
                Campaign: <strong className="text-foreground">{promotion.name}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 pt-2 text-sm text-muted-foreground">
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {isPausing && (
            <p>
              Pausing this promotion will immediately stop it from evaluating in customer carts and checkouts.
              Existing placed orders remain preserved. You can resume this campaign at any time.
            </p>
          )}

          {isActivating && (
            <p>
              Activating this campaign will make it immediately eligible for qualifying shopping carts and
              checkout orders matching schedule criteria.
            </p>
          )}

          {isArchiving && (
            <p>
              Archiving hides this promotion from active lists while preserving historical commercial accounting
              and order audit trails.
            </p>
          )}
        </div>

        <DialogFooter className="pt-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isArchiving ? 'destructive' : isPausing ? 'secondary' : 'default'}
            disabled={busy}
            onClick={handleConfirm}
            className="gap-1.5"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isPausing ? (
              <PauseCircle className="size-4" />
            ) : isActivating ? (
              <PlayCircle className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
            {isPausing ? 'Pause Campaign' : isActivating ? 'Activate Campaign' : 'Archive Campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

