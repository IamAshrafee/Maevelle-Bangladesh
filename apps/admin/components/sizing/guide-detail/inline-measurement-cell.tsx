'use client';

import { type ClipboardEvent, useEffect, useState } from 'react';
import type { SizingMeasurementUnitDto } from '@maevelle/contracts';

import { Input } from '@/components/ui/input';
import { errorMessage } from './guide-detail-utils';

interface InlineMeasurementCellProps {
  rowIndex: number;
  columnIndex: number;
  value: string;
  unit: SizingMeasurementUnitDto;
  saving: boolean;
  onSave: (value: string) => Promise<void>;
  onPasteTable: (value: string) => Promise<void>;
  onOpenAdvanced: () => void;
}

export function InlineMeasurementCell({
  rowIndex,
  columnIndex,
  value,
  unit,
  saving,
  onSave,
  onPasteTable,
  onOpenAdvanced,
}: InlineMeasurementCellProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');

  useEffect(() => setDraft(value), [value]);

  async function commit() {
    if (draft.trim() === value.trim()) return;
    setError('');
    try {
      await onSave(draft);
    } catch (caught) {
      setError(errorMessage(caught, 'Invalid value.'));
    }
  }

  return (
    <div className="group/cell relative min-w-28">
      <Input
        data-matrix-row={rowIndex}
        data-matrix-column={columnIndex}
        aria-label={`Measurement row ${rowIndex + 1}, column ${columnIndex + 1}`}
        value={draft}
        placeholder="—"
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
          const pasted = event.clipboardData.getData('text/plain');
          if (!pasted.includes('\t') && !pasted.includes('\n') && !pasted.includes('\r')) return;
          event.preventDefault();
          void onPasteTable(pasted).catch((caught) => {
            setError(errorMessage(caught, 'Could not paste this table.'));
          });
        }}
        onBlur={() => void commit()}
        onDoubleClick={onOpenAdvanced}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(value);
            event.currentTarget.blur();
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit().then(() => {
              document
                .querySelector<HTMLInputElement>(
                  `[data-matrix-row="${rowIndex + 1}"][data-matrix-column="${columnIndex}"]`,
                )
                ?.focus();
            });
          }
        }}
        className={`h-8 border-transparent bg-transparent px-2 font-mono text-xs tabular-nums hover:border-border focus:border-ring ${error ? 'border-destructive' : ''}`}
      />
      <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground opacity-0 group-hover/cell:opacity-100">
        {saving ? 'saving' : unit}
      </span>
      {error ? (
        <span className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-destructive/30 bg-card p-2 text-[10px] text-destructive shadow-md">
          {error}
        </span>
      ) : null}
    </div>
  );
}
