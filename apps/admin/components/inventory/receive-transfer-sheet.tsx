'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { inventoryRequest } from '@/lib/inventory/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceivableTransferLine {
  id: string; // transfer_line_id
  inventoryItemId: string;
  sku: string;
  productTitle: string;
  requestedQuantity: string;
  dispatchedQuantity: string;
  receivedQuantity: string;
}

interface Props {
  transferId: string;
  lines: ReceivableTransferLine[];
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const qtyPattern = /^\d+(?:\.\d{1,6})?$/;

const lineSchema = z.object({
  transferLineId: z.string(),
  sku: z.string(),
  productTitle: z.string(),
  remainingQty: z.number(),
  sellableQuantity: z.string().regex(qtyPattern, 'Invalid quantity'),
  damagedQuantity: z.string().regex(/^(\d+(?:\.\d{1,6})?)?$/, 'Invalid quantity'),
  quarantineQuantity: z.string().regex(/^(\d+(?:\.\d{1,6})?)?$/, 'Invalid quantity'),
  inspectionQuantity: z.string().regex(/^(\d+(?:\.\d{1,6})?)?$/, 'Invalid quantity'),
});

const formSchema = z.object({ lines: z.array(lineSchema) });
type FormValues = z.infer<typeof formSchema>;

// ─── Line with required defaults ─────────────────────────────────────────────

function defaultLine(l: ReceivableTransferLine): FormValues['lines'][number] {
  const remaining = Number(l.dispatchedQuantity) - Number(l.receivedQuantity);
  return {
    transferLineId: l.id,
    sku: l.sku,
    productTitle: l.productTitle,
    remainingQty: remaining,
    sellableQuantity: String(remaining),
    damagedQuantity: '0',
    quarantineQuantity: '0',
    inspectionQuantity: '0',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReceiveTransferSheet({ transferId, lines, open, onClose, onSuccess }: Props) {
  const receivableLines = lines.filter(
    (l) => Number(l.dispatchedQuantity) > Number(l.receivedQuantity),
  );

  const [submitError, setSubmitError] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      lines: receivableLines.map(defaultLine),
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: 'lines' });

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError('');
    try {
      const res = await inventoryRequest<{ data: { status: string } }>(
        `/warehouse/transfers/${transferId}/receive`,
        {
          method: 'POST',
          headers: {
            'idempotency-key': `recv-${transferId}-${Date.now()}`,
          },
          body: JSON.stringify({
            lines: values.lines.map((l: FormValues['lines'][number]) => {
              const entry: Record<string, string> = {
                transferLineId: l.transferLineId,
                sellableQuantity: l.sellableQuantity,
              };
              if (l.damagedQuantity && l.damagedQuantity !== '0') {
                entry.damagedQuantity = l.damagedQuantity;
              }
              if (l.quarantineQuantity && l.quarantineQuantity !== '0') {
                entry.quarantineQuantity = l.quarantineQuantity;
              }
              if (l.inspectionQuantity && l.inspectionQuantity !== '0') {
                entry.inspectionQuantity = l.inspectionQuantity;
              }
              return entry;
            }),
          }),
        },
      );
      const status = res.data?.status ?? '';
      const msg =
        status === 'RECEIVED'
          ? 'Transfer fully received. Inventory updated at destination.'
          : 'Partial receipt recorded.';
      onSuccess(msg);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Receipt could not be posted.');
    }
  });

  if (receivableLines.length === 0) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Receive Transfer</SheetTitle>
            <SheetDescription>There are no lines remaining to receive.</SheetDescription>
          </SheetHeader>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Receive Transfer</SheetTitle>
          <SheetDescription>
            Enter quantities received. Split by condition if any items arrived damaged or need
            inspection.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          {submitError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          )}

          {fields.map((field, index) => {
            const lineWatch = form.watch(`lines.${index}`);
            const totalEntered =
              Number(lineWatch.sellableQuantity || 0) +
              Number(lineWatch.damagedQuantity || 0) +
              Number(lineWatch.quarantineQuantity || 0) +
              Number(lineWatch.inspectionQuantity || 0);
            const overReceived = totalEntered > lineWatch.remainingQty;

            return (
              <div key={field.id} className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="font-medium text-sm">{lineWatch.productTitle}</p>
                  <p className="text-xs text-muted-foreground font-mono">{lineWatch.sku}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    In transit:{' '}
                    <span className="font-medium">{lineWatch.remainingQty}</span> units
                  </p>
                  {overReceived && (
                    <p className="text-xs text-destructive mt-1">
                      Total entered ({totalEntered}) exceeds in-transit quantity (
                      {lineWatch.remainingQty}).
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-emerald-700 font-medium">Sellable</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-8 text-sm"
                      {...form.register(`lines.${index}.sellableQuantity`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-destructive font-medium">Damaged</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-8 text-sm"
                      {...form.register(`lines.${index}.damagedQuantity`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-amber-600 font-medium">Quarantine</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-8 text-sm"
                      {...form.register(`lines.${index}.quarantineQuantity`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-blue-600 font-medium">Inspection</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-8 text-sm"
                      {...form.register(`lines.${index}.inspectionQuantity`)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Recording…' : 'Record Receipt'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
