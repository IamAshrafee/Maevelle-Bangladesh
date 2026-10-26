'use client';

import { useState } from 'react';
import type { CustomerIdentityLinkDto } from '@maevelle/contracts';
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

export function IdentityRevokeDialog({
  identity,
  onRevoked,
}: {
  readonly identity: CustomerIdentityLinkDto;
  readonly onRevoked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await fetchApiData(`/admin/crm/identity-links/${identity.id}/revocation`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: identity.version, reason: reason.trim() }),
      });
      setOpen(false);
      setReason('');
      onRevoked();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Identity link could not be revoked.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Unlink</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlink {identity.provider} identity?</DialogTitle>
          <DialogDescription>
            The conversation and its history remain intact. Customer commerce context will no longer
            be exposed through this channel contact.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`revoke-${identity.id}`}>Revocation reason</Label>
            <Textarea
              id={`revoke-${identity.id}`}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || !reason.trim()}>
              {busy ? 'Unlinking…' : 'Confirm unlink'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
