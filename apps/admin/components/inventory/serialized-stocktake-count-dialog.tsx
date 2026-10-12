'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StocktakeLineDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';

type Condition = 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
const conditions: readonly Condition[] = ['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION'];

export interface SerializedCountEntry {
  unitId: string;
  condition: Condition;
}

export function SerializedStocktakeCountDialog({
  open,
  onOpenChange,
  line,
  disabled,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: StocktakeLineDto | null;
  disabled?: boolean;
  onSave: (units: readonly SerializedCountEntry[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, Condition>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !line) return;
    setSelected(Object.fromEntries(
      line.serializedUnits
        .filter((unit) => unit.countedCondition)
        .map((unit) => [unit.unitId, unit.countedCondition!]),
    ));
    setError(null);
  }, [line, open]);

  const selectedCount = Object.keys(selected).length;
  const allSelected = useMemo(
    () => Boolean(line?.serializedUnits.length) && selectedCount === line?.serializedUnits.length,
    [line, selectedCount],
  );
  if (!line) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(Object.entries(selected).map(([unitId, condition]) => ({ unitId, condition })));
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the serialized count.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,760px)] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Count individual units</DialogTitle>
          <DialogDescription>
            Mark only the Unit Codes physically present at this location, then confirm each unit&apos;s observed condition.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm">
          <span className="font-mono tabular-nums">{selectedCount} of {line.serializedUnits.length} present</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || saving || line.serializedUnits.length === 0}
            onClick={() => setSelected(allSelected ? {} : Object.fromEntries(
              line.serializedUnits.map((unit) => [
                unit.unitId,
                unit.countedCondition ?? unit.expectedCondition ?? 'SELLABLE',
              ]),
            ))}
          >
            {allSelected ? 'Clear all' : 'Mark all present'}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {line.serializedUnits.map((unit) => {
            const condition = selected[unit.unitId];
            return (
              <div key={unit.unitId} className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card p-3">
                <Checkbox
                  checked={Boolean(condition)}
                  disabled={disabled || saving}
                  aria-label={`Mark ${unit.unitCode} present`}
                  onCheckedChange={(checked) => setSelected((current) => {
                    const next = { ...current };
                    if (checked) next[unit.unitId] = unit.countedCondition ?? unit.expectedCondition ?? 'SELLABLE';
                    else delete next[unit.unitId];
                    return next;
                  })}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-medium tabular-nums">{unit.unitCode}</p>
                  <p className="text-xs text-muted-foreground">Expected: {unit.expectedCondition ?? 'found after snapshot'}</p>
                </div>
                <NativeSelect
                  size="sm"
                  className="w-36"
                  value={condition ?? unit.expectedCondition ?? 'SELLABLE'}
                  disabled={!condition || disabled || saving}
                  aria-label={`Observed condition for ${unit.unitCode}`}
                  onChange={(event) => setSelected((current) => ({
                    ...current,
                    [unit.unitId]: event.target.value as Condition,
                  }))}
                >
                  {conditions.map((value) => <option key={value} value={value}>{value}</option>)}
                </NativeSelect>
              </div>
            );
          })}
          {line.serializedUnits.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No registered Unit IDs were expected at the snapshot. Register or locate the physical identity before counting found serialized stock.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={disabled || saving}>
            {saving ? 'Saving…' : `Save ${selectedCount} counted units`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
