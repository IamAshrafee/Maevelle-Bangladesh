'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
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
import { newIdempotencyKey } from '@/lib/assets/format';

const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

interface AssetDisposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  onSuccess: () => void;
}

export function AssetDisposalDialog({
  open,
  onOpenChange,
  asset,
  onSuccess,
}: AssetDisposalDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const body = {
      reason: String(form.get('reason')).trim(),
      occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
      expectedVersion: asset.version,
      idempotencyKey: newIdempotencyKey('asset-disposal'),
    };

    try {
      await fetchApiData(`/admin/assets/${asset.id}/disposal`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disposal could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="size-5" />
            <span>Dispose Business Asset</span>
          </DialogTitle>
          <DialogDescription>
            Permanently retire scrap, obsolete, or broken equipment from active service.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Permanent Lifecycle Termination</span>
          </div>
          <p>
            Disposing an asset permanently removes it from operational circulation. Historical
            audit, documents, and past maintenance records will remain permanently archived. No fake
            cash movements will be recorded.
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Disposal Date & Time
            <Input name="occurredAt" type="datetime-local" defaultValue={nowLocal()} required />
          </Label>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Reason for Disposal
            <Textarea
              name="reason"
              rows={3}
              placeholder="e.g. Beyond economical repair, crushed in transit, obsolete scrap, safe e-waste recycling…"
              required
              minLength={4}
            />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? 'Disposing…' : 'Confirm Permanent Disposal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
