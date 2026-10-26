'use client';

import { useEffect, useState } from 'react';
import type { CustomerCrmProfileDto, CustomerRelationshipStatusDto } from '@maevelle/contracts';
import { Pencil } from 'lucide-react';

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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';

export function CustomerCrmProfileDialog({
  customerId,
  customerVersion,
  profile,
  onUpdated,
}: {
  customerId: string;
  customerVersion: number;
  profile: CustomerCrmProfileDto;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(profile.firstName ?? '');
  const [lastName, setLastName] = useState(profile.lastName ?? '');
  const [language, setLanguage] = useState(profile.preferredLanguage ?? '');
  const [relationshipStatus, setRelationshipStatus] = useState(profile.relationshipStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setLanguage(profile.preferredLanguage ?? '');
    setRelationshipStatus(profile.relationshipStatus);
    setError('');
  }, [open, profile]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/crm`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: customerVersion,
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          preferredLanguage: language.trim() || null,
          relationshipStatus,
        }),
      });
      setOpen(false);
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CRM profile could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Pencil className="size-4" /> Edit profile
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit relationship profile</DialogTitle>
          <DialogDescription>
            Maintain structured names, locale, and the current relationship state. Changes are
            version checked and audited.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="crm-first-name">First name</Label>
              <Input
                id="crm-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crm-last-name">Last name</Label>
              <Input
                id="crm-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="crm-language">Preferred language</Label>
            <Input
              id="crm-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="bn or en-BD"
              pattern="[a-z]{2,3}(-[A-Z]{2})?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="crm-relationship-status">Relationship status</Label>
            <NativeSelect
              id="crm-relationship-status"
              value={relationshipStatus}
              onChange={(event) =>
                setRelationshipStatus(event.target.value as CustomerRelationshipStatusDto)
              }
            >
              {['UNASSIGNED', 'ACTIVE', 'FOLLOW_UP', 'AT_RISK', 'DORMANT'].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
