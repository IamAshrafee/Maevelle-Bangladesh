'use client';

import { useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import type { AssetDetailDto, AssetOptionsDto } from '@maevelle/contracts';
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
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';

interface AssetMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  options: AssetOptionsDto | undefined;
  onSuccess: () => void;
}

export function AssetMoveDialog({
  open,
  onOpenChange,
  asset,
  options,
  onSuccess,
}: AssetMoveDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const locationId = String(form.get('locationId')) || null;
    const customLocation = String(form.get('customLocation')) || null;

    try {
      await fetchApiData(`/admin/assets/${asset.id}/location`, {
        method: 'POST',
        body: JSON.stringify({
          locationId,
          customLocation,
          expectedVersion: asset.version,
        }),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" />
            <span>Move Asset Location</span>
          </DialogTitle>
          <DialogDescription>
            Relocate this durable asset. Asset movement records physical tracking only and never
            distorts saleable product Inventory stock.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <div className="rounded-lg border bg-muted/30 p-3 text-xs">
          <span className="text-muted-foreground">Current Location: </span>
          <strong className="text-foreground">
            {asset.locationName ?? asset.customLocation ?? 'Unlocated'}
          </strong>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Business Facility / Warehouse
            <NativeSelect name="locationId" defaultValue={asset.locationId ?? ''}>
              <option value="">No structured facility</option>
              {options?.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </NativeSelect>
          </Label>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Custom / Desk / On-Site Placement
            <Input
              name="customLocation"
              defaultValue={asset.customLocation ?? ''}
              placeholder="e.g. 2nd Floor Design Bay, Reception Desk, Trade Fair Stall B"
            />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Moving Asset…' : 'Confirm Movement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
