'use client';

import { useEffect, useState } from 'react';
import type { StocktakeDetailDto } from '@maevelle/contracts';
import { AlertCircle, CheckCircle2, SlidersHorizontal } from 'lucide-react';

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
import { formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryConditionBadge } from './inventory-page-ui';

export type StocktakeCondition = 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
export type StocktakeConditionValues = Partial<Record<StocktakeCondition, string>>;
export type StocktakeLine = StocktakeDetailDto['lines'][number];

const conditions: readonly StocktakeCondition[] = [
  'SELLABLE',
  'DAMAGED',
  'QUARANTINE',
  'INSPECTION',
];

type StocktakeConditionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: StocktakeLine | null;
  currentCounted: string;
  conditionValues: StocktakeConditionValues;
  onSave: (
    inventoryItemId: string,
    countedTotal: string,
    values: StocktakeConditionValues,
  ) => Promise<void>;
  disabled?: boolean | undefined;
};

export function StocktakeConditionDialog({
  open,
  onOpenChange,
  line,
  currentCounted,
  conditionValues,
  onSave,
  disabled = false,
}: StocktakeConditionDialogProps) {
  const [values, setValues] = useState<StocktakeConditionValues>({});
  const [targetCounted, setTargetCounted] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!line || !open) return;
    setTargetCounted(currentCounted || '0');
    const initial = { ...conditionValues };
    if (!conditions.some((condition) => initial[condition])) initial.SELLABLE = currentCounted || '0';
    setValues(initial);
    setError(null);
  }, [conditionValues, currentCounted, line, open]);

  if (!line) return null;
  const currentLine = line;

  const allocated = conditions.reduce((total, condition) => total + (Number(values[condition]) || 0), 0);
  const target = Number(targetCounted) || 0;
  const remaining = target - allocated;
  const balanced = Math.abs(remaining) < 0.000001;

  async function save() {
    if (!balanced) {
      setError(
        `Condition total (${formatInventoryNumber(allocated)}) must equal the physical count (${formatInventoryNumber(target)}).`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(currentLine.inventoryItemId, targetCounted, values);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Condition counts could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="inset-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col rounded-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" />
            Split condition quantities
          </DialogTitle>
          <DialogDescription>
            Record the physical condition of <strong className="text-foreground">{currentLine.productTitle}</strong>{' '}
            <span className="font-mono tabular-nums">({currentLine.sku})</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
          <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Physical count</p>
              <p className="font-mono text-lg font-semibold tabular-nums">
                {formatInventoryNumber(targetCounted)} units
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Snapshot expected</p>
              <p className="font-mono text-sm tabular-nums text-muted-foreground">
                {formatInventoryNumber(currentLine.expectedQuantityAtSnapshot)} units
              </p>
            </div>
          </div>

          <div className="divide-y divide-border/50">
            {conditions.map((condition) => (
              <div key={condition} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <InventoryConditionBadge condition={condition} />
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    Exp. {formatInventoryNumber(currentLine.expectedQuantitiesByCondition?.[condition] ?? '0')}
                  </span>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  aria-label={`${condition.toLowerCase()} quantity`}
                  disabled={disabled || saving}
                  value={values[condition] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [condition]: event.target.value }))
                  }
                  className="w-28 text-right font-mono tabular-nums"
                />
              </div>
            ))}
          </div>

          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-xs ${
              balanced ? 'border-success/20 bg-success/10' : 'border-warning/20 bg-warning/10'
            }`}
          >
            <div className="flex items-center gap-1.5 font-medium">
              {balanced ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <AlertCircle className="size-4 text-warning" />
              )}
              <span className="font-mono tabular-nums">
                {formatInventoryNumber(allocated)} / {formatInventoryNumber(target)} allocated
              </span>
            </div>
            {!balanced && remaining > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    SELLABLE: String((Number(current.SELLABLE) || 0) + remaining),
                  }))
                }
                className="text-warning hover:text-warning"
              >
                Assign {formatInventoryNumber(remaining)} to Sellable
              </Button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setValues({ SELLABLE: targetCounted, DAMAGED: '0', QUARANTINE: '0', INSPECTION: '0' })
              }
              disabled={disabled || saving}
            >
              All sellable
            </Button>
          </div>
          <Button type="button" onClick={() => void save()} disabled={disabled || saving || !balanced}>
            {saving ? 'Saving…' : 'Apply conditions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
