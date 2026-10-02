'use client';

import { useState, type FormEvent } from 'react';
import { Clock, Send, ShieldCheck, UserPlus } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useTeam } from './team-context';
import { TeamPermissionsEditor, type PermissionsEditorValue } from './team-permissions-editor';
import { formatIamErrorMessage } from './team-types';

export function TeamInviteDialog({
  onInvited,
  trigger,
}: {
  readonly onInvited: (message: string) => Promise<void> | void;
  readonly trigger?: React.ReactNode;
}) {
  const { presets, request, canInvite } = useTeam();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [permissions, setPermissions] = useState<PermissionsEditorValue>({
    capabilityCodes: presets[0]?.capability_codes ?? [],
    scopes: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!canInvite) return null;

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please provide a valid work email address.');
      return;
    }
    if (!cleanName) {
      setError('Please provide a display name.');
      return;
    }

    setSubmitting(true);
    try {
      await request('/admin/team/invitations', {
        method: 'POST',
        headers: {
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          email: cleanEmail,
          displayName: cleanName,
          capabilityCodes: permissions.capabilityCodes,
          scopes: permissions.scopes,
          expiresInHours,
        }),
      });

      setOpen(false);
      setEmail('');
      setDisplayName('');
      setPermissions({
        capabilityCodes: presets[0]?.capability_codes ?? [],
        scopes: [],
      });
      await onInvited(`Invitation created and queued for delivery to ${cleanEmail}.`);
    } catch (err) {
      setError(formatIamErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ? (trigger as any) : undefined}>
        {!trigger ? (
          <Button className="button primary">
            <UserPlus aria-hidden="true" /> Invite team member
          </Button>
        ) : null}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Invite a team member
          </DialogTitle>
          <DialogDescription>
            Generate a secure, single-use invitation link with explicit server-enforced organization capabilities.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleInvite} className="space-y-6 pt-2">
          {/* Personal Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full name or display name</Label>
              <Input
                id="invite-name"
                required
                maxLength={160}
                placeholder="e.g. Asif Rahman"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Work email address</Label>
              <Input
                id="invite-email"
                type="email"
                required
                maxLength={320}
                placeholder="colleague@maevelle.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Invitation Expiration Period */}
          <div className="space-y-1.5">
            <Label htmlFor="invite-expiry" className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" />
              Invitation validity period
            </Label>
            <select
              id="invite-expiry"
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
            >
              <option value={24}>24 hours (Urgent onboarding)</option>
              <option value={72}>72 hours (Recommended standard)</option>
              <option value={168}>7 days (Extended onboarding window)</option>
            </select>
          </div>

          {/* Permission Presets & Capabilities */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Access capabilities & location scopes</Label>
                <p className="text-xs text-muted-foreground">
                  Select a role preset or customize the exact capabilities and warehouse restrictions.
                </p>
              </div>
            </div>

            <TeamPermissionsEditor
              value={permissions}
              onChange={setPermissions}
              showPresetSelector={true}
            />
          </div>

          {/* Security Notice */}
          <div className="rounded-md border border-border/70 bg-muted/30 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
            <span>
              The recipient will receive an encrypted delivery link. Upon acceptance, their account will be bound
              authoritatively to this organization with the assigned capabilities.
            </span>
          </div>

          {error ? (
            <div className="rounded-md bg-destructive/15 border border-destructive/30 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !email || !displayName}>
              <Send className="size-4" />
              {submitting ? 'Generating invitation…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
