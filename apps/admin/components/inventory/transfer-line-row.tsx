'use client';

import type { ComponentProps } from 'react';
import type { InventoryBalanceDto } from '@maevelle/contracts';
import { Trash2 } from 'lucide-react';

import { TransferStockPicker } from '@/components/inventory/transfer-stock-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type TransferLineRowProps = {
  index: number;
  sourceLocationId: string;
  variantId: string;
  selectedStockItem?: InventoryBalanceDto | undefined;
  selectedVariantIds: ReadonlySet<string>;
  quantityInputProps: ComponentProps<'input'>;
  variantError?: string | undefined;
  quantityError?: string | undefined;
  duplicate: boolean;
  removable: boolean;
  onVariantChange: (item: InventoryBalanceDto | null) => void;
  onItemResolved: (item: InventoryBalanceDto) => void;
  onResolutionError: (message: string) => void;
  onSetMaximum: () => void;
  onRemove: () => void;
};

export function TransferLineRow({
  index,
  sourceLocationId,
  variantId,
  selectedStockItem,
  selectedVariantIds,
  quantityInputProps,
  variantError,
  quantityError,
  duplicate,
  removable,
  onVariantChange,
  onItemResolved,
  onResolutionError,
  onSetMaximum,
  onRemove,
}: TransferLineRowProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors duration-150',
        duplicate && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <div className="mb-3 flex items-center justify-between sm:hidden">
        <Badge variant="outline" className="font-mono text-[11px] font-normal tabular-nums">
          Line #{index + 1}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!removable}
          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={removable ? 'Remove line item' : 'A transfer requires at least one line'}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-12 sm:items-start">
        <div className="space-y-1 sm:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium">
              <span className="hidden sm:inline">Item #{index + 1} </span>
              <span className="sm:hidden">Product variant </span>
              <span className="text-destructive">*</span>
            </Label>
            {selectedStockItem ? (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {selectedStockItem.availableToSell} available
              </span>
            ) : null}
          </div>
          <TransferStockPicker
            sourceLocationId={sourceLocationId}
            value={variantId}
            excludedVariantIds={selectedVariantIds}
            invalid={Boolean(variantError) || duplicate}
            onValueChange={onVariantChange}
            onItemResolved={onItemResolved}
            onResolutionError={onResolutionError}
          />
          {variantError ? (
            <p className="text-[11px] font-medium text-destructive">{variantError}</p>
          ) : null}
        </div>

        <div className="space-y-1 sm:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium">
              Quantity <span className="text-destructive">*</span>
            </Label>
            {selectedStockItem ? (
              <button
                type="button"
                onClick={onSetMaximum}
                className="font-mono text-[11px] font-medium tabular-nums text-primary hover:underline"
                title="Set quantity to maximum available units"
              >
                Max ({selectedStockItem.availableToSell})
              </button>
            ) : null}
          </div>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="1"
            disabled={!variantId}
            aria-invalid={Boolean(quantityError)}
            className="font-mono text-xs tabular-nums"
            {...quantityInputProps}
          />
          {quantityError ? (
            <p className="text-[11px] font-medium text-destructive">{quantityError}</p>
          ) : null}
        </div>

        <div className="hidden justify-end pt-6 sm:col-span-1 sm:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={!removable}
            className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title={removable ? 'Remove line item' : 'A transfer requires at least one line'}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {duplicate ? (
        <p className="mt-2 text-[11px] font-medium text-destructive">
          This SKU is already included. Each variant may appear only once in a transfer draft.
        </p>
      ) : null}
    </div>
  );
}
