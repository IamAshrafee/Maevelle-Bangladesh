'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

interface AssetVoidMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  maintenanceId: string | null;
  onSuccess: () => void;
}

export function AssetVoidMaintenanceDialog({
  open,
  onOpenChange,
  assetId,
  maintenanceId,
  onSuccess,
}: AssetVoidMaintenanceDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!maintenanceId) return;
    setBusy(true);
    setError('');

    const reason = String(new FormData(event.currentTarget).get('reason')).trim();

    try {
      await fetchApiData(`/admin/assets/${assetId}/maintenance/${maintenanceId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Maintenance entry could not be voided.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            <span>Void Maintenance Record</span>
          </DialogTitle>
          <DialogDescription>
            Void an erroneous maintenance entry. The entry will be marked as voided and preserved in
            audit history for accounting and integrity purposes.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Reason for Voiding
            <Textarea
              name="reason"
              rows={3}
              placeholder="e.g. Recorded against wrong asset, duplicate entry, incorrect date…"
              required
              minLength={4}
            />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? 'Voiding…' : 'Confirm Void'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
