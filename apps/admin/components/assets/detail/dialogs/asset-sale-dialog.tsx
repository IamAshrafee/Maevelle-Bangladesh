'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, Banknote } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import { newIdempotencyKey } from '@/lib/assets/format';

const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

interface AssetSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  options: AssetOptionsDto | undefined;
  onSuccess: () => void;
}

export function AssetSaleDialog({
  open,
  onOpenChange,
  asset,
  options,
  onSuccess,
}: AssetSaleDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const body = {
      accountId: String(form.get('accountId')),
      amount: String(form.get('amount')),
      occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
      buyerReference: String(form.get('buyerReference')) || undefined,
      note: String(form.get('note')) || undefined,
      expectedVersion: asset.version,
      idempotencyKey: newIdempotencyKey('asset-sale'),
    };

    try {
      await fetchApiData(`/admin/assets/${asset.id}/sale`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale could not be processed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Banknote className="size-5 text-emerald-600" />
            <span>Sell Business Asset</span>
          </DialogTitle>
          <DialogDescription>
            Conclude the physical lifecycle by selling this asset. Proceeds will post one immutable
            Finance transaction and credit the selected Account atomically.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Terminal Lifecycle Transition</span>
          </div>
          <p>
            Once sold, this asset enters a permanent historical state. Active operational commands
            (assignment, movement, repair) will be disabled.
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Destination Financial Account (Receiving Proceeds)
            <NativeSelect name="accountId" required>
              <option value="">Choose receiving Account…</option>
              {options?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currencyCode})
                </option>
              ))}
            </NativeSelect>
          </Label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Sale Amount (Net Proceeds)
              <Input
                name="amount"
                type="number"
                min="0.0001"
                step="0.0001"
                placeholder="0.00"
                required
              />
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Sale Date & Time
              <Input name="occurredAt" type="datetime-local" defaultValue={nowLocal()} required />
            </Label>
          </div>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Buyer / Transaction Reference
            <Input name="buyerReference" placeholder="e.g. Sold to Acme Corp, Invoice #SALE-892" />
          </Label>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Operational Sale Notes
            <Textarea
              name="note"
              rows={2}
              placeholder="Sale justification, handover condition, receipt details…"
            />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Processing Sale…' : 'Confirm Sale & Deposit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
