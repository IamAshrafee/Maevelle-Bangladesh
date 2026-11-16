'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { InboundReceiptLineDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export interface ReceiptResolveConditionDialogProps {
  readonly line: InboundReceiptLineDto | undefined;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onResolve: (data: {
    lineId: string;
    targetCondition: 'SELLABLE' | 'DAMAGED';
    quantity: string;
    reason?: string | undefined;
  }) => void;
}

export function ReceiptResolveConditionDialog({
  line,
  busy,
  onClose,
  onResolve,
}: ReceiptResolveConditionDialogProps) {
  const [targetCondition, setTargetCondition] = useState<'SELLABLE' | 'DAMAGED'>('SELLABLE');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (line) {
      setQuantity(line.quantity);
      setTargetCondition('SELLABLE');
      setReason('');
    }
  }, [line]);

  if (!line) return null;
  const currentLine = line;

  const maxQty = Number(currentLine.quantity);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0 || qty > maxQty) return;
    onResolve({
      lineId: currentLine.id,
      targetCondition,
      quantity: String(qty),
      reason: reason.trim() || undefined,
    });
  }

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-11 text-left">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle className="size-5" />
            <SheetTitle>Resolve {currentLine.condition} Condition</SheetTitle>
          </div>
          <SheetDescription>
            Reclassify inspected or quarantined stock for {currentLine.productTitle} (
            {currentLine.sku}). Resolved items will adjust warehouse inventory states accordingly.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Field>
              <FieldLabel htmlFor="target-condition">Target Condition</FieldLabel>
              <Select
                value={targetCondition}
                onValueChange={(val) => setTargetCondition(val as 'SELLABLE' | 'DAMAGED')}
                disabled={busy}
              >
                <SelectTrigger id="target-condition">
                  <SelectValue placeholder="Select target condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELLABLE">SELLABLE (Move to available stock)</SelectItem>
                  <SelectItem value="DAMAGED">DAMAGED (Move to quarantine / write-off)</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Sellable stock becomes immediately available for customer orders.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="resolve-quantity">
                Quantity to Resolve (Max: {currentLine.quantity})
              </FieldLabel>
              <Input
                id="resolve-quantity"
                name="quantity"
                type="number"
                min="1"
                max={currentLine.quantity}
                value={quantity}
                required
                disabled={busy}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <FieldDescription>
                Units to transition from {currentLine.condition} into {targetCondition}.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="resolve-reason">Inspection Notes / Reason</FieldLabel>
              <Textarea
                id="resolve-reason"
                name="reason"
                value={reason}
                rows={2}
                placeholder="e.g. Batch passed QC inspection test, visual packaging defect confirmed…"
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>

          <SheetFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border bg-card/50 px-5 py-3">
            <SheetClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Cancel
            </SheetClose>
            <Button
              type="submit"
              disabled={busy || !quantity || Number(quantity) <= 0 || Number(quantity) > maxQty}
              className="gap-1.5"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle className="size-4" />
              )}
              <span>Resolve Condition</span>
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
