'use client';

import { useState } from 'react';
import { Ban, CircleAlert, Loader2, ShieldAlert } from 'lucide-react';
import type { CustomerRestrictionTypeDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { fetchApiData } from '@/lib/api';

interface ApplyRestrictionDialogProps {
  readonly customerId: string;
  readonly onApplied: () => void;
}

export function ApplyRestrictionDialog({ customerId, onApplied }: ApplyRestrictionDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [restrictionType, setRestrictionType] =
    useState<CustomerRestrictionTypeDto>('COD_RESTRICTED');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    setMessage('');

    try {
      await fetchApiData(`/admin/customers/${customerId}/restrictions`, {
        method: 'POST',
        body: JSON.stringify({
          restrictionType,
          reason: reason.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      setOpen(false);
      setReason('');
      setNotes('');
      setExpiresAt('');
      onApplied();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not apply commercial restriction.');
    } finally {
      setBusy(false);
    }
  }

  function getConsequenceExplanation(type: CustomerRestrictionTypeDto): string {
    switch (type) {
      case 'ORDERING_BLOCKED':
        return 'The customer is completely blocked from placing new online or manual orders across all sales channels.';
      case 'COD_RESTRICTED':
        return 'The customer cannot choose Cash on Delivery at checkout. Prepaid digital payments (bKash, Card, Bank) will remain permitted.';
      case 'ORDER_REVIEW_REQUIRED':
        return 'New orders placed by this customer will require mandatory merchant telephone or fraud review before confirmation and fulfillment.';
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-9 gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400" />}>
        <ShieldAlert className="size-3.5" aria-hidden="true" /> Apply Restriction
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <Ban className="size-5" /> Apply Commercial Restriction
          </DialogTitle>
          <DialogDescription>
            Enforce authoritative merchant policy on this customer. Restrictions are enforced across
            the checkout domain and manual sales creation.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="restriction-type">Restriction Policy</Label>
            <select
              id="restriction-type"
              value={restrictionType}
              onChange={(e) => setRestrictionType(e.target.value as CustomerRestrictionTypeDto)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="COD_RESTRICTED">COD Restricted (Deny Cash on Delivery)</option>
              <option value="ORDER_REVIEW_REQUIRED">Order Review Required (Hold for Verification)</option>
              <option value="ORDERING_BLOCKED">Ordering Blocked (Complete Commerce Block)</option>
            </select>
          </div>

          <div className="rounded-lg border bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300">
            <span className="font-semibold">Operational Consequence: </span>
            {getConsequenceExplanation(restrictionType)}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restriction-reason">Business Reason *</Label>
            <Input
              id="restriction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Multiple deliberate courier refusals; verified contact unreachable."
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restriction-notes">Internal Operator Notes (Optional)</Label>
            <Textarea
              id="restriction-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context or evidence regarding this restriction decision."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restriction-expiry">Expiry Date & Time (Optional)</Label>
            <Input
              id="restriction-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank for an indefinite restriction until manually lifted.
            </p>
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || !reason.trim()}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Enforce Restriction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
