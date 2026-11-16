import type { SizeGuideRowDto, SizingMeasurementUnitDto } from '@maevelle/contracts';

export type Feedback = { message: string; tone: 'success' | 'warning' | 'destructive' } | null;

export type CellEditState = {
  rowId: string;
  rowLabel: string;
  measurementId: string;
  measurementName: string;
  exact: string;
  min: string;
  max: string;
  unit: SizingMeasurementUnitDto;
  isApproximate: boolean;
  hasExistingValue: boolean;
} | null;

export type RowEditState = {
  id: string;
  displayLabel: string;
  sizeDefinitionId: string;
} | null;

export type GuideEditState = {
  name: string;
  description: string;
  sizeSystemId: string;
} | null;

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function csvEscape(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

export function parseMeasurementCell(
  value: string,
): { exact: string } | { min: string; max: string } | null {
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^\d+(?:\.\d{1,3})?$/.test(normalized)) {
    return { exact: normalized };
  }

  const range = normalized.match(/^(\d+(?:\.\d{1,3})?)\s*[-–]\s*(\d+(?:\.\d{1,3})?)$/);
  if (!range) return null;

  return { min: range[1]!, max: range[2]! };
}

export function formatMeasurementCell(
  cell: SizeGuideRowDto['measurements'][number] | undefined,
): string {
  if (!cell) return '';
  const value = cell.exact ?? (cell.min && cell.max ? `${cell.min}-${cell.max}` : '');
  return `${cell.approximate ? '~' : ''}${value}`;
}
