'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CapitalContributorDto } from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
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
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import type { TeamMemberSimple } from './types';

export interface CapitalContributorDialogProps {
  readonly mode: 'create' | 'edit';
  readonly contributor?: CapitalContributorDto | undefined;
  readonly open: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: {
    displayName: string;
    contactNote?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    linkedUserId?: string | null;
  }) => Promise<void>;
}

export function CapitalContributorDialog({
  mode,
  contributor,
  open,
  busy,
  onClose,
  onSubmit,
}: CapitalContributorDialogProps) {
  const canViewTeam = useAdminCapability('admin.team.view');
  const [teamMembers, setTeamMembers] = useState<readonly TeamMemberSimple[]>([]);

  useEffect(() => {
    if (!open || !canViewTeam) return;
    void fetchApiData<{ items: readonly TeamMemberSimple[] }>('/admin/team?pageSize=100')
      .then((res) => {
        setTeamMembers(res.items);
      })
      .catch(() => {
        // Fallback gracefully if team cannot be queried
      });
  }, [canViewTeam, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const displayName = String(data.get('displayName') || '').trim();
    const contactNote = String(data.get('contactNote') || '').trim() || null;
    const linkedUserId = String(data.get('linkedUserId') || '').trim() || null;
    const status = data.get('status') as 'ACTIVE' | 'INACTIVE' | null;

    await onSubmit({
      displayName,
      contactNote,
      linkedUserId,
      ...(mode === 'edit' && status ? { status } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'edit' ? 'Edit capital contributor' : 'Add capital contributor'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'edit'
                ? 'Identity changes are audited. Deactivating a contributor prevents new activity while preserving historical ledger integrity.'
                : 'A contributor is a person who supplies permanent business capital or pays costs personally. Contributors do not receive Team permissions or cap-table shares.'}
            </DialogDescription>
          </DialogHeader>

          <label className="grid gap-1.5 text-sm font-medium">
            Full name or display label
            <Input
              name="displayName"
              defaultValue={contributor?.displayName ?? ''}
              maxLength={200}
              placeholder="e.g. Kabir Hossain"
              required
              autoFocus
            />
          </label>

          {canViewTeam && teamMembers.length > 0 ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Link to team member account (optional)
              <NativeSelect
                name="linkedUserId"
                defaultValue={contributor?.linkedUserId ?? ''}
              >
                <option value="">No internal account linked</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </NativeSelect>
              <span className="text-[11px] text-muted-foreground">
                Connecting to a team member clarifies operational ownership across Maevelle.
              </span>
            </label>
          ) : null}

          <label className="grid gap-1.5 text-sm font-medium">
            Contact or identity note (optional)
            <Textarea
              name="contactNote"
              defaultValue={contributor?.contactNote ?? ''}
              maxLength={1000}
              placeholder="Phone number, relationship, or background details..."
            />
          </label>

          {mode === 'edit' && contributor ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Operational status
              <NativeSelect name="status" defaultValue={contributor.status}>
                <option value="ACTIVE">Active (can contribute and fund costs)</option>
                <option value="INACTIVE">Inactive (history preserved; blocks new activity)</option>
              </NativeSelect>
            </label>
          ) : null}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {mode === 'edit' ? 'Save contributor' : 'Add contributor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
