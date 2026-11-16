'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CapitalContributorDto } from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';
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
  const [displayName, setDisplayName] = useState(contributor?.displayName ?? '');
  const [contactNote, setContactNote] = useState(contributor?.contactNote ?? '');
  const [linkedUserId, setLinkedUserId] = useState(contributor?.linkedUserId ?? '');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(contributor?.status ?? 'ACTIVE');

  useEffect(() => {
    if (open) {
      setDisplayName(contributor?.displayName ?? '');
      setContactNote(contributor?.contactNote ?? '');
      setLinkedUserId(contributor?.linkedUserId ?? '');
      setStatus(contributor?.status ?? 'ACTIVE');
    }
  }, [open, contributor]);

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

  const isDirty =
    mode === 'create'
      ? Boolean(displayName.trim() || contactNote.trim() || linkedUserId)
      : displayName !== (contributor?.displayName ?? '') ||
        contactNote !== (contributor?.contactNote ?? '') ||
        linkedUserId !== (contributor?.linkedUserId ?? '') ||
        status !== (contributor?.status ?? 'ACTIVE');

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    isDirty,
    isSubmitting: busy,
    onClose,
    confirmTitle: mode === 'edit' ? 'Discard contributor changes?' : 'Discard new contributor?',
    confirmDescription:
      'You have unsaved edits in this contributor form. Closing now will discard your information.',
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim()) return;

    await onSubmit({
      displayName: displayName.trim(),
      contactNote: contactNote.trim() || null,
      linkedUserId: linkedUserId || null,
      ...(mode === 'edit' ? { status } : {}),
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4 text-left">
            <SheetTitle>
              {mode === 'edit' ? 'Edit capital contributor' : 'Add capital contributor'}
            </SheetTitle>
            <SheetDescription>
              {mode === 'edit'
                ? 'Identity changes are audited. Deactivating a contributor prevents new activity while preserving historical ledger integrity.'
                : 'A contributor is a person who supplies permanent business capital or pays costs personally. Contributors do not receive Team permissions or cap-table shares.'}
            </SheetDescription>
          </SheetHeader>

          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="grid gap-1.5 text-sm font-medium">
                Full name or display label
                <Input
                  name="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Kabir Hossain"
                  disabled={busy}
                  required
                />
              </label>

              {canViewTeam && teamMembers.length > 0 ? (
                <label className="grid gap-1.5 text-sm font-medium">
                  Link to team member account (optional)
                  <NativeSelect
                    name="linkedUserId"
                    value={linkedUserId}
                    onChange={(e) => setLinkedUserId(e.target.value)}
                    disabled={busy}
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
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  maxLength={1000}
                  placeholder="Phone number, relationship, or background details..."
                  disabled={busy}
                />
              </label>

              {mode === 'edit' && contributor ? (
                <label className="grid gap-1.5 text-sm font-medium">
                  Operational status
                  <NativeSelect
                    name="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    disabled={busy}
                  >
                    <option value="ACTIVE">Active (can contribute and fund costs)</option>
                    <option value="INACTIVE">Inactive (history preserved; blocks new activity)</option>
                  </NativeSelect>
                </label>
              ) : null}
            </div>

            <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border/60 bg-card/50 px-6 py-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-3">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !displayName.trim()}>
                {mode === 'edit' ? 'Save contributor' : 'Add contributor'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
  );
}
