'use client';

import type { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Download, Edit2, Plus, Trash2, Upload } from 'lucide-react';

import type {
  MeasurementDefinitionDto,
  SizeDefinitionDto,
  SizeGuideDetailDto,
  SizeGuideRowDto,
} from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import { formatMeasurementCell } from './guide-detail-utils';
import { InlineMeasurementCell } from './inline-measurement-cell';

type ActiveRevision = SizeGuideDetailDto['revisions'][number];

interface GuideMeasurementMatrixProps {
  guide: SizeGuideDetailDto;
  activeRevision: ActiveRevision;
  measurements: readonly MeasurementDefinitionDto[];
  availableMeasurements: readonly MeasurementDefinitionDto[];
  unusedMeasurements: readonly MeasurementDefinitionDto[];
  sortedRows: readonly SizeGuideRowDto[];
  sizeDefinitions: readonly SizeDefinitionDto[];
  newColumnDefinitionId: string;
  setNewColumnDefinitionId: (id: string) => void;
  busy: boolean;
  inlineSavingKey: string | null;
  onExportCsv: () => void;
  onOpenImport: () => void;
  onAddColumn: () => void;
  onAddRow: (e: FormEvent<HTMLFormElement>) => void;
  onRenameColumn: (columnId: string, displayName: string) => void;
  onRemoveColumn: (columnId: string, displayName: string) => void;
  onMoveRow: (rowId: string, direction: -1 | 1) => void;
  onSaveInlineCell: (
    row: SizeGuideRowDto,
    measurement: MeasurementDefinitionDto,
    value: string,
  ) => Promise<void>;
  onPasteMeasurementTable: (
    startRow: number,
    startColumn: number,
    rawValue: string,
  ) => Promise<void>;
  onOpenCellEditor: (row: SizeGuideRowDto, measurement: MeasurementDefinitionDto) => void;
  onEditRow: (row: SizeGuideRowDto) => void;
  onDeleteRow: (row: SizeGuideRowDto) => void;
}

export function GuideMeasurementMatrix({
  guide,
  activeRevision,
  measurements,
  availableMeasurements,
  unusedMeasurements,
  sortedRows,
  sizeDefinitions,
  newColumnDefinitionId,
  setNewColumnDefinitionId,
  busy,
  inlineSavingKey,
  onExportCsv,
  onOpenImport,
  onAddColumn,
  onAddRow,
  onRenameColumn,
  onRemoveColumn,
  onMoveRow,
  onSaveInlineCell,
  onPasteMeasurementTable,
  onOpenCellEditor,
  onEditRow,
  onDeleteRow,
}: GuideMeasurementMatrixProps) {
  const isDraft = activeRevision.status === 'DRAFT';

  return (
    <PageSection
      title="Measurement Matrix"
      description="Rows are the customer-facing size or fit choices. Add only the measurement columns this guide genuinely needs."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            disabled={measurements.length === 0 || sortedRows.length === 0}
            className="h-8 text-xs gap-1"
          >
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </Button>
          {isDraft ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenImport}
              disabled={measurements.length === 0}
              className="h-8 text-xs gap-1"
            >
              <Upload className="size-3.5" />
              <span>Import CSV</span>
            </Button>
          ) : null}
        </div>
      }
    >
      {isDraft ? (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 text-xs font-medium text-foreground">
              Add measurement column
              <NativeSelect
                value={newColumnDefinitionId}
                onChange={(event) => setNewColumnDefinitionId(event.target.value)}
                className="mt-1 w-full bg-card text-xs"
              >
                <option value="">Choose a measurement</option>
                {unusedMeasurements.map((measurement) => (
                  <option key={measurement.id} value={measurement.id}>
                    {measurement.name} ({measurement.defaultUnit})
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !newColumnDefinitionId}
              onClick={onAddColumn}
            >
              <Plus className="size-4" /> Add Column
            </Button>
          </div>
          <form onSubmit={onAddRow} className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <label className="block text-xs font-medium text-foreground flex-1">
              Size Display Label
              <Input
                name="displayLabel"
                required
                placeholder="e.g. S, M, L, XL, 38, 40, Free Size"
                className="mt-1 h-9 text-xs"
              />
            </label>

            {guide.sizeSystemId ? (
              <label className="block text-xs font-medium text-foreground flex-1">
                Canonical Size Definition
                <NativeSelect
                  name="sizeDefinitionId"
                  defaultValue=""
                  className="mt-1 h-9 text-xs bg-card"
                >
                  <option value="">Unmapped (Custom Label)</option>
                  {sizeDefinitions.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.label} ({def.code})
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ) : null}

            <Button
              type="submit"
              disabled={busy}
              className="min-h-10 sm:min-h-9 touch-manipulation text-xs gap-1.5 shrink-0"
            >
              <Plus className="size-4" />
              <span>Add Size Row</span>
            </Button>
          </form>
        </div>
      ) : null}

      {measurements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {availableMeasurements.length > 0 ? (
            'No measurement columns selected yet. Choose the first authentic measurement above.'
          ) : (
            <>
              No reusable measurements are available for this guide. Visit{' '}
              <Link
                href="/sizing/settings?tab=measurements"
                className="font-semibold text-primary underline"
              >
                Advanced Settings
              </Link>{' '}
              to add one.
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop High-Density Table (sm and up) */}
          <div className="hidden sm:block">
            <PagePanel className="p-0 border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 font-semibold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="sticky left-0 z-10 bg-muted px-4 py-3 min-w-44 border-r border-border">
                        Size Row
                      </th>
                      {measurements.map((m) => {
                        const column = activeRevision.columns.find(
                          (candidate) => candidate.measurementDefinitionId === m.id,
                        );
                        return (
                          <th key={m.id} className="px-4 py-3 whitespace-nowrap">
                            {isDraft && column ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  aria-label={`Column label for ${m.name}`}
                                  defaultValue={column.displayName}
                                  className="h-7 min-w-28 text-xs font-semibold"
                                  onBlur={(event) => onRenameColumn(column.id, event.target.value)}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove ${m.name} column`}
                                  onClick={() => onRemoveColumn(column.id, column.displayName)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div>{m.name}</div>
                            )}
                            <span className="font-normal font-mono text-[10px] text-muted-foreground">
                              {m.defaultUnit} · {m.code}
                            </span>
                          </th>
                        );
                      })}
                      {isDraft ? <th className="px-4 py-3 text-right">Row Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={measurements.length + 2}
                          className="p-8 text-center text-muted-foreground"
                        >
                          No size rows created yet. Use the form above to add sizes.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row, rowIdx) => (
                        <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                          <td className="sticky left-0 z-10 bg-card border-r border-border px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <strong className="font-mono text-sm font-semibold text-foreground">
                                  {row.displayLabel}
                                </strong>
                                <div className="text-[10px] text-muted-foreground">
                                  {row.sizeDefinitionLabel ??
                                    (row.sizeDefinitionId ? 'Mapped' : 'Unmapped')}
                                </div>
                              </div>
                              {isDraft ? (
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={rowIdx === 0 || busy}
                                    onClick={() => onMoveRow(row.id, -1)}
                                    className="size-6 p-0 text-muted-foreground"
                                    title="Move up"
                                  >
                                    <ArrowUp className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={rowIdx === sortedRows.length - 1 || busy}
                                    onClick={() => onMoveRow(row.id, 1)}
                                    className="size-6 p-0 text-muted-foreground"
                                    title="Move down"
                                  >
                                    <ArrowDown className="size-3" />
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </td>

                          {measurements.map((m, columnIndex) => {
                            const cell = row.measurements.find(
                              (v) => v.measurementDefinitionId === m.id,
                            );
                            return (
                              <td
                                key={m.id}
                                className={`whitespace-nowrap px-2 py-2 font-mono tabular-nums ${
                                  isDraft ? 'hover:bg-primary/5' : 'px-4 py-3'
                                }`}
                              >
                                {isDraft ? (
                                  <InlineMeasurementCell
                                    rowIndex={rowIdx}
                                    columnIndex={columnIndex}
                                    value={formatMeasurementCell(cell)}
                                    unit={cell?.unit ?? m.defaultUnit}
                                    saving={inlineSavingKey === `${row.id}:${m.id}`}
                                    onSave={(value) => onSaveInlineCell(row, m, value)}
                                    onPasteTable={(value) =>
                                      onPasteMeasurementTable(rowIdx, columnIndex, value)
                                    }
                                    onOpenAdvanced={() => onOpenCellEditor(row, m)}
                                  />
                                ) : cell ? (
                                  <span className="font-medium text-foreground">
                                    {cell.approximate ? '~' : ''}
                                    {cell.exact ?? `${cell.min}–${cell.max}`} {cell.unit}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                            );
                          })}

                          {isDraft ? (
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onEditRow(row)}
                                  className="size-7 p-0 text-muted-foreground"
                                  title="Edit label"
                                >
                                  <Edit2 className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onDeleteRow(row)}
                                  className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                  title="Delete row"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PagePanel>
          </div>

          {/* Mobile Expandable Size Card Stack (< sm) */}
          <div className="space-y-3 sm:hidden">
            {sortedRows.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground p-6">
                No size rows created yet.
              </p>
            ) : (
              sortedRows.map((row, rowIdx) => (
                <PagePanel key={row.id} className="p-4 border-border flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <div>
                      <strong className="font-mono text-base font-bold text-foreground">
                        {row.displayLabel}
                      </strong>
                      <p className="text-[11px] text-muted-foreground">
                        {row.sizeDefinitionLabel ??
                          (row.sizeDefinitionId ? 'Mapped Canonical Size' : 'Unmapped')}
                      </p>
                    </div>

                    {isDraft ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rowIdx === 0 || busy}
                          onClick={() => onMoveRow(row.id, -1)}
                          className="size-9 p-0"
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rowIdx === sortedRows.length - 1 || busy}
                          onClick={() => onMoveRow(row.id, 1)}
                          className="size-9 p-0"
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDeleteRow(row)}
                          className="size-9 p-0 text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {/* Measurement Grid on Mobile */}
                  <div className="grid grid-cols-2 gap-2">
                    {measurements.map((m) => {
                      const cell = row.measurements.find((v) => v.measurementDefinitionId === m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={!isDraft}
                          onClick={() => onOpenCellEditor(row, m)}
                          className="flex flex-col items-start p-2.5 rounded-lg border border-border bg-muted/20 text-left hover:border-primary/50 transition-colors"
                        >
                          <span className="text-[10px] text-muted-foreground truncate w-full">
                            {m.name}
                          </span>
                          <span className="mt-0.5 font-mono text-xs font-semibold text-foreground tabular-nums">
                            {cell ? (
                              `${cell.approximate ? '~' : ''}${cell.exact ?? `${cell.min}–${cell.max}`} ${cell.unit}`
                            ) : (
                              <span className="text-primary font-normal">+ Set</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PagePanel>
              ))
            )}
          </div>
        </>
      )}
    </PageSection>
  );
}
