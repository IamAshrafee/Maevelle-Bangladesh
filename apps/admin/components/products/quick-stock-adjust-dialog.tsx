'use client';

import { useState } from 'react';
import { Boxes, Check, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { WarehouseLocationDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalogData, CatalogRequestError } from '@/lib/catalog/api';

interface QuickStockAdjustDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly variantId: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly currentSellable: number | string;
  readonly locations: readonly WarehouseLocationDto[];
  readonly onSuccess?: () => void;
}

export function QuickStockAdjustDialog({
  open,
  onOpenChange,
  variantId,
  variantTitle,
  sku,
  currentSellable,
  locations,
  onSuccess,
}: QuickStockAdjustDialogProps) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [condition, setCondition] = useState<'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION'>(
    'SELLABLE',
  );
  const [deltaValue, setDeltaValue] = useState('');
  const [deltaSign, setDeltaSign] = useState<'+' | '-'>('+');
  const [reasonCode, setReasonCode] = useState<'CORRECTION' | 'DAMAGE' | 'FOUND_STOCK' | 'OTHER'>(
    'CORRECTION',
  );
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numSellable =
    typeof currentSellable === 'number' ? currentSellable : parseInt(currentSellable || '0', 10);
  const safeCurrentSellable = isNaN(numSellable) ? 0 : numSellable;

  const parsedQty = parseInt(deltaValue, 10);
  const computedDelta =
    !isNaN(parsedQty) && parsedQty > 0 ? (deltaSign === '+' ? parsedQty : -parsedQty) : 0;

  const projectedTotal = safeCurrentSellable + (condition === 'SELLABLE' ? computedDelta : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!locationId) {
      setError('Please select a warehouse location.');
      return;
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      setError('Please enter a positive adjustment quantity.');
      return;
    }

    if (condition === 'SELLABLE' && projectedTotal < 0) {
      setError(`Cannot adjust stock below 0. Current available stock is ${currentSellable}.`);
      return;
    }

    setLoading(true);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `adj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await catalogData('/admin/inventory/adjustments', {
        method: 'POST',
        headers: {
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          variantId,
          locationId,
          condition,
          quantityDelta: String(computedDelta),
          reasonCode,
          note: note.trim() || undefined,
        }),
      });

      onOpenChange(false);
      setDeltaValue('');
      setNote('');
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      if (err instanceof CatalogRequestError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to adjust inventory stock.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-6 space-y-4">
        <SheetHeader className="p-0 pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <Boxes className="size-4 text-primary" />
            <span>Adjust Stock: {variantTitle || sku}</span>
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground font-mono">
            SKU: {sku} · Current Sellable: {currentSellable} units
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Warehouse Location */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Warehouse Location</Label>
            <NativeSelect
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="text-xs"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} {loc.code ? `(${loc.code})` : ''}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Condition and Reason */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Stock Condition</Label>
              <NativeSelect
                value={condition}
                onChange={(e) => setCondition(e.target.value as typeof condition)}
                className="text-xs"
              >
                <option value="SELLABLE">Sellable Stock</option>
                <option value="DAMAGED">Damaged / Defective</option>
                <option value="QUARANTINE">Quarantine</option>
                <option value="INSPECTION">Inspection</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Reason Code</Label>
              <NativeSelect
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as typeof reasonCode)}
                className="text-xs"
              >
                <option value="CORRECTION">Physical Count Correction</option>
                <option value="DAMAGE">Damaged Units</option>
                <option value="FOUND_STOCK">Found Extra Units</option>
                <option value="OTHER">Other Operational Reason</option>
              </NativeSelect>
            </div>
          </div>

          {/* Quantity Delta with Sign Switcher */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Adjustment Quantity (Signed Delta)</Label>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-input bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setDeltaSign('+')}
                  className={`flex min-h-9 items-center gap-1 rounded px-2.5 text-xs font-semibold transition-colors duration-150 ${
                    deltaSign === '+'
                      ? 'bg-success text-success-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ArrowUpRight className="size-3.5" />
                  <span>Add (+)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeltaSign('-')}
                  className={`flex min-h-9 items-center gap-1 rounded px-2.5 text-xs font-semibold transition-colors duration-150 ${
                    deltaSign === '-'
                      ? 'bg-destructive text-destructive-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ArrowDownRight className="size-3.5" />
                  <span>Remove (−)</span>
                </button>
              </div>

              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Units (e.g. 5)"
                value={deltaValue}
                onChange={(e) => setDeltaValue(e.target.value)}
                className="h-9 text-xs tabular-nums font-mono"
              />
            </div>

            {/* Projected Stock Preview */}
            <p className="text-[11px] text-muted-foreground">
              Resulting available stock:{' '}
              <span className="font-semibold text-foreground font-mono">
                {projectedTotal} units
              </span>
            </p>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Audit Note (Optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Physical inventory count verified by supervisor"
              className="h-9 text-xs"
            />
          </div>

          <SheetFooter className="p-0 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !deltaValue || isNaN(parsedQty) || parsedQty <= 0}
              className="px-4 text-xs"
            >
              <Check className="size-3.5 mr-1" />
              {loading ? 'Recording Movement…' : 'Confirm Stock Adjustment'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
