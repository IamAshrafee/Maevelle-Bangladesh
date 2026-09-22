'use client';

import { Loader2, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { CatalogVariantChoiceDto, PurchaseDto } from '@maevelle/contracts';

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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { formatSupplyMoney } from '@/lib/supply/api';

export interface PurchaseAddLineDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly purchase: PurchaseDto;
  readonly variants: readonly CatalogVariantChoiceDto[];
  readonly busy: boolean;
  readonly onAddLine: (data: { variantId: string; quantity: string; unitPrice: string }) => void;
}

export function PurchaseAddLineDialog({
  open,
  onOpenChange,
  purchase,
  variants,
  busy,
  onAddLine,
}: PurchaseAddLineDialogProps) {
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');

  const activeVariants = variants.filter((v) => v.status === 'ACTIVE');
  const selectedVariant = variants.find((v) => v.id === variantId);

  const subtotal = Number(quantity || 0) * Number(unitPrice || 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variantId) return;
    onAddLine({
      variantId,
      quantity,
      unitPrice,
    });
  }

  function resetForm() {
    setVariantId('');
    setQuantity('1');
    setUnitPrice('0');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Purchase Item</DialogTitle>
          <DialogDescription>
            Choose a catalog product variant and specify the supplier purchase quantity and unit cost.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Variant Selection */}
          <Field>
            <FieldLabel htmlFor="add-line-variant">Product & Variant</FieldLabel>
            <NativeSelect
              id="add-line-variant"
              name="variantId"
              value={variantId}
              required
              disabled={busy || !activeVariants.length}
              className="w-full"
              onChange={(e) => setVariantId(e.target.value)}
            >
              <NativeSelectOption value="" disabled>
                {activeVariants.length ? 'Choose a catalog variant' : 'No active catalog variants'}
              </NativeSelectOption>
              {activeVariants.map((v) => (
                <NativeSelectOption key={v.id} value={v.id}>
                  {v.productTitle} · {v.sku}
                  {v.optionSummary ? ` (${v.optionSummary})` : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>Select an active product variant to procure.</FieldDescription>
          </Field>

          {/* Selected Variant Snapshot Card */}
          {selectedVariant ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">{selectedVariant.productTitle}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-muted-foreground">{selectedVariant.sku}</span>
                {selectedVariant.optionSummary ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedVariant.optionSummary}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Quantity & Unit Price */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="add-line-quantity">Quantity</FieldLabel>
              <Input
                id="add-line-quantity"
                name="quantity"
                type="number"
                min="0.000001"
                step="any"
                value={quantity}
                required
                disabled={busy}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <FieldDescription>Units to order.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="add-line-price">
                Unit Cost ({purchase.currencyCode})
              </FieldLabel>
              <Input
                id="add-line-price"
                name="unitPrice"
                type="number"
                min="0"
                step="any"
                value={unitPrice}
                required
                disabled={busy}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
              <FieldDescription>Cost per unit from supplier.</FieldDescription>
            </Field>
          </div>

          {/* Subtotal Preview */}
          <div className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
            <span className="text-muted-foreground font-medium">Estimated Line Subtotal</span>
            <span className="font-mono font-bold">
              {formatSupplyMoney(String(subtotal), purchase.currencyCode)}
            </span>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={busy || !variantId || Number(quantity) <= 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              <span>Add item</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
