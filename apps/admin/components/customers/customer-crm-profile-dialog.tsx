'use client';

import { useEffect, useState } from 'react';
import type { CustomerCrmProfileDto, CustomerRelationshipStatusDto } from '@maevelle/contracts';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

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

  const isDirty =
    firstName !== (profile.firstName ?? '') ||
    lastName !== (profile.lastName ?? '') ||
    language !== (profile.preferredLanguage ?? '') ||
    relationshipStatus !== profile.relationshipStatus;

  const { handleOpenChange, discardConfirmDialog } = useFormDialogLifecycle({
    open,
    onOpenChange: setOpen,
    isDirty,
    isSubmitting: busy,
    title: 'Discard relationship profile changes?',
  });

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
      handleOpenChange(false);
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CRM profile could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button size="sm" variant="outline" />}>
          <Pencil className="size-4" /> Edit profile
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4 pr-12 text-left">
            <SheetTitle>Edit relationship profile</SheetTitle>
            <SheetDescription>
              Maintain structured names, locale, and the current relationship state. Changes are
              version checked and audited.
            </SheetDescription>
          </SheetHeader>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
            </div>
            <SheetFooter className="shrink-0 border-t border-border/60 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save profile'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {discardConfirmDialog}
    </>
  );
}
