'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ExternalLink, Wrench } from 'lucide-react';
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
import { formatAssetMoney, newIdempotencyKey } from '@/lib/assets/format';
import { fetchApiData } from '@/lib/api';

const today = () => new Date().toISOString().slice(0, 10);

interface AssetMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailDto;
  options: AssetOptionsDto | undefined;
  onSuccess: () => void;
}

export function AssetMaintenanceDialog({
  open,
  onOpenChange,
  asset,
  options,
  onSuccess,
}: AssetMaintenanceDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const f = new FormData(event.currentTarget);
    const body = {
      type: String(f.get('type')),
      occurredOn: String(f.get('occurredOn')),
      issue: String(f.get('issue')) || undefined,
      workPerformed: String(f.get('workPerformed')),
      serviceProvider: String(f.get('serviceProvider')) || undefined,
      expenseId: String(f.get('expenseId')) || undefined,
      nextServiceOn: String(f.get('nextServiceOn')) || undefined,
      notes: String(f.get('notes')) || undefined,
      idempotencyKey: newIdempotencyKey('asset-maintenance'),
    };

    try {
      await fetchApiData(`/admin/assets/${asset.id}/maintenance`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Maintenance record could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5 text-primary" />
            <span>Record Maintenance or Repair</span>
          </DialogTitle>
          <DialogDescription>
            Record physical service, repairs, part replacements, or inspections. If the service cost
            money, link the recorded Finance Expense rather than typing duplicate financial amounts.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Service Type
              <NativeSelect name="type" defaultValue="REPAIR">
                <option value="REPAIR">Repair</option>
                <option value="SERVICE">Scheduled Service / Routine</option>
                <option value="INSPECTION">Physical Inspection</option>
                <option value="PART_REPLACEMENT">Part Replacement</option>
              </NativeSelect>
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Service Date
              <Input name="occurredOn" type="date" defaultValue={today()} required />
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Service Provider / Technician
              <Input
                name="serviceProvider"
                placeholder="e.g. Authorized Dell Center, In-house IT"
              />
            </Label>

            <Label className="grid gap-1.5 text-xs font-medium text-foreground">
              Next Scheduled Service (Optional)
              <Input name="nextServiceOn" type="date" />
            </Label>
          </div>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Issue / Reported Problem
            <Textarea
              name="issue"
              rows={2}
              placeholder="e.g. Laser drum misaligned, paper feed roller slipping, screen flickering…"
            />
          </Label>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Work Performed / Diagnostic Results
            <Textarea
              name="workPerformed"
              rows={3}
              placeholder="Detailed description of technical service performed, parts replaced, or inspection findings…"
              required
            />
          </Label>

          {/* Finance Expense Integration */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Linked Finance Expense (Optional)
              </span>
              <span className="text-[11px] text-muted-foreground">
                For warranty or zero-cost repairs, leave blank
              </span>
            </div>

            <NativeSelect name="expenseId">
              <option value="">No linked Expense (৳0 / Warranty / Self-repair)</option>
              {options?.expenses.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.number} · {e.description} ({formatAssetMoney(e.amount, e.currencyCode)})
                </option>
              ))}
            </NativeSelect>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>
                Financial truth remains authoritative in Finance. No duplicate ledger entries
                created.
              </span>
              <Link
                href="/finance/expenses"
                target="_blank"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium ml-2"
              >
                <span>Record Expense</span>
                <ExternalLink className="size-3" />
              </Link>
            </div>
          </div>

          <Label className="grid gap-1.5 text-xs font-medium text-foreground">
            Additional Remarks
            <Textarea
              name="notes"
              rows={2}
              placeholder="Any warranty notes, invoice reference, or advice from provider…"
            />
          </Label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving Record…' : 'Record Service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
