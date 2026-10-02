'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useTeam } from './team-context';
import {
  formatIamErrorMessage,
  type TeamMemberListItemDto,
} from './team-types';

export function TeamOwnerTransferDialog({
  members,
  onTransferred,
}: {
  readonly members: readonly TeamMemberListItemDto[];
  readonly onTransferred: (message: string) => Promise<void>;
}) {
  const { activeActor, request } = useTeam();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Eligible successors: active standard members (excluding current actor / owner)
  const eligibleMembers = useMemo(() => {
    return members.filter(
      (m) =>
        m.status === 'ACTIVE' &&
        m.membership_type === 'STANDARD' &&
        m.id !== activeActor.membershipId,
    );
  }, [members, activeActor.membershipId]);

  const ownerMember = useMemo(() => {
    return members.find((m) => m.id === activeActor.membershipId);
  }, [members, activeActor.membershipId]);

  const targetMember = useMemo(() => {
    return members.find((m) => m.id === targetId);
  }, [members, targetId]);

  if (!activeActor.isOwner) return null;

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerMember || !targetMember || !confirmed || !reason.trim()) return;

    setBusy(true);
    setError(null);

    try {
      await request('/admin/team/owner-transfer', {
        method: 'POST',
        body: JSON.stringify({
          targetMembershipId: targetMember.id,
          expectedOwnerVersion: Number(ownerMember.version),
          expectedTargetVersion: Number(targetMember.version),
          reason: reason.trim(),
        }),
      });

      setOpen(false);
      setTargetId('');
      setReason('');
      setConfirmed(false);
      await onTransferred(
        `Ownership successfully transferred to ${targetMember.name}. You are now a Standard Member.`,
      );
    } catch (err) {
      setError(formatIamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10" />}>
        <ArrowRightLeft className="size-4" /> Transfer ownership
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <ShieldAlert className="size-5" />
            Transfer Organization Ownership
          </DialogTitle>
          <DialogDescription>
            Transfer structural authority and sole ownership of the Maevelle organization.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleTransfer} className="space-y-4 py-2">
          {/* Consequence Alert */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-xs text-amber-500">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0" />
              High-Impact Operation
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                You will immediately step down to a <strong>Standard Member</strong>.
              </li>
              <li>
                The selected successor will become the sole <strong>Owner</strong> with immutable superuser authority.
              </li>
              <li>
                Both accounts will receive security notifications and the transfer will be recorded in the immutable audit log.
              </li>
            </ul>
          </div>

          {/* MFA Notice */}
          <div className="rounded-md border border-border/70 bg-muted/30 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
            <KeyRound className="size-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong>Security requirement:</strong> You must have a fresh two-factor (MFA) authenticated
              session issued within the last 10 minutes to execute this transfer.
            </span>
          </div>

          {/* Successor Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="transfer-target">Select successor member</Label>
            {eligibleMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-2 border border-dashed rounded-md">
                No active standard members found in this organization. Invite and activate a team member before transferring ownership.
              </p>
            ) : (
              <select
                id="transfer-target"
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Choose an eligible member…
                </option>
                {eligibleMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Reason for transfer (recorded in audit log)</Label>
            <Textarea
              id="transfer-reason"
              rows={2}
              maxLength={500}
              placeholder="e.g. Leadership succession, corporate governance restructuring"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          {/* Explicit Confirmation Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-md border border-amber-500/40 bg-amber-500/5 cursor-pointer">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(c) => setConfirmed(c === true)}
              className="mt-0.5"
            />
            <span className="text-xs text-foreground leading-snug">
              I understand that transferring ownership is irreversible from my account and I will no longer possess Owner authority.
            </span>
          </label>

          {error ? (
            <div className="rounded-md bg-destructive/15 border border-destructive/30 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || !targetId || !confirmed || !reason.trim()}
            >
              {busy ? 'Transferring ownership…' : 'Confirm ownership transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
