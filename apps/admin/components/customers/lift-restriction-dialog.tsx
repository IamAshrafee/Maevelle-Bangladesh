'use client';

import { useState } from 'react';
import { CircleAlert, Loader2, Undo2 } from 'lucide-react';
import type { CustomerRestrictionDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchApiData } from '@/lib/api';

interface LiftRestrictionDialogProps {
  readonly customerId: string;
  readonly restriction: CustomerRestrictionDto;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onLifted: () => void;
}

export function LiftRestrictionDialog({
  customerId,
  restriction,
  open,
  onOpenChange,
  onLifted,
}: LiftRestrictionDialogProps) {
  const [busy, setBusy] = useState(false);
  const [liftReason, setLiftReason] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!liftReason.trim() || busy) return;
    setBusy(true);
    setMessage('');

    try {
      await fetchApiData(`/admin/customers/${customerId}/restrictions/${restriction.id}/lift`, {
        method: 'POST',
        body: JSON.stringify({
          liftReason: liftReason.trim(),
        }),
      });
      onOpenChange(false);
      setLiftReason('');
      onLifted();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not lift commercial restriction.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="size-5 text-emerald-600" /> Lift Commercial Restriction
          </DialogTitle>
          <DialogDescription>
            Restore normal purchasing and checkout permissions for this customer.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">
              Current Restriction: {restriction.restrictionType.replaceAll('_', ' ')}
            </p>
            <p className="text-muted-foreground">Original Reason: {restriction.reason}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lift-reason">Reason for Lifting Restriction *</Label>
            <Input
              id="lift-reason"
              value={liftReason}
              onChange={(e) => setLiftReason(e.target.value)}
              placeholder="e.g. Identity verified by phone; prepaid deposit received."
              required
              autoFocus
            />
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !liftReason.trim()}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm & Lift
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
