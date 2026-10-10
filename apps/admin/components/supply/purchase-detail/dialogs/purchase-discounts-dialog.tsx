'use client';

import { Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { PurchaseDto, ReplacePurchaseDiscountsInputDto } from '@maevelle/contracts';

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

type DiscountInput = ReplacePurchaseDiscountsInputDto['discounts'][number];
type EditableDiscount = DiscountInput & { readonly rowId: string };

function emptyDiscount(): EditableDiscount {
  return {
    rowId: crypto.randomUUID(),
    title: '',
    calculationMethod: 'PERCENTAGE',
    percentage: '',
    amount: '',
    externalReference: '',
  };
}

export function PurchaseDiscountsDialog({
  open,
  onOpenChange,
  purchase,
  busy,
  onSave,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly purchase: PurchaseDto;
  readonly busy: boolean;
  readonly onSave: (discounts: readonly DiscountInput[]) => void;
}) {
  const [discounts, setDiscounts] = useState<readonly EditableDiscount[]>([]);

  useEffect(() => {
    if (!open) return;
    setDiscounts(
      purchase.discounts.length
        ? purchase.discounts.map((discount) => ({
            rowId: discount.id,
            title: discount.title,
            calculationMethod: discount.calculationMethod,
            percentage: discount.percentage ?? '',
            amount: discount.amount,
            externalReference: discount.externalReference ?? '',
          }))
        : [emptyDiscount()],
    );
  }, [open, purchase.discounts]);

  const discountTotal = discounts.reduce((sum, discount) => sum + Number(discount.amount || 0), 0);
  const netTotal = Number(purchase.grossMerchandiseTotal) - discountTotal;
  const valid =
    discounts.every(
      (discount) =>
        discount.title.trim() &&
        Number(discount.amount) > 0 &&
        (discount.calculationMethod === 'FIXED_AMOUNT' ||
          (Number(discount.percentage) > 0 && Number(discount.percentage) <= 100)),
    ) && discountTotal <= Number(purchase.grossMerchandiseTotal);

  function update(rowId: string, changes: Partial<EditableDiscount>) {
    setDiscounts((current) =>
      current.map((discount) =>
        discount.rowId === rowId ? { ...discount, ...changes } : discount,
      ),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    onSave(
      discounts.map((discount) => ({
        title: discount.title.trim(),
        calculationMethod: discount.calculationMethod,
        amount: discount.amount.trim(),
        ...(discount.calculationMethod === 'PERCENTAGE' && discount.percentage?.trim()
          ? { percentage: discount.percentage.trim() }
          : {}),
        ...(discount.externalReference?.trim()
          ? { externalReference: discount.externalReference.trim() }
          : {}),
      })),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              <Tag className="size-4" />
            </div>
            <div>
              <DialogTitle>Purchase discounts</DialogTitle>
              <DialogDescription>
                Record the supplier&apos;s stated amount. A percentage explains the offer; the
                amount is the authoritative reduction.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-3">
            {discounts.map((discount, index) => {
              const calculated =
                discount.calculationMethod === 'PERCENTAGE' && Number(discount.percentage) > 0
                  ? (Number(purchase.grossMerchandiseTotal) * Number(discount.percentage)) / 100
                  : undefined;
              return (
                <div
                  key={discount.rowId}
                  className="space-y-3 rounded-xl border bg-card p-3 sm:p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Discount {index + 1}</p>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      aria-label={`Remove discount ${index + 1}`}
                      onClick={() =>
                        setDiscounts((current) =>
                          current.filter((item) => item.rowId !== discount.rowId),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={`discount-title-${discount.rowId}`}>
                        Offer name
                      </FieldLabel>
                      <Input
                        id={`discount-title-${discount.rowId}`}
                        value={discount.title}
                        placeholder="Business Hours Offer"
                        disabled={busy}
                        required
                        onChange={(event) => update(discount.rowId, { title: event.target.value })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`discount-method-${discount.rowId}`}>Method</FieldLabel>
                      <NativeSelect
                        id={`discount-method-${discount.rowId}`}
                        className="w-full"
                        value={discount.calculationMethod}
                        disabled={busy}
                        onChange={(event) =>
                          update(discount.rowId, {
                            calculationMethod: event.target
                              .value as DiscountInput['calculationMethod'],
                            ...(event.target.value === 'FIXED_AMOUNT' ? { percentage: '' } : {}),
                          })
                        }
                      >
                        <NativeSelectOption value="PERCENTAGE">Percentage offer</NativeSelectOption>
                        <NativeSelectOption value="FIXED_AMOUNT">Fixed amount</NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    {discount.calculationMethod === 'PERCENTAGE' ? (
                      <Field>
                        <FieldLabel htmlFor={`discount-percentage-${discount.rowId}`}>
                          Percentage
                        </FieldLabel>
                        <Input
                          id={`discount-percentage-${discount.rowId}`}
                          type="number"
                          min="0.000001"
                          max="100"
                          step="any"
                          value={discount.percentage}
                          disabled={busy}
                          required
                          onChange={(event) =>
                            update(discount.rowId, { percentage: event.target.value })
                          }
                        />
                        {calculated !== undefined ? (
                          <FieldDescription>
                            Formula estimate:{' '}
                            {formatSupplyMoney(String(calculated), purchase.currencyCode)}
                          </FieldDescription>
                        ) : null}
                      </Field>
                    ) : null}
                    <Field>
                      <FieldLabel htmlFor={`discount-amount-${discount.rowId}`}>
                        Supplier discount ({purchase.currencyCode})
                      </FieldLabel>
                      <Input
                        id={`discount-amount-${discount.rowId}`}
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={discount.amount}
                        disabled={busy}
                        required
                        onChange={(event) => update(discount.rowId, { amount: event.target.value })}
                      />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor={`discount-reference-${discount.rowId}`}>
                        Supplier offer code (optional)
                      </FieldLabel>
                      <Input
                        id={`discount-reference-${discount.rowId}`}
                        value={discount.externalReference}
                        placeholder="BusinessHoursOffer2026"
                        disabled={busy}
                        onChange={(event) =>
                          update(discount.rowId, { externalReference: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || discounts.length >= 20}
            onClick={() => setDiscounts((current) => [...current, emptyDiscount()])}
          >
            <Plus className="size-4" /> Add another discount
          </Button>

          <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Gross</p>
              <p className="font-mono font-semibold tabular-nums">
                {formatSupplyMoney(purchase.grossMerchandiseTotal, purchase.currencyCode)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Discount</p>
              <p className="font-mono font-semibold tabular-nums text-success">
                −{formatSupplyMoney(String(discountTotal), purchase.currencyCode)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net merchandise</p>
              <p className="font-mono font-bold tabular-nums">
                {formatSupplyMoney(String(netTotal), purchase.currencyCode)}
              </p>
            </div>
          </div>

          {discountTotal > Number(purchase.grossMerchandiseTotal) ? (
            <p className="text-sm text-destructive">
              Discounts cannot exceed the gross merchandise value.
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Tag className="size-4" />}
              Save discounts
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
