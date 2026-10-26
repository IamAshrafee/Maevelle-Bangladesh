'use client';

import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Download,
  Edit2,
  Eye,
  ExternalLink,
  History,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  type ClipboardEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  MeasurementDefinitionDto,
  PublicSizeGuideDto,
  SizeDefinitionDto,
  SizeGuideDetailDto,
  SizeGuideMatrixChangeDto,
  SizeGuidePublishPreviewDto,
  SizeGuideRowDto,
  SizeSystemDto,
  SizingMeasurementUnitDto,
} from '@maevelle/contracts';

import { CustomerGuidePreview } from '@/components/sizing/customer-guide-preview';

import {
  addSizeGuideColumn,
  archiveSizeGuide,
  createSizeGuideRevision,
  createSizeGuideRow,
  deleteRowMeasurement,
  deleteSizeGuideRow,
  duplicateSizeGuide,
  fetchSizeGuideDetail,
  fetchSizingWorkspace,
  previewSizeGuidePublication,
  publishReviewedSizeGuideRevision,
  removeSizeGuideColumn,
  renameSizeGuideColumn,
  reorderSizeGuideRows,
  restoreSizeGuide,
  setRowMeasurement,
  updateSizeGuide,
  updateSizeGuideMatrix,
  updateSizeGuideRevisionMeta,
  updateSizeGuideRow,
} from '@/lib/sizing/api';

import {
  AdminPage,
  ErrorState,
  LoadingState,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

type Feedback = { message: string; tone: 'success' | 'warning' | 'destructive' } | null;

type CellEditState = {
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

type RowEditState = {
  id: string;
  displayLabel: string;
  sizeDefinitionId: string;
} | null;

type GuideEditState = {
  name: string;
  description: string;
  sizeSystemId: string;
} | null;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function csvEscape(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCsvLine(line: string): string[] {
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

function parseMeasurementCell(
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

function formatMeasurementCell(cell: SizeGuideRowDto['measurements'][number] | undefined): string {
  if (!cell) return '';
  const value = cell.exact ?? (cell.min && cell.max ? `${cell.min}-${cell.max}` : '');
  return `${cell.approximate ? '~' : ''}${value}`;
}

function InlineMeasurementCell({
  rowIndex,
  columnIndex,
  value,
  unit,
  saving,
  onSave,
  onPasteTable,
  onOpenAdvanced,
}: {
  rowIndex: number;
  columnIndex: number;
  value: string;
  unit: SizingMeasurementUnitDto;
  saving: boolean;
  onSave: (value: string) => Promise<void>;
  onPasteTable: (value: string) => Promise<void>;
  onOpenAdvanced: () => void;
}) {
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

export default function SizeGuideStudioPage() {
  const router = useRouter();
  const params = useParams();
  const guideId = String(params?.guideId ?? '');

  const [guide, setGuide] = useState<SizeGuideDetailDto | null>(null);
  const [availableMeasurements, setAvailableMeasurements] = useState<
    readonly MeasurementDefinitionDto[]
  >([]);
  const [newColumnDefinitionId, setNewColumnDefinitionId] = useState('');
  const [sizeDefinitions, setSizeDefinitions] = useState<readonly SizeDefinitionDto[]>([]);
  const [systems, setSystems] = useState<readonly SizeSystemDto[]>([]);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Cell editing
  const [editingCell, setEditingCell] = useState<CellEditState>(null);
  const [cellSaving, setCellSaving] = useState(false);
  const [cellError, setCellError] = useState('');
  const [inlineSavingKey, setInlineSavingKey] = useState<string | null>(null);

  // Row editing
  const [editingRow, setEditingRow] = useState<RowEditState>(null);
  const [rowSaving, setRowSaving] = useState(false);

  // Guide editing
  const [editingGuide, setEditingGuide] = useState<GuideEditState>(null);
  const [guideSaving, setGuideSaving] = useState(false);

  // Duplicate
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateBusy, setDuplicateBusy] = useState(false);

  // CSV Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');

  // Linked items drawer
  const [showLinkedDrawer, setShowLinkedDrawer] = useState(false);
  const [showCustomerPreview, setShowCustomerPreview] = useState(false);
  const [publishPreview, setPublishPreview] = useState<SizeGuidePublishPreviewDto | null>(null);

  // Revision guidance meta
  const [metaInstructions, setMetaInstructions] = useState('');
  const [metaFitNotes, setMetaFitNotes] = useState('');
  const [metaDirty, setMetaDirty] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);

  const load = useCallback(async () => {
    if (!guideId) return;
    setLoading(true);

    try {
      const [guideData, workspace] = await Promise.all([
        fetchSizeGuideDetail(guideId),
        fetchSizingWorkspace(),
      ]);

      setGuide(guideData);
      setAvailableMeasurements(
        workspace.measurementDefinitions.filter(
          (m) => m.sizingDomainId === guideData.sizingDomainId && m.status === 'ACTIVE',
        ),
      );
      setSizeDefinitions(
        workspace.sizeDefinitions.filter(
          (def) =>
            def.status === 'ACTIVE' &&
            (!guideData.sizeSystemId || def.sizeSystemId === guideData.sizeSystemId),
        ),
      );
      setSystems(
        workspace.systems.filter(
          (s) => s.sizingDomainId === guideData.sizingDomainId && s.status === 'ACTIVE',
        ),
      );

      if (guideData.revisions.length > 0) {
        setActiveRevisionId((prev) => {
          if (prev && guideData.revisions.some((r) => r.id === prev)) return prev;
          const draft = guideData.revisions.find((r) => r.status === 'DRAFT');
          return draft?.id ?? guideData.revisions[0]!.id;
        });
      } else {
        setActiveRevisionId(null);
      }
    } catch (err) {
      setGuide(null);
      setFeedback({
        message: errorMessage(err, 'Failed to load size guide.'),
        tone: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [guideId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRevision = useMemo(
    () => guide?.revisions.find((r) => r.id === activeRevisionId) ?? guide?.revisions[0],
    [activeRevisionId, guide],
  );

  const draftRevision = useMemo(
    () => guide?.revisions.find((r) => r.status === 'DRAFT') ?? null,
    [guide],
  );

  const measurements = useMemo(
    () =>
      (activeRevision?.columns ?? [])
        .slice()
        .sort((left, right) => left.position - right.position)
        .flatMap((column) => {
          const definition = availableMeasurements.find(
            (measurement) => measurement.id === column.measurementDefinitionId,
          );
          return definition ? [{ ...definition, name: column.displayName }] : [];
        }),
    [activeRevision?.columns, availableMeasurements],
  );

  const unusedMeasurements = useMemo(() => {
    const usedIds = new Set(
      (activeRevision?.columns ?? []).map((column) => column.measurementDefinitionId),
    );
    return availableMeasurements.filter((measurement) => !usedIds.has(measurement.id));
  }, [activeRevision?.columns, availableMeasurements]);

  const sortedRows = useMemo(
    () => [...(activeRevision?.rows ?? [])].sort((a, b) => a.position - b.position),
    [activeRevision],
  );

  const customerPreview = useMemo<PublicSizeGuideDto | null>(() => {
    if (!guide || !activeRevision) return null;
    const usedMeasurementIds = new Set(
      activeRevision.rows.flatMap((row) =>
        row.measurements.map((value) => value.measurementDefinitionId),
      ),
    );
    const columns = measurements.filter((measurement) => usedMeasurementIds.has(measurement.id));
    return {
      id: guide.id,
      name: guide.name,
      kind: guide.kind,
      measurementBasis: guide.measurementBasis,
      instructions: activeRevision.instructions,
      fitNotes: activeRevision.fitNotes,
      columns: columns.map((column) => ({
        id: column.id,
        name: column.name,
        instructions: column.instructions,
        defaultUnit: column.defaultUnit,
      })),
      rows: [...activeRevision.rows]
        .sort((left, right) => left.position - right.position)
        .map((row) => ({
          id: row.id,
          label: row.displayLabel,
          productOptionValueId: null,
          isSelectable: false,
          values: row.measurements.map((value) => ({
            columnId: value.measurementDefinitionId,
            ...(value.exact ? { exact: value.exact } : {}),
            ...(value.min ? { min: value.min } : {}),
            ...(value.max ? { max: value.max } : {}),
            unit: value.unit,
            isApproximate: value.approximate,
          })),
        })),
    };
  }, [activeRevision, guide, measurements]);

  useEffect(() => {
    if (!activeRevision) return;
    setMetaInstructions(activeRevision.instructions ?? '');
    setMetaFitNotes(activeRevision.fitNotes ?? '');
    setMetaDirty(false);
  }, [activeRevision?.id, activeRevision?.version]);

  useEffect(() => {
    if (!metaDirty || !activeRevision || activeRevision.status !== 'DRAFT' || metaSaving) return;
    const revisionId = activeRevision.id;
    const expectedVersion = activeRevision.version;
    const timeout = window.setTimeout(() => {
      setMetaSaving(true);
      void updateSizeGuideRevisionMeta(revisionId, {
        expectedVersion,
        instructions: metaInstructions.trim() || null,
        fitNotes: metaFitNotes.trim() || null,
      })
        .then(async () => {
          setMetaDirty(false);
          setFeedback({ message: 'Working guidance saved.', tone: 'success' });
          await load();
        })
        .catch(async (caught) => {
          setFeedback({
            message: errorMessage(
              caught,
              'Automatic guidance save failed. Your text remains here.',
            ),
            tone: 'destructive',
          });
          await load();
        })
        .finally(() => setMetaSaving(false));
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [activeRevision, load, metaDirty, metaFitNotes, metaInstructions, metaSaving]);

  useEffect(() => {
    if (!metaDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [metaDirty]);

  async function mutate(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ message: successMessage, tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({ message: errorMessage(err, 'Operation failed.'), tone: 'destructive' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reviewPublication() {
    if (!activeRevision || !guide || activeRevision.status !== 'DRAFT') return;
    if (metaDirty || metaSaving || inlineSavingKey) {
      setFeedback({
        message: 'Wait for working changes to finish saving before reviewing publication.',
        tone: 'warning',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      setPublishPreview(await previewSizeGuidePublication(guide.id, activeRevision.id));
    } catch (err) {
      setFeedback({
        message: errorMessage(err, 'Could not review publication impact.'),
        tone: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  async function publishRevision() {
    if (!publishPreview) return;
    await mutate(
      () =>
        publishReviewedSizeGuideRevision(
          publishPreview.guide.id,
          publishPreview.workingRevision.id,
          publishPreview.previewToken,
        ),
      `Working changes published to Storefront successfully.`,
    );
    setPublishPreview(null);
  }

  async function createDraft() {
    if (!guide || guide.status !== 'ACTIVE' || draftRevision) return;
    await mutate(async () => {
      const created = await createSizeGuideRevision(guide.id);
      setActiveRevisionId(created.id);
    }, 'New draft revision created from the current published revision.');
  }

  async function saveGuideMetadata(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guide || !editingGuide) return;

    setGuideSaving(true);
    setFeedback(null);
    try {
      await updateSizeGuide(guide.id, {
        expectedVersion: guide.version,
        name: editingGuide.name.trim(),
        description: editingGuide.description.trim() || null,
        sizeSystemId: editingGuide.sizeSystemId || null,
      });
      setEditingGuide(null);
      setFeedback({ message: 'Guide information updated.', tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({
        message: errorMessage(err, 'Failed to update size guide.'),
        tone: 'destructive',
      });
      await load();
    } finally {
      setGuideSaving(false);
    }
  }

  async function toggleGuideLifecycle() {
    if (!guide) return;
    const isRestoring = guide.status === 'ARCHIVED';
    if (
      !isRestoring &&
      !window.confirm(`Archive "${guide.name}"? Products will lose direct sizing guidance.`)
    )
      return;

    await mutate(
      () => (isRestoring ? restoreSizeGuide(guide.id) : archiveSizeGuide(guide.id)),
      `Size guide ${isRestoring ? 'restored' : 'archived'} successfully.`,
    );
  }

  async function saveRevisionMeta() {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    setMetaSaving(true);
    setFeedback(null);

    try {
      await updateSizeGuideRevisionMeta(activeRevision.id, {
        expectedVersion: activeRevision.version,
        instructions: metaInstructions.trim() || null,
        fitNotes: metaFitNotes.trim() || null,
      });
      setMetaDirty(false);
      setFeedback({ message: 'Fit notes & measuring guidance saved.', tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({ message: errorMessage(err, 'Failed to save guidance.'), tone: 'destructive' });
      await load();
    } finally {
      setMetaSaving(false);
    }
  }

  async function addRow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const displayLabel = String(form.get('displayLabel') ?? '').trim();
    const sizeDefinitionId = String(form.get('sizeDefinitionId') ?? '').trim();
    if (!displayLabel) return;

    setBusy(true);
    setFeedback(null);
    try {
      await createSizeGuideRow(activeRevision.id, {
        expectedVersion: activeRevision.version,
        displayLabel,
        position: sortedRows.length,
        ...(sizeDefinitionId ? { sizeDefinitionId } : {}),
      });
      formElement.reset();
      setFeedback({ message: `Size row "${displayLabel}" added.`, tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({ message: errorMessage(err, 'Failed to add size row.'), tone: 'destructive' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addColumn() {
    if (!activeRevision || activeRevision.status !== 'DRAFT' || !newColumnDefinitionId) return;
    await mutate(async () => {
      await addSizeGuideColumn(activeRevision.id, {
        expectedVersion: activeRevision.version,
        measurementDefinitionId: newColumnDefinitionId,
      });
      setNewColumnDefinitionId('');
    }, 'Measurement column added.');
  }

  async function renameColumn(columnId: string, displayName: string) {
    if (!activeRevision || activeRevision.status !== 'DRAFT' || !displayName.trim()) return;
    const current = activeRevision.columns.find((column) => column.id === columnId);
    if (!current || current.displayName === displayName.trim()) return;
    await mutate(
      () =>
        renameSizeGuideColumn(activeRevision.id, columnId, {
          expectedVersion: activeRevision.version,
          displayName: displayName.trim(),
        }),
      'Column label updated.',
    );
  }

  async function removeColumn(columnId: string, displayName: string) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    if (!window.confirm(`Remove the "${displayName}" column and its entered values?`)) return;
    await mutate(
      () => removeSizeGuideColumn(activeRevision.id, columnId, activeRevision.version),
      `Measurement column "${displayName}" removed.`,
    );
  }

  async function saveRowEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeRevision || !editingRow || activeRevision.status !== 'DRAFT') return;

    setRowSaving(true);
    setFeedback(null);
    try {
      await updateSizeGuideRow(activeRevision.id, editingRow.id, {
        expectedVersion: activeRevision.version,
        displayLabel: editingRow.displayLabel.trim(),
        sizeDefinitionId: editingRow.sizeDefinitionId || null,
      });
      setEditingRow(null);
      setFeedback({ message: 'Size row updated.', tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({
        message: errorMessage(err, 'Failed to update size row.'),
        tone: 'destructive',
      });
      await load();
    } finally {
      setRowSaving(false);
    }
  }

  async function deleteRow(row: SizeGuideRowDto) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    if (!window.confirm(`Delete size row "${row.displayLabel}" and all measurements in this row?`))
      return;

    await mutate(
      () => deleteSizeGuideRow(activeRevision.id, row.id, activeRevision.version),
      `Size row "${row.displayLabel}" removed.`,
    );
  }

  async function moveRow(rowId: string, direction: -1 | 1) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const currentIndex = sortedRows.findIndex((r) => r.id === rowId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedRows.length) return;

    const nextRows = [...sortedRows];
    const [row] = nextRows.splice(currentIndex, 1);
    nextRows.splice(targetIndex, 0, row!);

    await mutate(
      () =>
        reorderSizeGuideRows(activeRevision.id, {
          expectedVersion: activeRevision.version,
          rows: nextRows.map((candidate, position) => ({ rowId: candidate.id, position })),
        }),
      'Row sequence updated.',
    );
  }

  function openCellEditor(row: SizeGuideRowDto, m: MeasurementDefinitionDto) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const existing = row.measurements.find((v) => v.measurementDefinitionId === m.id);

    setEditingCell({
      rowId: row.id,
      rowLabel: row.displayLabel,
      measurementId: m.id,
      measurementName: m.name,
      exact: existing?.exact ?? '',
      min: existing?.min ?? '',
      max: existing?.max ?? '',
      unit: existing?.unit ?? m.defaultUnit,
      isApproximate: existing?.approximate ?? false,
      hasExistingValue: Boolean(existing),
    });
    setCellError('');
  }

  async function saveCell(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingCell || !activeRevision || activeRevision.status !== 'DRAFT') return;

    const exact = editingCell.exact.trim();
    const min = editingCell.min.trim();
    const max = editingCell.max.trim();
    if (exact && (min || max)) {
      setCellError('Use either an exact value or a min/max range, not both.');
      return;
    }
    if (!exact && (!min || !max)) {
      setCellError('Enter an exact value or both range values.');
      return;
    }

    setCellSaving(true);
    setCellError('');
    try {
      await setRowMeasurement(
        activeRevision.id,
        editingCell.rowId,
        editingCell.measurementId,
        exact
          ? {
              expectedVersion: activeRevision.version,
              unitCode: editingCell.unit,
              exact,
              isApproximate: editingCell.isApproximate,
            }
          : {
              expectedVersion: activeRevision.version,
              unitCode: editingCell.unit,
              min,
              max,
              isApproximate: editingCell.isApproximate,
            },
      );
      setEditingCell(null);
      setFeedback({ message: 'Measurement updated.', tone: 'success' });
      await load();
    } catch (err) {
      setCellError(errorMessage(err, 'Could not save measurement.'));
      await load();
    } finally {
      setCellSaving(false);
    }
  }

  async function clearCell() {
    if (!editingCell || !activeRevision || !editingCell.hasExistingValue) return;
    setCellSaving(true);
    setCellError('');
    try {
      await deleteRowMeasurement(
        activeRevision.id,
        editingCell.rowId,
        editingCell.measurementId,
        activeRevision.version,
      );
      setEditingCell(null);
      setFeedback({ message: 'Measurement cleared.', tone: 'success' });
      await load();
    } catch (err) {
      setCellError(errorMessage(err, 'Could not clear measurement.'));
      await load();
    } finally {
      setCellSaving(false);
    }
  }

  async function saveInlineCell(
    row: SizeGuideRowDto,
    measurement: MeasurementDefinitionDto,
    rawValue: string,
  ) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const key = `${row.id}:${measurement.id}`;
    const normalized = rawValue.trim();
    const approximate = normalized.startsWith('~');
    const parsed = normalized ? parseMeasurementCell(normalized.replace(/^~\s*/, '')) : null;
    if (normalized && !parsed) {
      throw new Error('Use a number, a min-max range, or prefix either with ~.');
    }

    setInlineSavingKey(key);
    setFeedback(null);
    try {
      const existing = row.measurements.find(
        (value) => value.measurementDefinitionId === measurement.id,
      );
      if (!parsed) {
        if (existing) {
          await deleteRowMeasurement(
            activeRevision.id,
            row.id,
            measurement.id,
            activeRevision.version,
          );
        }
      } else {
        const unitCode = existing?.unit ?? measurement.defaultUnit;
        await setRowMeasurement(
          activeRevision.id,
          row.id,
          measurement.id,
          'exact' in parsed
            ? {
                expectedVersion: activeRevision.version,
                unitCode,
                exact: parsed.exact,
                isApproximate: approximate,
              }
            : {
                expectedVersion: activeRevision.version,
                unitCode,
                min: parsed.min,
                max: parsed.max,
                isApproximate: approximate,
              },
        );
      }
      setFeedback({ message: 'Working changes saved.', tone: 'success' });
      await load();
    } catch (caught) {
      await load();
      throw caught;
    } finally {
      setInlineSavingKey(null);
    }
  }

  async function pasteMeasurementTable(startRow: number, startColumn: number, rawValue: string) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const pastedRows = rawValue
      .replace(/\r/g, '')
      .split('\n')
      .filter((row, index, rows) => row.length > 0 || index < rows.length - 1)
      .map((row) => row.split('\t'));
    if (pastedRows.length === 0) return;

    const changes: SizeGuideMatrixChangeDto[] = [];
    for (let rowOffset = 0; rowOffset < pastedRows.length; rowOffset += 1) {
      const targetRow = sortedRows[startRow + rowOffset];
      if (!targetRow) throw new Error('The pasted table has more rows than this guide.');
      const pastedCells = pastedRows[rowOffset]!;
      for (let columnOffset = 0; columnOffset < pastedCells.length; columnOffset += 1) {
        const measurement = measurements[startColumn + columnOffset];
        if (!measurement) throw new Error('The pasted table has more columns than this guide.');
        const normalized = pastedCells[columnOffset]!.trim();
        const approximate = normalized.startsWith('~');
        const parsed = normalized ? parseMeasurementCell(normalized.replace(/^~\s*/, '')) : null;
        const existing = targetRow.measurements.find(
          (value) => value.measurementDefinitionId === measurement.id,
        );
        if (normalized && !parsed) {
          throw new Error(`“${normalized}” is not a number, range, or approximate value.`);
        }
        if (!parsed) {
          if (existing) {
            changes.push({
              operation: 'CLEAR',
              rowId: targetRow.id,
              measurementDefinitionId: measurement.id,
            });
          }
          continue;
        }
        changes.push(
          'exact' in parsed
            ? {
                operation: 'SET',
                rowId: targetRow.id,
                measurementDefinitionId: measurement.id,
                unitCode: existing?.unit ?? measurement.defaultUnit,
                exact: parsed.exact,
                isApproximate: approximate,
              }
            : {
                operation: 'SET',
                rowId: targetRow.id,
                measurementDefinitionId: measurement.id,
                unitCode: existing?.unit ?? measurement.defaultUnit,
                min: parsed.min,
                max: parsed.max,
                isApproximate: approximate,
              },
        );
      }
    }
    if (changes.length === 0) return;

    setInlineSavingKey('matrix-paste');
    setFeedback(null);
    try {
      await updateSizeGuideMatrix(activeRevision.id, {
        expectedVersion: activeRevision.version,
        changes,
      });
      setFeedback({
        message: `${changes.length} pasted measurement ${changes.length === 1 ? 'cell' : 'cells'} saved.`,
        tone: 'success',
      });
      await load();
    } catch (caught) {
      await load();
      throw caught;
    } finally {
      setInlineSavingKey(null);
    }
  }

  async function duplicateGuide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guide || !duplicateName.trim()) return;
    setDuplicateBusy(true);
    try {
      const duplicated = await duplicateSizeGuide(guide.id, duplicateName.trim());
      setShowDuplicateModal(false);
      router.push(`/sizing/guides/${duplicated.id}`);
    } catch (err) {
      setFeedback({
        message: errorMessage(err, 'Could not duplicate guide.'),
        tone: 'destructive',
      });
    } finally {
      setDuplicateBusy(false);
    }
  }

  function exportCsv() {
    if (!guide || !activeRevision) return;
    const header = ['Size', ...measurements.map((m) => m.code)];
    const lines = [header.map(csvEscape).join(',')];

    for (const row of sortedRows) {
      const values = [row.displayLabel];
      for (const m of measurements) {
        const val = row.measurements.find((c) => c.measurementDefinitionId === m.id);
        values.push(val?.exact ?? (val?.min && val.max ? `${val.min}-${val.max}` : ''));
      }
      lines.push(values.map(csvEscape).join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${guide.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-r${activeRevision.revisionNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importCsv(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guide || !activeRevision || activeRevision.status !== 'DRAFT' || !importCsvText.trim())
      return;
    setImportBusy(true);
    setImportError('');

    try {
      const lines = importCsvText.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw new Error('CSV must contain a header and at least one data row.');

      const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
      if (headers.length < 2)
        throw new Error('CSV needs a Size column plus at least one measurement column.');

      const measurementColumns = new Map<number, MeasurementDefinitionDto>();
      headers.slice(1).forEach((header, idx) => {
        const match = measurements.find(
          (m) => m.code.toLowerCase() === header || m.name.toLowerCase() === header,
        );
        if (match) measurementColumns.set(idx + 1, match);
      });
      if (measurementColumns.size === 0) {
        throw new Error(
          `No CSV headers matched active measurement columns (${measurements.map((m) => m.code).join(', ')}).`,
        );
      }

      let workingVersion = activeRevision.version;
      const rowMap = new Map(sortedRows.map((r) => [r.displayLabel.toLowerCase(), r.id]));
      const changes: Array<
        | {
            operation: 'SET';
            rowId: string;
            measurementDefinitionId: string;
            unitCode: SizingMeasurementUnitDto;
            exact: string;
          }
        | {
            operation: 'SET';
            rowId: string;
            measurementDefinitionId: string;
            unitCode: SizingMeasurementUnitDto;
            min: string;
            max: string;
          }
      > = [];
      let nextPos = sortedRows.length;

      for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line);
        const label = (cells[0] ?? '').trim();
        if (!label) continue;

        let rowId = rowMap.get(label.toLowerCase());
        if (!rowId) {
          const matchDef = guide.sizeSystemId
            ? sizeDefinitions.find(
                (d) =>
                  d.label.toLowerCase() === label.toLowerCase() ||
                  d.code.toLowerCase() === label.toLowerCase(),
              )
            : undefined;

          const created = await createSizeGuideRow(activeRevision.id, {
            expectedVersion: workingVersion,
            displayLabel: label,
            position: nextPos,
            ...(matchDef ? { sizeDefinitionId: matchDef.id } : {}),
          });
          rowId = created.id;
          rowMap.set(label.toLowerCase(), rowId);
          nextPos += 1;
          workingVersion += 1;
        }

        for (const [colIdx, m] of measurementColumns.entries()) {
          const parsed = parseMeasurementCell(cells[colIdx] ?? '');
          if (!parsed) continue;
          if ('exact' in parsed) {
            changes.push({
              operation: 'SET',
              rowId,
              measurementDefinitionId: m.id,
              unitCode: m.defaultUnit,
              exact: parsed.exact,
            });
          } else {
            changes.push({
              operation: 'SET',
              rowId,
              measurementDefinitionId: m.id,
              unitCode: m.defaultUnit,
              min: parsed.min,
              max: parsed.max,
            });
          }
        }
      }

      if (changes.length > 0) {
        await updateSizeGuideMatrix(activeRevision.id, {
          expectedVersion: workingVersion,
          changes,
        });
      }

      setShowImportModal(false);
      setImportCsvText('');
      setFeedback({
        message: `CSV import completed with ${changes.length} measurement updates.`,
        tone: 'success',
      });
      await load();
    } catch (err) {
      setImportError(errorMessage(err, 'CSV import failed.'));
      await load();
    } finally {
      setImportBusy(false);
    }
  }

  if (loading && !guide) {
    return <LoadingState message="Loading fit and size guide…" />;
  }

  if (!guide) {
    return (
      <AdminPage>
        <ErrorState
          title="Could not load size guide"
          message={feedback?.message ?? 'The requested measurement guide was not found.'}
          onRetry={() => void load()}
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      {/* Guide header */}
      <div>
        <Link
          href="/sizing/guides"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Size Guides</span>
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 border-b border-border pb-5">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
                {guide.name}
              </h1>
              <StatusBadge status={guide.status} />
              {guide.currentPublishedRevisionId ? (
                <Badge
                  variant="secondary"
                  className="bg-success-subtle text-success text-xs font-semibold"
                >
                  Published Baseline Active
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-warning-subtle text-warning text-xs font-semibold"
                >
                  Draft Only
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-normal">
                {guide.sizingDomainName}
              </Badge>
              <span>·</span>
              <span className="font-mono">{guide.sizeSystemName ?? 'Unbound Custom Chart'}</span>
              <span>·</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLinkedDrawer(true)}
                className="h-6 px-1.5 text-xs text-primary hover:bg-primary/10"
              >
                <span>
                  {guide.products.length} products · {guide.categories.length} categories
                </span>
                <ExternalLink className="size-3 ml-1" />
              </Button>
            </div>

            {guide.description ? (
              <p className="text-xs text-muted-foreground max-w-3xl pt-1">{guide.description}</p>
            ) : null}
          </div>

          {/* Action Strip */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={!customerPreview || customerPreview.rows.length === 0}
              onClick={() => setShowCustomerPreview(true)}
              className="min-h-10 gap-1.5 text-xs sm:min-h-9"
            >
              <Eye className="size-3.5" />
              <span>Customer preview</span>
            </Button>
            {activeRevision?.status === 'DRAFT' && guide.status === 'ACTIVE' ? (
              <Button
                size="sm"
                disabled={busy || activeRevision.rows.length === 0}
                onClick={() => void reviewPublication()}
                className="min-h-10 sm:min-h-9 touch-manipulation bg-success text-success-foreground hover:bg-success/90 font-semibold gap-1.5 shadow-xs"
              >
                <Send className="size-4" />
                <span>Review &amp; publish</span>
              </Button>
            ) : activeRevision?.status === 'PUBLISHED' &&
              guide.status === 'ACTIVE' &&
              !draftRevision ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void createDraft()}
                className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5 shadow-xs"
              >
                <Plus className="size-4" />
                <span>Start New Working Draft</span>
              </Button>
            ) : null}

            {guide.status === 'ACTIVE' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditingGuide({
                    name: guide.name,
                    description: guide.description ?? '',
                    sizeSystemId: guide.sizeSystemId ?? '',
                  })
                }
                className="min-h-10 sm:min-h-9 touch-manipulation text-xs gap-1"
              >
                <Pencil className="size-3.5" />
                <span>Edit Info</span>
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDuplicateName(`${guide.name} (Copy)`);
                setShowDuplicateModal(true);
              }}
              className="min-h-10 sm:min-h-9 touch-manipulation text-xs gap-1"
            >
              <Copy className="size-3.5" />
              <span>Duplicate</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void toggleGuideLifecycle()}
              className={`min-h-10 sm:min-h-9 touch-manipulation text-xs gap-1 ${
                guide.status === 'ACTIVE'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-success hover:bg-success/10'
              }`}
            >
              {guide.status === 'ACTIVE' ? (
                <Archive className="size-3.5" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              <span>{guide.status === 'ACTIVE' ? 'Archive' : 'Restore'}</span>
            </Button>
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm animate-in fade-in duration-150 ${
            feedback.tone === 'success'
              ? 'border-success/30 bg-success-subtle text-success'
              : 'border-destructive/30 bg-destructive-subtle text-destructive'
          }`}
        >
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {/* Revision Segmented Bar (Replaces Nested Aside) */}
      <PagePanel className="p-3 border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">Guide history:</span>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {guide.revisions.map((rev) => {
              const selected = activeRevision?.id === rev.id;
              return (
                <Button
                  key={rev.id}
                  variant={selected ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveRevisionId(rev.id)}
                  className={`h-8 text-xs font-mono touch-manipulation gap-1.5 ${
                    selected ? 'shadow-xs font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  <span>
                    {rev.status === 'DRAFT' ? 'Working changes' : 'Published'} ·{' '}
                    {rev.revisionNumber}
                  </span>
                  <StatusBadge status={rev.status} />
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono tabular-nums">
          <span>Version: {activeRevision?.version}</span>
          <span>·</span>
          <span>{sortedRows.length} size rows</span>
        </div>
      </PagePanel>

      {activeRevision ? (
        <div className="space-y-6">
          {/* Fit Notes & Customer Guidance Panel */}
          <PagePanel className="p-4 sm:p-5 border-border space-y-3">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Customer Fit Notes & Measuring Tips
                </h3>
                <p className="text-xs text-muted-foreground">
                  Instructions displayed in the storefront size guide drawer when customers inspect
                  this chart.
                </p>
              </div>
              {activeRevision.status === 'DRAFT' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground" role="status">
                    {metaSaving
                      ? 'Saving…'
                      : metaDirty
                        ? 'Saving shortly…'
                        : 'Working changes saved'}
                  </span>
                  {metaDirty ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={metaSaving}
                      onClick={() => void saveRevisionMeta()}
                      className="h-8 gap-1 text-xs"
                    >
                      {metaSaving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      <span>Save now</span>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-foreground">
                Fit Notes (e.g. Relaxed Fit, Regular Fit, Slim Fit)
                {activeRevision.status === 'DRAFT' ? (
                  <textarea
                    rows={2}
                    value={metaFitNotes}
                    onChange={(e) => {
                      setMetaFitNotes(e.target.value);
                      setMetaDirty(true);
                    }}
                    placeholder="e.g. True to size. If between sizes, recommend sizing up."
                    className="mt-1 w-full rounded-md border border-input bg-card p-2 text-xs outline-none focus:border-ring"
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground italic bg-muted/20 p-2.5 rounded-md">
                    {activeRevision.fitNotes || 'No fit notes specified.'}
                  </p>
                )}
              </label>

              <label className="block text-xs font-medium text-foreground">
                Measuring Instructions
                {activeRevision.status === 'DRAFT' ? (
                  <textarea
                    rows={2}
                    value={metaInstructions}
                    onChange={(e) => {
                      setMetaInstructions(e.target.value);
                      setMetaDirty(true);
                    }}
                    placeholder="e.g. Measure around the fullest part of your chest, keeping tape horizontal."
                    className="mt-1 w-full rounded-md border border-input bg-card p-2 text-xs outline-none focus:border-ring"
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground italic bg-muted/20 p-2.5 rounded-md">
                    {activeRevision.instructions || 'No measuring instructions specified.'}
                  </p>
                )}
              </label>
            </div>
          </PagePanel>

          {/* The Measurement Matrix Section */}
          <PageSection
            title="Measurement Matrix"
            description="Rows are the customer-facing size or fit choices. Add only the measurement columns this guide genuinely needs."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={measurements.length === 0 || sortedRows.length === 0}
                  className="h-8 text-xs gap-1"
                >
                  <Download className="size-3.5" />
                  <span>Export CSV</span>
                </Button>
                {activeRevision.status === 'DRAFT' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportCsvText('');
                      setImportError('');
                      setShowImportModal(true);
                    }}
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
            {activeRevision.status === 'DRAFT' ? (
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
                    onClick={() => void addColumn()}
                  >
                    <Plus className="size-4" /> Add Column
                  </Button>
                </div>
                <form onSubmit={addRow} className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
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
                            <th className="sticky left-0 z-10 bg-muted/90 backdrop-blur-xs px-4 py-3 min-w-44 border-r border-border">
                              Size Row
                            </th>
                            {measurements.map((m) => {
                              const column = activeRevision.columns.find(
                                (candidate) => candidate.measurementDefinitionId === m.id,
                              );
                              return (
                                <th key={m.id} className="px-4 py-3 whitespace-nowrap">
                                  {activeRevision.status === 'DRAFT' && column ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        aria-label={`Column label for ${m.name}`}
                                        defaultValue={column.displayName}
                                        className="h-7 min-w-28 text-xs font-semibold"
                                        onBlur={(event) =>
                                          void renameColumn(column.id, event.target.value)
                                        }
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Remove ${m.name} column`}
                                        onClick={() =>
                                          void removeColumn(column.id, column.displayName)
                                        }
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
                            {activeRevision.status === 'DRAFT' ? (
                              <th className="px-4 py-3 text-right">Row Actions</th>
                            ) : null}
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
                                    {activeRevision.status === 'DRAFT' ? (
                                      <div className="flex items-center gap-0.5">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={rowIdx === 0 || busy}
                                          onClick={() => void moveRow(row.id, -1)}
                                          className="size-6 p-0 text-muted-foreground"
                                          title="Move up"
                                        >
                                          <ArrowUp className="size-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={rowIdx === sortedRows.length - 1 || busy}
                                          onClick={() => void moveRow(row.id, 1)}
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
                                        activeRevision.status === 'DRAFT'
                                          ? 'hover:bg-primary/5'
                                          : 'px-4 py-3'
                                      }`}
                                    >
                                      {activeRevision.status === 'DRAFT' ? (
                                        <InlineMeasurementCell
                                          rowIndex={rowIdx}
                                          columnIndex={columnIndex}
                                          value={formatMeasurementCell(cell)}
                                          unit={cell?.unit ?? m.defaultUnit}
                                          saving={inlineSavingKey === `${row.id}:${m.id}`}
                                          onSave={(value) => saveInlineCell(row, m, value)}
                                          onPasteTable={(value) =>
                                            pasteMeasurementTable(rowIdx, columnIndex, value)
                                          }
                                          onOpenAdvanced={() => openCellEditor(row, m)}
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

                                {activeRevision.status === 'DRAFT' ? (
                                  <td className="px-4 py-3 text-right">
                                    <div className="inline-flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          setEditingRow({
                                            id: row.id,
                                            displayLabel: row.displayLabel,
                                            sizeDefinitionId: row.sizeDefinitionId ?? '',
                                          })
                                        }
                                        className="size-7 p-0 text-muted-foreground"
                                        title="Edit label"
                                      >
                                        <Edit2 className="size-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => void deleteRow(row)}
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

                          {activeRevision.status === 'DRAFT' ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={rowIdx === 0 || busy}
                                onClick={() => void moveRow(row.id, -1)}
                                className="size-9 p-0"
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={rowIdx === sortedRows.length - 1 || busy}
                                onClick={() => void moveRow(row.id, 1)}
                                className="size-9 p-0"
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void deleteRow(row)}
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
                            const cell = row.measurements.find(
                              (v) => v.measurementDefinitionId === m.id,
                            );
                            return (
                              <button
                                key={m.id}
                                type="button"
                                disabled={activeRevision.status !== 'DRAFT'}
                                onClick={() => openCellEditor(row, m)}
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
        </div>
      ) : null}

      {/* MODAL / DRAWER: CELL MEASUREMENT EDITOR */}
      <Dialog open={showCustomerPreview} onOpenChange={setShowCustomerPreview}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Customer preview</DialogTitle>
            <DialogDescription>
              This uses the same guide data contract as the Storefront. Product-specific size
              selection is intentionally disabled here.
            </DialogDescription>
          </DialogHeader>
          {customerPreview ? <CustomerGuidePreview guide={customerPreview} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCell)} onOpenChange={(open) => !open && setEditingCell(null)}>
        <DialogContent className="h-dvh max-w-none overflow-y-auto rounded-none sm:h-auto sm:max-w-sm sm:rounded-lg">
          <DialogHeader>
            <DialogTitle>{editingCell?.measurementName}</DialogTitle>
            <DialogDescription className="text-xs">
              Size &quot;{editingCell?.rowLabel}&quot; · Revision {activeRevision?.revisionNumber}
            </DialogDescription>
          </DialogHeader>

          {editingCell ? (
            <form onSubmit={saveCell} className="space-y-4 pt-2">
              {cellError ? (
                <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                  {cellError}
                </div>
              ) : null}

              <label className="block text-xs font-medium text-foreground">
                Exact Numeric Value
                <Input
                  value={editingCell.exact}
                  onChange={(e) =>
                    setEditingCell((cur) => (cur ? { ...cur, exact: e.target.value } : null))
                  }
                  placeholder="e.g. 40 or 40.5"
                  className="mt-1 h-9 font-mono text-xs tabular-nums"
                />
              </label>

              <div className="flex items-center gap-2 text-[10px] uppercase font-mono text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>or Range (Min–Max)</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-foreground">
                  Min Value
                  <Input
                    value={editingCell.min}
                    onChange={(e) =>
                      setEditingCell((cur) => (cur ? { ...cur, min: e.target.value } : null))
                    }
                    placeholder="e.g. 38"
                    className="mt-1 h-9 font-mono text-xs tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-foreground">
                  Max Value
                  <Input
                    value={editingCell.max}
                    onChange={(e) =>
                      setEditingCell((cur) => (cur ? { ...cur, max: e.target.value } : null))
                    }
                    placeholder="e.g. 40"
                    className="mt-1 h-9 font-mono text-xs tabular-nums"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 items-center">
                <label className="block text-xs font-medium text-foreground">
                  Unit
                  <NativeSelect
                    value={editingCell.unit}
                    onChange={(e) =>
                      setEditingCell((cur) =>
                        cur ? { ...cur, unit: e.target.value as SizingMeasurementUnitDto } : null,
                      )
                    }
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    <option value="inch">inch</option>
                    <option value="cm">cm</option>
                    <option value="kg">kg</option>
                  </NativeSelect>
                </label>

                <label className="flex items-center gap-2 pt-5 text-xs text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingCell.isApproximate}
                    onChange={(e) =>
                      setEditingCell((cur) =>
                        cur ? { ...cur, isApproximate: e.target.checked } : null,
                      )
                    }
                    className="rounded border-border text-primary focus:ring-primary size-4"
                  />
                  <span>Approximate (~)</span>
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                {editingCell.hasExistingValue ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={cellSaving}
                    onClick={() => void clearCell()}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1 px-2"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Clear</span>
                  </Button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingCell(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={cellSaving}>
                    {cellSaving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    <span>Save Cell</span>
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(publishPreview)}
        onOpenChange={(open) => !open && setPublishPreview(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review customer impact</DialogTitle>
            <DialogDescription>
              Customers keep seeing the current published guide until you complete this action. This
              review becomes stale if the guide or its assignments change.
            </DialogDescription>
          </DialogHeader>
          {publishPreview ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Publication</p>
                <p className="mt-1 font-semibold text-foreground">
                  {publishPreview.publishedRevisionNumber === null
                    ? 'First customer-visible version'
                    : `Published version ${publishPreview.publishedRevisionNumber}`}
                  <span className="mx-2 text-muted-foreground">→</span>
                  Working version {publishPreview.workingRevision.revisionNumber}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Products', publishPreview.affectedProducts],
                  ['Categories', publishPreview.affectedCategories],
                  ['Added rows', publishPreview.changes.addedRows],
                  ['Removed rows', publishPreview.changes.removedRows],
                  ['Changed rows', publishPreview.changes.changedRows],
                  ['Size conflicts', publishPreview.reconciliationConflicts],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-border p-3">
                    <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {publishPreview.changes.guidanceChanged ? (
                <p className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info">
                  Customer fit notes or measuring instructions will also change.
                </p>
              ) : null}
              {publishPreview.reconciliationConflicts > 0 ? (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  {publishPreview.reconciliationConflicts} purchasable Product size
                  {publishPreview.reconciliationConflicts === 1 ? '' : 's'} will not have a matching
                  guide row. Publishing is allowed, and those Products will appear in Needs
                  Attention.
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setPublishPreview(null)}>
                  Keep working
                </Button>
                <Button disabled={busy} onClick={() => void publishRevision()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Publish to customers
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* MODAL: EDIT ROW DISPLAY LABEL & DEFINITION */}
      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Size Row</DialogTitle>
          </DialogHeader>
          {editingRow ? (
            <form onSubmit={saveRowEdit} className="space-y-4 pt-2">
              <label className="block text-xs font-medium text-foreground">
                Display Label
                <Input
                  value={editingRow.displayLabel}
                  onChange={(e) => setEditingRow({ ...editingRow, displayLabel: e.target.value })}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>

              {guide.sizeSystemId ? (
                <label className="block text-xs font-medium text-foreground">
                  Canonical Definition Link
                  <NativeSelect
                    value={editingRow.sizeDefinitionId}
                    onChange={(e) =>
                      setEditingRow({ ...editingRow, sizeDefinitionId: e.target.value })
                    }
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    <option value="">Unmapped (Custom)</option>
                    {sizeDefinitions.map((def) => (
                      <option key={def.id} value={def.id}>
                        {def.label} ({def.code})
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingRow(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={rowSaving || !editingRow.displayLabel.trim()}
                >
                  {rowSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <span>Update Row</span>
                  )}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* MODAL: EDIT GUIDE INFO */}
      <Dialog open={Boolean(editingGuide)} onOpenChange={(open) => !open && setEditingGuide(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Size Guide</DialogTitle>
            <DialogDescription className="text-xs">
              Update metadata and canonical size system binding for this chart.
            </DialogDescription>
          </DialogHeader>
          {editingGuide ? (
            <form onSubmit={saveGuideMetadata} className="space-y-4 pt-2">
              <label className="block text-xs font-medium text-foreground">
                Guide Title
                <Input
                  value={editingGuide.name}
                  onChange={(e) => setEditingGuide({ ...editingGuide, name: e.target.value })}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <label className="block text-xs font-medium text-foreground">
                Description
                <textarea
                  rows={2}
                  value={editingGuide.description}
                  onChange={(e) =>
                    setEditingGuide({ ...editingGuide, description: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-input bg-card p-2 text-xs outline-none focus:border-ring"
                />
              </label>

              <label className="block text-xs font-medium text-foreground">
                Canonical Size System
                <NativeSelect
                  value={editingGuide.sizeSystemId}
                  onChange={(e) =>
                    setEditingGuide({ ...editingGuide, sizeSystemId: e.target.value })
                  }
                  className="mt-1 h-9 text-xs bg-card"
                >
                  <option value="">No system binding (Unbound chart)</option>
                  {systems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.regionCode ? `· ${s.regionCode}` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </label>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingGuide(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={guideSaving || !editingGuide.name.trim()}>
                  {guideSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <span>Save Guide</span>
                  )}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* MODAL: DUPLICATE GUIDE */}
      <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate Size Guide</DialogTitle>
            <DialogDescription className="text-xs">
              Creates a copy with a fresh editable draft revision.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={duplicateGuide} className="space-y-4 pt-2">
            <label className="block text-xs font-medium text-foreground">
              New Guide Name
              <Input
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                required
                className="mt-1 h-9 text-xs"
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDuplicateModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={duplicateBusy || !duplicateName.trim()}>
                {duplicateBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span>Duplicate</span>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: CSV IMPORT */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Measurement Matrix from CSV</DialogTitle>
            <DialogDescription className="text-xs">
              First column must be Size. Remaining column headers must match measurement codes:{' '}
              <span className="font-mono">{measurements.map((m) => m.code).join(', ')}</span>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={importCsv} className="space-y-4 pt-2">
            {importError ? (
              <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                {importError}
              </div>
            ) : null}
            <textarea
              rows={10}
              value={importCsvText}
              onChange={(e) => setImportCsvText(e.target.value)}
              required
              placeholder={`Size,${measurements.map((m) => m.code).join(',')}\nS,38,27\nM,40,28\nL,42,29`}
              className="w-full rounded-md border border-input bg-card p-3 font-mono text-xs outline-none focus:border-ring"
            />
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={exportCsv}
                className="text-xs text-primary"
              >
                <Download className="size-3.5 mr-1" />
                <span>Export Template</span>
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={importBusy || !importCsvText.trim()}>
                  {importBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  <span>Import Data</span>
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* DRAWER: LINKED PRODUCTS & CATEGORIES */}
      <Drawer open={showLinkedDrawer} onOpenChange={setShowLinkedDrawer}>
        <DrawerContent className="max-h-[80vh] p-4 sm:p-6">
          <DrawerHeader className="px-0 pb-3">
            <DrawerTitle>Catalog Association</DrawerTitle>
            <DrawerDescription className="text-xs">
              Products and categories currently utilizing &quot;{guide.name}&quot;.
            </DrawerDescription>
          </DrawerHeader>

          <div className="grid sm:grid-cols-2 gap-4 py-3 overflow-y-auto">
            <div>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Direct Products ({guide.products.length})
              </span>
              <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                {guide.products.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No products directly use this chart.
                  </p>
                ) : (
                  guide.products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}`}
                      className="block p-2 rounded-md border border-border bg-card text-xs text-foreground hover:text-primary hover:border-primary/50 transition-colors"
                    >
                      {p.title}
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Category Defaults ({guide.categories.length})
              </span>
              <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                {guide.categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No categories have this as default.
                  </p>
                ) : (
                  guide.categories.map((c) => (
                    <div
                      key={c.id}
                      className="p-2 rounded-md border border-border bg-card text-xs text-foreground"
                    >
                      {c.name}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </AdminPage>
  );
}
