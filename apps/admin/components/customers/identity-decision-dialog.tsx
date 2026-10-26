'use client';

import { useState } from 'react';
import type { CustomerIdentityLinkDto } from '@maevelle/contracts';
import { CircleAlert, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

export function IdentityDecisionDialog({
  link,
  decision,
  onCompleted,
}: {
  readonly link: CustomerIdentityLinkDto;
  readonly decision: 'LINKED' | 'REJECTED';
  readonly onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const approve = decision === 'LINKED';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await fetchApiData(`/admin/customers/${link.customerId}/identities`, {
        method: 'POST',
        body: JSON.stringify({
          contactIdentityId: link.contactIdentityId,
          targetStatus: decision,
          assurance: 'LOW',
          evidenceMethod: 'STAFF_REVIEW',
          evidenceReference: `candidate:${link.id}`,
          evidenceSummary: approve
            ? 'Authorized staff reviewed the scoped channel identity candidate. This is a manual, low-assurance association and not technical proof of ownership.'
            : 'Authorized staff reviewed and rejected the proposed customer association.',
          reason: reason.trim(),
        }),
      });
      setOpen(false);
      setReason('');
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Identity decision could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={approve ? 'default' : 'outline'} />}>
        {approve ? 'Link' : 'Reject'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approve ? 'Link this identity?' : 'Reject this candidate?'}</DialogTitle>
          <DialogDescription>
            {approve
              ? 'This creates a low-assurance manual association. Use a verified phone, email, or authenticated account workflow for high assurance.'
              : 'The rejection is retained in identity history and does not delete the underlying contact or conversations.'}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </div>
        ) : null}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`identity-reason-${link.id}-${decision}`}>Decision reason</Label>
            <Textarea
              id={`identity-reason-${link.id}-${decision}`}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe the evidence reviewed and why this decision is appropriate."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={approve ? 'default' : 'destructive'}
              disabled={busy || !reason.trim()}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving
                </>
              ) : approve ? (
                'Confirm low-assurance link'
              ) : (
                'Reject candidate'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
