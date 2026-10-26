'use client';

import type { PublicSizeGuideDto, SizingSubjectTypeDto } from '@maevelle/contracts';
import type { MutableRefObject, RefObject } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { CloseIcon } from '@/components/ui/icons';

type ConvertibleUnit = 'cm' | 'inch';

const MEASUREMENT_BASIS_LABELS: Record<SizingSubjectTypeDto, string> = {
  BODY: 'Body measurements',
  GARMENT: 'Garment measurements',
  PRODUCT: 'Product measurements',
};

export function convertGuideMeasurement(
  value: string,
  from: ConvertibleUnit,
  to: ConvertibleUnit,
): string {
  if (from === to) return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  const converted = from === 'inch' ? parsed * 2.54 : parsed / 2.54;
  return converted.toFixed(Number.isInteger(converted) ? 0 : 2).replace(/\.00$/, '');
}

function formatValue(
  value: PublicSizeGuideDto['rows'][number]['values'][number],
  displayUnit: ConvertibleUnit | null,
): string {
  const targetUnit =
    displayUnit && (value.unit === 'cm' || value.unit === 'inch') ? displayUnit : value.unit;
  const convert = (raw: string) =>
    displayUnit && (value.unit === 'cm' || value.unit === 'inch')
      ? convertGuideMeasurement(raw, value.unit, displayUnit)
      : raw;
  const marker = value.isApproximate ? '≈' : '';

  if (value.exact !== undefined) return `${marker}${convert(value.exact)} ${targetUnit}`;
  if (value.min !== undefined && value.max !== undefined) {
    return `${marker}${convert(value.min)}–${convert(value.max)} ${targetUnit}`;
  }
  return '—';
}

function basisLabel(basis: SizingSubjectTypeDto): string {
  return MEASUREMENT_BASIS_LABELS[basis];
}

export interface SizeGuideDialogProps {
  readonly guide?: PublicSizeGuideDto | null;
  readonly productTitle: string;
  readonly selectedSizeLabel?: string | undefined;
  readonly onSelectSize?: (label: string, productOptionValueId: string) => void;
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
  readonly dialogRef?: RefObject<HTMLDialogElement | null>;
}

/** Customer fit guidance rendered exclusively from the published sizing read model. */
export function SizeGuideDialog({
  guide,
  productTitle,
  selectedSizeLabel,
  onSelectSize,
  isOpen = false,
  onClose,
  dialogRef,
}: SizeGuideDialogProps) {
  const internalRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [displayUnit, setDisplayUnit] = useState<ConvertibleUnit | null>(null);

  const canConvertUnits = useMemo(() => {
    if (!guide || guide.rows.length === 0) return false;
    const units = guide.rows.flatMap((row) => row.values.map((value) => value.unit));
    return units.length > 0 && units.every((unit) => unit === 'cm' || unit === 'inch');
  }, [guide]);

  useEffect(() => {
    if (!guide || !canConvertUnits) {
      setDisplayUnit(null);
      return;
    }
    setDisplayUnit(guide.rows[0]?.values[0]?.unit === 'inch' ? 'inch' : 'cm');
  }, [canConvertUnits, guide]);

  useEffect(() => {
    if (!dialogRef) return;
    (dialogRef as MutableRefObject<HTMLDialogElement | null>).current = internalRef.current;
    return () => {
      (dialogRef as MutableRefObject<HTMLDialogElement | null>).current = null;
    };
  }, [dialogRef]);

  useEffect(() => {
    const dialog = internalRef.current;
    if (!dialog || !guide) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [guide, isOpen]);

  if (!guide) return null;

  const instructionColumns = guide.columns.filter((column) => column.instructions);
  const selectedRow = guide.rows.find(
    (row) => row.label.trim().toLocaleLowerCase() === selectedSizeLabel?.trim().toLocaleLowerCase(),
  );

  function requestClose() {
    internalRef.current?.close();
    onClose?.();
  }

  function selectRow(row: PublicSizeGuideDto['rows'][number]) {
    if (!row.isSelectable || !row.productOptionValueId || !onSelectSize) return;
    onSelectSize(row.label, row.productOptionValueId);
  }

  return (
    <dialog
      ref={internalRef}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto h-dvh max-h-dvh w-full max-w-none overflow-hidden bg-transparent p-0 text-on-surface backdrop:bg-inverse-surface/55 backdrop:backdrop-blur-xs sm:h-auto sm:max-h-[88dvh] sm:w-[min(920px,calc(100%-2rem))] sm:rounded-3xl"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="flex h-full max-h-dvh min-h-0 flex-col bg-surface-container-lowest shadow-2xl sm:max-h-[88dvh] sm:rounded-3xl sm:border sm:border-border/60">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 bg-surface-container-lowest px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-label-sm text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              Size &amp; Fit Guide
            </p>
            <h2
              id={titleId}
              className="mt-1 font-headline-md text-xl font-semibold text-on-surface sm:text-2xl"
            >
              {guide.name}
            </h2>
            <p
              id={descriptionId}
              className="mt-1 truncate font-body-sm text-sm text-on-surface-variant"
            >
              {basisLabel(guide.measurementBasis)} for {productTitle}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close size and fit guide"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-150 hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={requestClose}
          >
            <CloseIcon size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
          <div className="space-y-6">
            {(guide.fitNotes || guide.instructions) && (
              <section className="grid gap-3 sm:grid-cols-2" aria-label="Fit guidance">
                {guide.fitNotes ? (
                  <div className="rounded-2xl border border-border/60 bg-surface-container-low p-4">
                    <h3 className="font-label-md text-sm font-semibold text-on-surface">
                      Fit note
                    </h3>
                    <p className="mt-1.5 whitespace-pre-line font-body-sm text-sm leading-6 text-on-surface-variant">
                      {guide.fitNotes}
                    </p>
                  </div>
                ) : null}
                {guide.instructions ? (
                  <div className="rounded-2xl border border-border/60 bg-surface-container-low p-4">
                    <h3 className="font-label-md text-sm font-semibold text-on-surface">
                      Before measuring
                    </h3>
                    <p className="mt-1.5 whitespace-pre-line font-body-sm text-sm leading-6 text-on-surface-variant">
                      {guide.instructions}
                    </p>
                  </div>
                ) : null}
              </section>
            )}

            <section aria-labelledby={`${titleId}-chart`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3
                    id={`${titleId}-chart`}
                    className="font-headline-sm text-base font-semibold text-on-surface"
                  >
                    {basisLabel(guide.measurementBasis)}
                  </h3>
                  <p className="mt-0.5 font-body-sm text-xs text-on-surface-variant">
                    Measurements marked ≈ are approximate.
                  </p>
                </div>
                {canConvertUnits && displayUnit ? (
                  <div
                    className="inline-flex rounded-xl bg-surface-container p-1"
                    aria-label="Measurement unit"
                  >
                    {(['inch', 'cm'] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        aria-pressed={displayUnit === unit}
                        className={`min-h-9 rounded-lg px-3 font-label-sm text-xs font-semibold transition-colors duration-150 ${displayUnit === unit ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                        onClick={() => setDisplayUnit(unit)}
                      >
                        {unit === 'inch' ? 'in' : 'cm'}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-border/60 bg-surface-container-lowest [scrollbar-width:thin]">
                <table className="w-full min-w-max border-collapse text-left font-body-sm text-sm">
                  <thead className="bg-surface-container-low">
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 z-10 min-w-24 border-r border-border/60 bg-surface-container-low px-3 py-3 font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface"
                      >
                        Size
                      </th>
                      {guide.columns.map((column) => (
                        <th
                          key={column.id}
                          scope="col"
                          className="min-w-32 px-3 py-3 font-label-sm text-xs font-bold text-on-surface"
                        >
                          {column.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {guide.rows.map((row) => {
                      const selected = row.id === selectedRow?.id;
                      return (
                        <tr key={row.id} className={selected ? 'bg-primary-fixed/35' : undefined}>
                          <th
                            scope="row"
                            className={`sticky left-0 z-10 border-r border-border/60 px-3 py-3 font-label-md font-semibold ${selected ? 'bg-primary-fixed text-primary' : 'bg-surface-container-lowest text-on-surface'}`}
                          >
                            {row.isSelectable && row.productOptionValueId && onSelectSize ? (
                              <button
                                type="button"
                                aria-pressed={selected}
                                className="min-h-9 min-w-11 rounded-lg px-2 text-left underline-offset-4 transition-colors duration-150 hover:bg-primary-fixed hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                onClick={() => selectRow(row)}
                              >
                                {row.label}
                              </button>
                            ) : (
                              row.label
                            )}
                          </th>
                          {guide.columns.map((column) => {
                            const value = row.values.find(
                              (candidate) => candidate.columnId === column.id,
                            );
                            return (
                              <td
                                key={column.id}
                                className="px-3 py-3 font-mono text-sm tabular-nums text-on-surface-variant"
                              >
                                {value ? formatValue(value, displayUnit) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {guide.rows.some((row) => row.isSelectable) ? (
                <p className="mt-2 font-body-sm text-xs text-on-surface-variant">
                  Choose a linked size in the first column to apply it to this Product.
                </p>
              ) : null}
            </section>

            {instructionColumns.length > 0 ? (
              <section aria-labelledby={`${titleId}-measure`}>
                <h3
                  id={`${titleId}-measure`}
                  className="font-headline-sm text-base font-semibold text-on-surface"
                >
                  How to measure
                </h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {instructionColumns.map((column) => (
                    <div
                      key={column.id}
                      className="rounded-xl border border-border/60 bg-surface-container-low p-3.5"
                    >
                      <dt className="font-label-md text-sm font-semibold text-on-surface">
                        {column.name}
                      </dt>
                      <dd className="mt-1 font-body-sm text-sm leading-6 text-on-surface-variant">
                        {column.instructions}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>
        </div>

        <footer className="shrink-0 border-t border-border/60 bg-surface-container-lowest px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex justify-end">
            <button
              type="button"
              className="min-h-11 rounded-full bg-primary px-6 font-label-md text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={requestClose}
            >
              Done
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

export { SizeGuideDialog as ProductSizeGuideDrawerModal };
