'use client';

import { Check, Loader2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { PurchaseDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatSupplyMoney } from '@/lib/supply/api';
import type { PurchaseLine } from '../types';

export interface PurchaseEditLineDialogProps {
  readonly line?: PurchaseLine | undefined;
  readonly purchase: PurchaseDto;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSaveLine: (lineId: string, quantity: string, unitPrice: string) => void;
}

export function PurchaseEditLineDialog({
  line,
  purchase,
  busy,
  onClose,
  onSaveLine,
}: PurchaseEditLineDialogProps) {
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  useEffect(() => {
    if (line) {
      setQuantity(line.quantity);
      setUnitPrice(line.unitPrice);
    }
  }, [line]);

  if (!line) return null;

  const subtotal = Number(quantity || 0) * Number(unitPrice || 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!line) return;
    onSaveLine(line.id, quantity, unitPrice);
  }

  return (
    <Dialog open={Boolean(line)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Line: {line.sku}</DialogTitle>
          <DialogDescription>
            Adjust the agreed supplier quantity or unit cost before placing this purchase.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Variant Snapshot */}
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">{line.productTitle}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-muted-foreground">{line.sku}</span>
              {line.optionSummary ? (
                <Badge variant="secondary" className="text-[10px]">
                  {line.optionSummary}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-line-quantity">Quantity</FieldLabel>
              <Input
                id="edit-line-quantity"
                name="quantity"
                type="number"
                min="0.000001"
                step="any"
                value={quantity}
                required
                disabled={busy}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <FieldDescription>Ordered units.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-line-price">
                Unit Cost ({purchase.currencyCode})
              </FieldLabel>
              <Input
                id="edit-line-price"
                name="unitPrice"
                type="number"
                min="0"
                step="any"
                value={unitPrice}
                required
                disabled={busy}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
              <FieldDescription>Supplier unit cost.</FieldDescription>
            </Field>
          </div>

          {/* Subtotal Preview */}
          <div className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
            <span className="text-muted-foreground font-medium">Updated Line Subtotal</span>
            <span className="font-mono font-bold">
              {formatSupplyMoney(String(subtotal), purchase.currencyCode)}
            </span>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={busy || Number(quantity) <= 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              <span>Save item</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
