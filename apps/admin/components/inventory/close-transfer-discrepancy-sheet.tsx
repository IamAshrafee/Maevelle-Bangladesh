'use client';

import { useEffect, useState } from 'react';

import { inventoryRequest } from '@/lib/inventory/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

interface TransferLine {
  id: string;
  sku: string;
  productTitle: string;
  dispatchedQuantity: string;
  receivedQuantity: string;
  discrepancy?: { quantity: string };
}

interface DiscrepancyLine {
  transferLineId: string;
  sku: string;
  productTitle: string;
  remaining: string;
  selected: boolean;
  dispositionCode: 'MISSING' | 'LOST';
  reasonCode: string;
  notes: string;
}

function remainingFor(line: TransferLine): string {
  return String(
    Number(line.dispatchedQuantity) -
      Number(line.receivedQuantity) -
      Number(line.discrepancy?.quantity ?? 0),
  );
}

function toFormLines(lines: readonly TransferLine[]): DiscrepancyLine[] {
  return lines
    .map((line) => ({
      transferLineId: line.id,
      sku: line.sku,
      productTitle: line.productTitle,
      remaining: remainingFor(line),
      selected: false,
      dispositionCode: 'MISSING' as const,
      reasonCode: '',
      notes: '',
    }))
    .filter((line) => Number(line.remaining) > 0);
}

/** Finalizes stock that cannot arrive. Each selected line is fully reconciled, never silently edited. */
export function CloseTransferDiscrepancySheet({
  transferId,
  lines,
  open,
  onClose,
  onSuccess,
}: {
  transferId: string;
  lines: readonly TransferLine[];
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [entries, setEntries] = useState<DiscrepancyLine[]>(() => toFormLines(lines));
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setEntries(toFormLines(lines));
      setError('');
    }
  }, [lines, open]);

  const update = (index: number, patch: Partial<DiscrepancyLine>) => {
    setEntries((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  };

  const submit = async () => {
    const selected = entries.filter((entry) => entry.selected);
    if (!selected.length) {
      setError('Select at least one line to resolve.');
      return;
    }
    if (selected.some((entry) => !entry.reasonCode.trim())) {
      setError('Give every resolved line a reason.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const response = await inventoryRequest<{ data: { status: string } }>(
        `/warehouse/transfers/${transferId}/close-discrepancy`,
        {
          method: 'POST',
          headers: { 'idempotency-key': `transfer-discrepancy-${transferId}-${Date.now()}` },
          body: JSON.stringify({
            lines: selected.map((entry) => ({
              transferLineId: entry.transferLineId,
              dispositionCode: entry.dispositionCode,
              quantity: entry.remaining,
              reasonCode: entry.reasonCode.trim(),
              ...(entry.notes.trim() ? { notes: entry.notes.trim() } : {}),
            })),
          }),
        },
      );
      onSuccess(
        response.data.status === 'CLOSED_WITH_DISCREPANCY'
          ? 'Transfer closed with the documented discrepancy.'
          : 'Missing stock documented. Remaining lines can still be received.',
      );
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The discrepancy could not be recorded.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Resolve missing stock</SheetTitle>
          <SheetDescription>
            This permanently closes selected in-transit lines as missing or lost. The quantity is
            not returned to available stock; the reason and operator are retained in the transfer
            history.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There are no in-transit lines to resolve.
            </p>
          ) : (
            entries.map((entry, index) => (
              <div key={entry.transferLineId} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={entry.selected}
                    onCheckedChange={(checked) => update(index, { selected: checked === true })}
                    aria-label={`Resolve ${entry.productTitle}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{entry.productTitle}</p>
                    <p className="font-mono text-xs text-muted-foreground">{entry.sku}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remaining in transit: <span className="font-medium">{entry.remaining}</span>{' '}
                      units
                    </p>
                  </div>
                </div>
                {entry.selected && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Disposition</Label>
                      <Select
                        value={entry.dispositionCode}
                        onValueChange={(value) =>
                          update(index, { dispositionCode: value as 'MISSING' | 'LOST' })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MISSING">Missing</SelectItem>
                          <SelectItem value="LOST">Lost in transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Quantity being closed</Label>
                      <Input value={entry.remaining} readOnly aria-readonly="true" />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`reason-${entry.transferLineId}`}>Reason</Label>
                      <Input
                        id={`reason-${entry.transferLineId}`}
                        value={entry.reasonCode}
                        onChange={(event) => update(index, { reasonCode: event.target.value })}
                        placeholder="e.g. Carrier shortage confirmed"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`notes-${entry.transferLineId}`}>Notes (optional)</Label>
                      <Textarea
                        id={`notes-${entry.transferLineId}`}
                        value={entry.notes}
                        onChange={(event) => update(index, { notes: event.target.value })}
                        placeholder="Reference, investigation notes, or handover details"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!entries.length || isSubmitting}>
            {isSubmitting ? 'Recording…' : 'Record discrepancy'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
