'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import type { CapabilityCatalogItemDto, PermissionPresetDto } from '@maevelle/contracts';

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

export function TeamInviteDialog({
  capabilities,
  presets,
  onInvited,
}: {
  readonly capabilities: readonly CapabilityCatalogItemDto[];
  readonly presets: readonly PermissionPresetDto[];
  readonly onInvited: (message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const available = useMemo(
    () => capabilities.filter((capability) => capability.status !== 'DEPRECATED'),
    [capabilities],
  );

  function applyPreset(presetId: string) {
    const preset = presets.find((candidate) => candidate.id === presetId);
    setSelected(preset?.capability_codes ?? []);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch('/api/admin/team/invitations', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ email, displayName, capabilityCodes: selected, scopes: [] }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(payload.error?.message ?? 'The invitation could not be created.');
        return;
      }
      setOpen(false);
      setEmail('');
      setDisplayName('');
      setSelected([]);
      await onInvited(`Invitation created for ${email}.`);
    } catch {
      setError('Unable to reach Maevelle. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="button primary" />}>
        <UserPlus aria-hidden="true" /> Invite team member
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            Access is snapshotted into a single-use invitation. It can be changed after activation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={invite} className="grid gap-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-name">Display name</Label>
              <Input
                id="invite-name"
                required
                maxLength={160}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-email">Work email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-preset">Start from a preset</Label>
            <select id="invite-preset" defaultValue="" onChange={(event) => applyPreset(event.target.value)}>
              <option value="">Custom access</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>
          <fieldset className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Capabilities</legend>
            {available.map((capability) => (
              <label key={capability.capability_code} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/60">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={selected.includes(capability.capability_code)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, capability.capability_code]
                        : current.filter((code) => code !== capability.capability_code),
                    )
                  }
                />
                <span>
                  <strong className="block text-sm">{capability.capability_code}</strong>
                  <small className="text-muted-foreground">{capability.description} · {capability.sensitivity}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={submitting || !email || !displayName}>
              {submitting ? 'Creating invitation…' : 'Create invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
