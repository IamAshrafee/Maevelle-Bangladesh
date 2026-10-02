'use client';

import { useState, type FormEvent } from 'react';
import { FileX } from 'lucide-react';
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

interface AssetDetachMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  linkId: string | null;
  filename: string | null;
  onSuccess: () => void;
}

export function AssetDetachMediaDialog({
  open,
  onOpenChange,
  assetId,
  linkId,
  filename,
  onSuccess,
}: AssetDetachMediaDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkId) return;
    setBusy(true);
    setError('');

    const reason = String(new FormData(event.currentTarget).get('reason')).trim();

    try {
      await fetchApiData(`/admin/assets/${assetId}/media/${linkId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Media could not be detached.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <FileX className="size-5" />
            <span>Detach Asset File</span>
          </DialogTitle>
          <DialogDescription>
            Disconnect {filename ? <strong>&ldquo;{filename}&rdquo;</strong> : 'this file'} from
            this asset. The file remains in the Media library and the detachment is recorded in
            audit history.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Reason for Detaching
            <Textarea
              name="reason"
              rows={3}
              placeholder="e.g. Attached by mistake, superseded by new warranty document…"
              required
              minLength={4}
            />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? 'Detaching…' : 'Confirm Detach'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
