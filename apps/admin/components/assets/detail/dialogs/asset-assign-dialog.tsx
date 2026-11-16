'use client';

import { useState, type FormEvent } from 'react';
import { UserCheck, UserX } from 'lucide-react';
import type { AssetDetailDto, AssetOptionsDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';

interface AssetAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  options: AssetOptionsDto | undefined;
  onSuccess: () => void;
}

export function AssetAssignDialog({
  open,
  onOpenChange,
  asset,
  options,
  onSuccess,
}: AssetAssignDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedCustodian, setSelectedCustodian] = useState(asset.custodianMembershipId ?? '');

  async function handleAssign(custodianMembershipId: string | null) {
    setBusy(true);
    setError('');

    try {
      await fetchApiData(`/admin/assets/${asset.id}/assignment`, {
        method: 'POST',
        body: JSON.stringify({
          custodianMembershipId,
          expectedVersion: asset.version,
        }),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Custodian could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('custodianMembershipId')) || null;
    void handleAssign(id);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-5 overflow-y-auto p-6 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 p-0 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <UserCheck className="size-5 text-primary" />
            <span>Assign Asset Custodian</span>
          </SheetTitle>
          <SheetDescription>
            The custodian is the team member responsible for day-to-day physical custody and care of
            this property. Custody does not imply ownership.
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <span className="text-muted-foreground">Current Custodian: </span>
          <strong className="text-foreground">
            {asset.custodianName ?? 'Unassigned (General company custody)'}
          </strong>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Select Team Member
            <NativeSelect
              name="custodianMembershipId"
              value={selectedCustodian}
              onChange={(e) => setSelectedCustodian(e.target.value)}
            >
              <option value="">Unassigned (General company custody)</option>
              {options?.custodians.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Label>

          <SheetFooter className="flex-col gap-2 border-t border-border/60 p-0 pt-4 sm:flex-row sm:items-center sm:justify-end">
            {asset.custodianMembershipId ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void handleAssign(null)}
                className="text-xs mr-auto"
              >
                <UserX className="size-3.5 mr-1" />
                Unassign to General Custody
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update Custodian'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
