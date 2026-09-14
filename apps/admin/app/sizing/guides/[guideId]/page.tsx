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
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type {
  MeasurementDefinitionDto,
  SizeDefinitionDto,
  SizeGuideDetailDto,
  SizeGuideRowDto,
  SizeSystemDto,
} from '@maevelle/contracts';

import {
  archiveSizeGuide,
  createSizeGuideRevision,
  createSizeGuideRow,
  deleteRowMeasurement,
  deleteSizeGuideRow,
  duplicateSizeGuide,
  fetchSizeGuideDetail,
  fetchSizingWorkspace,
  publishSizeGuideRevision,
  reorderSizeGuideRows,
  restoreSizeGuide,
  setRowMeasurement,
  updateSizeGuide,
  updateSizeGuideMatrix,
  updateSizeGuideRevisionMeta,
  updateSizeGuideRow,
} from '@/lib/sizing/api';

import { OperationalEmptyState, OperationalFeedback } from '../../../../components/operational-worklist';
import { StatusBadge } from '../../../../components/status-badge';

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

type CellEditState = {
  rowId: string;
  rowLabel: string;
  measurementId: string;
  measurementName: string;
  exact: string;
  min: string;
  max: string;
  unit: 'cm' | 'inch';
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

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function parseMeasurementCell(value: string):
  | { exact: string }
  | { min: string; max: string }
  | null {
  const normalized = value.trim();
  if (!normalized) return null;

  if (/^\d+(?:\.\d{1,3})?$/.test(normalized)) {
    return { exact: normalized };
  }

  const range = normalized.match(/^(\d+(?:\.\d{1,3})?)\s*[-–]\s*(\d+(?:\.\d{1,3})?)$/);
  if (!range) return null;

  return { min: range[1]!, max: range[2]! };
}

export default function SizeGuideEditorPage() {
  const router = useRouter();
  const params = useParams();
  const guideId = String(params?.guideId ?? '');

  const [guide, setGuide] = useState<SizeGuideDetailDto | null>(null);
  const [measurements, setMeasurements] = useState<readonly MeasurementDefinitionDto[]>([]);
  const [sizeDefinitions, setSizeDefinitions] = useState<readonly SizeDefinitionDto[]>([]);
  const [systems, setSystems] = useState<readonly SizeSystemDto[]>([]);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [editingCell, setEditingCell] = useState<CellEditState>(null);
  const [cellSaving, setCellSaving] = useState(false);
  const [cellError, setCellError] = useState('');

  const [editingRow, setEditingRow] = useState<RowEditState>(null);
  const [rowSaving, setRowSaving] = useState(false);

  const [editingGuide, setEditingGuide] = useState<GuideEditState>(null);
  const [guideSaving, setGuideSaving] = useState(false);

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateBusy, setDuplicateBusy] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');

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
      setMeasurements(
        workspace.measurementDefinitions.filter(
          (measurement) =>
            measurement.sizingDomainId === guideData.sizingDomainId && measurement.status === 'ACTIVE',
        ),
      );
      setSizeDefinitions(
        workspace.sizeDefinitions.filter(
          (definition) =>
            definition.status === 'ACTIVE' &&
            (!guideData.sizeSystemId || definition.sizeSystemId === guideData.sizeSystemId),
        ),
      );
      setSystems(
        workspace.systems.filter(
          (system) =>
            system.sizingDomainId === guideData.sizingDomainId && system.status === 'ACTIVE',
        ),
      );

      if (guideData.revisions.length > 0) {
        setActiveRevisionId((previous) => {
          if (previous && guideData.revisions.some((revision) => revision.id === previous)) return previous;
          const draft = guideData.revisions.find((revision) => revision.status === 'DRAFT');
          return draft?.id ?? guideData.revisions[0]!.id;
        });
      } else {
        setActiveRevisionId(null);
      }
    } catch (error) {
      setGuide(null);
      setFeedback({ message: errorMessage(error, 'Failed to load size guide.'), tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [guideId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRevision = useMemo(
    () => guide?.revisions.find((revision) => revision.id === activeRevisionId) ?? guide?.revisions[0],
    [activeRevisionId, guide],
  );

  const draftRevision = useMemo(
    () => guide?.revisions.find((revision) => revision.status === 'DRAFT') ?? null,
    [guide],
  );

  const sortedRows = useMemo(
    () => [...(activeRevision?.rows ?? [])].sort((a, b) => a.position - b.position),
    [activeRevision],
  );

  useEffect(() => {
    if (!activeRevision) return;
    setMetaInstructions(activeRevision.instructions ?? '');
    setMetaFitNotes(activeRevision.fitNotes ?? '');
    setMetaDirty(false);
  }, [activeRevision?.id, activeRevision?.version]);

  async function mutate(action: () => Promise<void>, success: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ message: success, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'Sizing operation failed.'), tone: 'danger' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function publishRevision() {
    if (!activeRevision || !guide || activeRevision.status !== 'DRAFT') return;
    if (!window.confirm(`Publish Revision ${activeRevision.revisionNumber}? Published revisions are immutable.`)) return;

    await mutate(
      () => publishSizeGuideRevision(guide.id, activeRevision.id, activeRevision.version),
      `Revision ${activeRevision.revisionNumber} published.`,
    );
  }

  async function createDraft() {
    if (!guide || guide.status !== 'ACTIVE' || draftRevision) return;
    await mutate(
      async () => {
        const created = await createSizeGuideRevision(guide.id);
        setActiveRevisionId(created.id);
      },
      'New draft revision created from the current published revision.',
    );
  }

  async function saveGuideMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setFeedback({ message: 'Guide metadata updated.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'Failed to update size guide.'), tone: 'danger' });
      await load();
    } finally {
      setGuideSaving(false);
    }
  }

  async function toggleGuideLifecycle() {
    if (!guide) return;
    const restoring = guide.status === 'ARCHIVED';
    if (!restoring && !window.confirm(`Archive “${guide.name}”? Product and category dependencies must be removed first.`)) return;

    await mutate(
      () => (restoring ? restoreSizeGuide(guide.id) : archiveSizeGuide(guide.id)),
      `Size guide ${restoring ? 'restored' : 'archived'}.`,
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
      setFeedback({ message: 'Revision guidance saved.', tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'Failed to save revision guidance.'), tone: 'danger' });
      await load();
    } finally {
      setMetaSaving(false);
    }
  }

  async function addRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const formElement = event.currentTarget;
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
      setFeedback({ message: `Size row “${displayLabel}” added.`, tone: 'success' });
      await load();
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'Failed to add size row.'), tone: 'danger' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveRowEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'Failed to update size row.'), tone: 'danger' });
      await load();
    } finally {
      setRowSaving(false);
    }
  }

  async function deleteRow(row: SizeGuideRowDto) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    if (!window.confirm(`Delete size row “${row.displayLabel}” and all measurements in that row?`)) return;

    await mutate(
      () => deleteSizeGuideRow(activeRevision.id, row.id, activeRevision.version),
      `Size row “${row.displayLabel}” deleted.`,
    );
  }

  async function moveRow(rowId: string, direction: -1 | 1) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const currentIndex = sortedRows.findIndex((row) => row.id === rowId);
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
      'Size row order updated.',
    );
  }

  function openCellEditor(row: SizeGuideRowDto, measurement: MeasurementDefinitionDto) {
    if (!activeRevision || activeRevision.status !== 'DRAFT') return;
    const existing = row.measurements.find((value) => value.measurementDefinitionId === measurement.id);

    setEditingCell({
      rowId: row.id,
      rowLabel: row.displayLabel,
      measurementId: measurement.id,
      measurementName: measurement.name,
      exact: existing?.exact ?? '',
      min: existing?.min ?? '',
      max: existing?.max ?? '',
      unit: existing?.unit ?? measurement.defaultUnit,
      isApproximate: existing?.approximate ?? false,
      hasExistingValue: Boolean(existing),
    });
    setCellError('');
  }

  async function saveCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } catch (error) {
      setCellError(errorMessage(error, 'Could not save measurement.'));
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
    } catch (error) {
      setCellError(errorMessage(error, 'Could not clear measurement.'));
      await load();
    } finally {
      setCellSaving(false);
    }
  }

  async function duplicateGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guide || !duplicateName.trim()) return;
    setDuplicateBusy(true);
    try {
      const duplicated = await duplicateSizeGuide(guide.id, duplicateName.trim());
      setShowDuplicateModal(false);
      router.push(`/sizing/guides/${duplicated.id}`);
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'Could not duplicate guide.'), tone: 'danger' });
    } finally {
      setDuplicateBusy(false);
    }
  }

  function exportCsv() {
    if (!guide || !activeRevision) return;
    const header = ['Size', ...measurements.map((measurement) => measurement.code)];
    const lines = [header.map(csvEscape).join(',')];

    for (const row of sortedRows) {
      const values = [row.displayLabel];
      for (const measurement of measurements) {
        const value = row.measurements.find((candidate) => candidate.measurementDefinitionId === measurement.id);
        values.push(value?.exact ?? (value?.min && value.max ? `${value.min}-${value.max}` : ''));
      }
      lines.push(values.map(csvEscape).join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${guide.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-r${activeRevision.revisionNumber}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guide || !activeRevision || activeRevision.status !== 'DRAFT' || !importCsvText.trim()) return;
    setImportBusy(true);
    setImportError('');

    try {
      const lines = importCsvText.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error('CSV must contain a header and at least one data row.');

      const headers = parseCsvLine(lines[0]!).map((header) => header.toLowerCase());
      if (headers.length < 2) throw new Error('CSV needs a Size column plus at least one measurement column.');

      const measurementColumns = new Map<number, MeasurementDefinitionDto>();
      headers.slice(1).forEach((header, relativeIndex) => {
        const measurement = measurements.find(
          (candidate) =>
            candidate.code.toLowerCase() === header || candidate.name.toLowerCase() === header,
        );
        if (measurement) measurementColumns.set(relativeIndex + 1, measurement);
      });
      if (measurementColumns.size === 0) {
        throw new Error(`No CSV headers matched active measurements. Use codes such as: ${measurements.map((measurement) => measurement.code).join(', ')}.`);
      }

      let workingVersion = activeRevision.version;
      const rowMap = new Map(sortedRows.map((row) => [row.displayLabel.toLowerCase(), row.id]));
      const changes: Array<
        | { operation: 'SET'; rowId: string; measurementDefinitionId: string; unitCode: 'cm' | 'inch'; exact: string }
        | { operation: 'SET'; rowId: string; measurementDefinitionId: string; unitCode: 'cm' | 'inch'; min: string; max: string }
      > = [];
      let nextPosition = sortedRows.length;

      for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line);
        const label = (cells[0] ?? '').trim();
        if (!label) continue;

        let rowId = rowMap.get(label.toLowerCase());
        if (!rowId) {
          const matchingDefinition = guide.sizeSystemId
            ? sizeDefinitions.find(
                (definition) =>
                  definition.label.toLowerCase() === label.toLowerCase() ||
                  definition.code.toLowerCase() === label.toLowerCase(),
              )
            : undefined;

          const created = await createSizeGuideRow(activeRevision.id, {
            expectedVersion: workingVersion,
            displayLabel: label,
            position: nextPosition,
            ...(matchingDefinition ? { sizeDefinitionId: matchingDefinition.id } : {}),
          });
          rowId = created.id;
          rowMap.set(label.toLowerCase(), rowId);
          nextPosition += 1;
          workingVersion += 1;
        }

        for (const [columnIndex, measurement] of measurementColumns.entries()) {
          const parsed = parseMeasurementCell(cells[columnIndex] ?? '');
          if (!parsed) continue;
          if ('exact' in parsed) {
            changes.push({ operation: 'SET', rowId, measurementDefinitionId: measurement.id, unitCode: measurement.defaultUnit, exact: parsed.exact });
          } else {
            changes.push({ operation: 'SET', rowId, measurementDefinitionId: measurement.id, unitCode: measurement.defaultUnit, min: parsed.min, max: parsed.max });
          }
        }
      }

      if (changes.length > 0) {
        await updateSizeGuideMatrix(activeRevision.id, { expectedVersion: workingVersion, changes });
      }

      setShowImportModal(false);
      setImportCsvText('');
      setFeedback({ message: `CSV import completed with ${changes.length} measurement update${changes.length === 1 ? '' : 's'}.`, tone: 'success' });
      await load();
    } catch (error) {
      setImportError(errorMessage(error, 'CSV import failed.'));
      await load();
    } finally {
      setImportBusy(false);
    }
  }

  if (loading && !guide) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading size guide…</div>;
  }

  if (!guide) {
    return <div className="p-6"><OperationalEmptyState title="Could not load size guide" description={feedback?.message ?? 'The requested guide is unavailable.'} /></div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/sizing/guides" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" /> Back to size guides</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold tracking-tight text-slate-900">{guide.name}</h1><StatusBadge status={guide.status} />{guide.currentPublishedRevisionId ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Published</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Draft only</span>}</div>
            <p className="mt-1 text-xs text-slate-500">{guide.sizingDomainName} · {guide.sizeSystemName ?? 'No system binding'} · guide v{guide.version} · {guide.products.length} product{guide.products.length === 1 ? '' : 's'} · {guide.categories.length} categor{guide.categories.length === 1 ? 'y' : 'ies'}</p>
            {guide.description ? <p className="mt-2 max-w-3xl text-xs text-slate-600">{guide.description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {guide.status === 'ACTIVE' ? <button type="button" onClick={() => setEditingGuide({ name: guide.name, description: guide.description ?? '', sizeSystemId: guide.sizeSystemId ?? '' })} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> Edit guide</button> : null}
            <button type="button" onClick={() => { setDuplicateName(`${guide.name} (Copy)`); setShowDuplicateModal(true); }} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
            <button type="button" disabled={busy} onClick={() => void toggleGuideLifecycle()} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${guide.status === 'ACTIVE' ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{guide.status === 'ACTIVE' ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}{guide.status === 'ACTIVE' ? 'Archive' : 'Restore'}</button>
          </div>
        </div>
      </header>

      {feedback ? <div className="px-6 pt-4"><OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback></div> : null}

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Revisions</h2><button type="button" onClick={() => void createDraft()} disabled={busy || guide.status !== 'ACTIVE' || Boolean(draftRevision)} title={draftRevision ? 'A draft already exists' : 'Create a new draft cloned from the published revision'} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 disabled:opacity-40"><Plus className="h-3 w-3" /> New draft</button></div>
          <div className="space-y-2">
            {guide.revisions.map((revision) => {
              const selected = activeRevision?.id === revision.id;
              return <button key={revision.id} type="button" onClick={() => setActiveRevisionId(revision.id)} className={`w-full rounded-lg border p-3 text-left ${selected ? 'border-slate-900 bg-white ring-1 ring-slate-900' : 'border-slate-200 bg-white/70 hover:bg-white'}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-900">Revision {revision.revisionNumber}</span><StatusBadge status={revision.status} /></div><div className="mt-2 flex items-center justify-between text-[11px] text-slate-500"><span>{revision.rows.length} rows · v{revision.version}</span><span>{new Date(revision.createdAt).toLocaleDateString()}</span></div></button>;
            })}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-white p-6">
          {activeRevision ? (
            <div className="mx-auto max-w-7xl space-y-6">
              <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div><div className="flex items-center gap-2"><h2 className="text-base font-semibold text-slate-900">Revision {activeRevision.revisionNumber}</h2><StatusBadge status={activeRevision.status} /><span className="text-[11px] text-slate-400">version {activeRevision.version}</span></div><p className="mt-1 text-xs text-slate-500">{activeRevision.status === 'DRAFT' ? 'Editable working copy. Changes are isolated until publication.' : activeRevision.status === 'PUBLISHED' ? `Published ${activeRevision.publishedAt ? new Date(activeRevision.publishedAt).toLocaleString() : ''}. This revision is immutable.` : 'Archived historical revision.'}</p></div>
                {activeRevision.status === 'DRAFT' && guide.status === 'ACTIVE' ? <button type="button" onClick={() => void publishRevision()} disabled={busy || activeRevision.rows.length === 0} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"><Send className="h-4 w-4" /> Publish revision</button> : activeRevision.status === 'PUBLISHED' ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Locked baseline</span> : null}
              </section>

              <section className="rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">Fit notes & instructions</h3><p className="text-xs text-slate-500">Revision-specific customer and measuring guidance.</p></div>{activeRevision.status === 'DRAFT' && metaDirty ? <button type="button" onClick={() => void saveRevisionMeta()} disabled={metaSaving} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{metaSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save guidance</button> : null}</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700">Fit notes{activeRevision.status === 'DRAFT' ? <textarea rows={3} value={metaFitNotes} onChange={(event) => { setMetaFitNotes(event.target.value); setMetaDirty(true); }} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs" placeholder="True to size, relaxed fit…" /> : <p className="mt-1 font-normal italic text-slate-500">{activeRevision.fitNotes || 'No fit notes.'}</p>}</label>
                  <label className="text-xs font-medium text-slate-700">General instructions{activeRevision.status === 'DRAFT' ? <textarea rows={3} value={metaInstructions} onChange={(event) => { setMetaInstructions(event.target.value); setMetaDirty(true); }} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs" placeholder="How to measure or interpret the chart…" /> : <p className="mt-1 font-normal italic text-slate-500">{activeRevision.instructions || 'No instructions.'}</p>}</label>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h3 className="text-sm font-semibold text-slate-900">Measurement matrix</h3><p className="text-xs text-slate-500">Rows are sizes; columns are reusable measurement definitions for {guide.sizingDomainName}.</p></div>
                  <div className="flex flex-wrap gap-2"><button type="button" onClick={exportCsv} disabled={measurements.length === 0 || sortedRows.length === 0} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"><Download className="h-3.5 w-3.5" /> Export CSV</button>{activeRevision.status === 'DRAFT' ? <button type="button" onClick={() => { setImportCsvText(''); setImportError(''); setShowImportModal(true); }} disabled={measurements.length === 0} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"><Upload className="h-3.5 w-3.5" /> Import CSV</button> : null}</div>
                </div>

                {activeRevision.status === 'DRAFT' ? (
                  <form onSubmit={addRow} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <label className="text-[11px] font-medium text-slate-600">Display label<input name="displayLabel" required placeholder="S, M, EU 38…" className="mt-1 block w-44 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs" /></label>
                    {guide.sizeSystemId ? <label className="text-[11px] font-medium text-slate-600">Canonical definition<select name="sizeDefinitionId" defaultValue="" className="mt-1 block w-56 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"><option value="">Not mapped yet</option>{sizeDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.label} ({definition.code})</option>)}</select></label> : null}
                    <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add row</button>
                    {guide.sizeSystemId ? <span className="text-[11px] text-slate-500">System-bound guides must map every row before publishing.</span> : <span className="text-[11px] text-slate-500">This guide is unbound; rows cannot use canonical size definitions until a system is assigned.</span>}
                  </form>
                ) : null}

                {measurements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-xs text-amber-800">No active measurements exist for this domain. <Link href="/sizing/measurements" className="font-semibold underline">Create measurements</Link> before completing the matrix.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700"><tr><th className="sticky left-0 z-10 min-w-48 border-r border-slate-200 bg-slate-50 px-3 py-3">Size row</th>{measurements.map((measurement) => <th key={measurement.id} className="whitespace-nowrap px-3 py-3"><div>{measurement.name}</div><div className="font-normal text-slate-400">{measurement.defaultUnit} · {measurement.code}</div></th>)}{activeRevision.status === 'DRAFT' ? <th className="px-3 py-3 text-right">Actions</th> : null}</tr></thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {sortedRows.length === 0 ? <tr><td colSpan={measurements.length + 2} className="p-8 text-center text-slate-400">No size rows yet.</td></tr> : sortedRows.map((row, rowIndex) => (
                          <tr key={row.id} className="group hover:bg-slate-50/50">
                            <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-3"><div className="flex items-center justify-between gap-2"><div><strong className="text-slate-900">{row.displayLabel}</strong><div className="mt-0.5 text-[10px] text-slate-400">{row.sizeDefinitionLabel ?? (row.sizeDefinitionId ? 'Mapped definition' : 'Unmapped')}</div></div>{activeRevision.status === 'DRAFT' ? <div className="flex items-center gap-0.5"><button type="button" disabled={rowIndex === 0 || busy} onClick={() => void moveRow(row.id, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20" title="Move up"><ArrowUp className="h-3 w-3" /></button><button type="button" disabled={rowIndex === sortedRows.length - 1 || busy} onClick={() => void moveRow(row.id, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20" title="Move down"><ArrowDown className="h-3 w-3" /></button></div> : null}</div></td>
                            {measurements.map((measurement) => {
                              const value = row.measurements.find((candidate) => candidate.measurementDefinitionId === measurement.id);
                              return <td key={measurement.id} onClick={() => activeRevision.status === 'DRAFT' && openCellEditor(row, measurement)} className={`whitespace-nowrap px-3 py-3 ${activeRevision.status === 'DRAFT' ? 'cursor-pointer hover:bg-blue-50' : ''}`}>{value ? <span className="font-medium text-slate-800">{value.approximate ? '~' : ''}{value.exact ?? `${value.min}–${value.max}`} {value.unit}</span> : activeRevision.status === 'DRAFT' ? <span className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400">+ Set</span> : <span className="text-slate-300">—</span>}</td>;
                            })}
                            {activeRevision.status === 'DRAFT' ? <td className="px-3 py-3 text-right"><div className="inline-flex gap-1"><button type="button" onClick={() => setEditingRow({ id: row.id, displayLabel: row.displayLabel, sizeDefinitionId: row.sizeDefinitionId ?? '' })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Edit row"><Edit2 className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void deleteRow(row)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Delete row"><Trash2 className="h-3.5 w-3.5" /></button></div></td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">Linked products</h3><p className="mt-1 text-xs text-slate-500">Direct product-level guide assignments.</p><div className="mt-3 space-y-2">{guide.products.length === 0 ? <p className="text-xs text-slate-400">No products directly use this guide.</p> : guide.products.map((product) => <Link key={product.id} href={`/products/${product.id}`} className="block rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">{product.title}</Link>)}</div></div>
                <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900">Category defaults</h3><p className="mt-1 text-xs text-slate-500">Categories that inherit this guide by default.</p><div className="mt-3 space-y-2">{guide.categories.length === 0 ? <p className="text-xs text-slate-400">No category defaults use this guide.</p> : guide.categories.map((category) => <div key={category.id} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">{category.name}</div>)}</div></div>
              </section>
            </div>
          ) : <div className="flex h-64 items-center justify-center text-sm text-slate-400">Select a revision.</div>}
        </main>
      </div>

      {editingCell && activeRevision ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between border-b border-slate-100 pb-3"><div><h3 className="text-sm font-semibold text-slate-900">{editingCell.measurementName}</h3><p className="text-xs text-slate-500">Size {editingCell.rowLabel} · revision v{activeRevision.version}</p></div><button type="button" onClick={() => setEditingCell(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><form onSubmit={saveCell} className="mt-4 space-y-4 text-xs">{cellError ? <div className="rounded-md bg-red-50 p-2.5 text-red-700">{cellError}</div> : null}<label className="block font-semibold text-slate-700">Exact value<input value={editingCell.exact} onChange={(event) => setEditingCell((current) => current ? { ...current, exact: event.target.value } : null)} placeholder="40 or 40.5" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><div className="flex items-center gap-2 text-[10px] uppercase text-slate-400"><span className="h-px flex-1 bg-slate-200" />or range<span className="h-px flex-1 bg-slate-200" /></div><div className="grid grid-cols-2 gap-2"><label className="font-semibold text-slate-700">Min<input value={editingCell.min} onChange={(event) => setEditingCell((current) => current ? { ...current, min: event.target.value } : null)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="font-semibold text-slate-700">Max<input value={editingCell.max} onChange={(event) => setEditingCell((current) => current ? { ...current, max: event.target.value } : null)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label></div><div className="grid grid-cols-2 gap-2"><label className="font-semibold text-slate-700">Unit<select value={editingCell.unit} onChange={(event) => setEditingCell((current) => current ? { ...current, unit: event.target.value as 'cm' | 'inch' } : null)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="cm">cm</option><option value="inch">inch</option></select></label><label className="flex items-end gap-2 pb-2 font-medium text-slate-700"><input type="checkbox" checked={editingCell.isApproximate} onChange={(event) => setEditingCell((current) => current ? { ...current, isApproximate: event.target.checked } : null)} /> Approximate</label></div><div className="flex items-center justify-between border-t border-slate-100 pt-3"><div>{editingCell.hasExistingValue ? <button type="button" disabled={cellSaving} onClick={() => void clearCell()} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"><Trash2 className="h-3 w-3" /> Clear value</button> : null}</div><div className="flex gap-2"><button type="button" onClick={() => setEditingCell(null)} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700">Cancel</button><button type="submit" disabled={cellSaving} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">{cellSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save</button></div></div></form></div></div> : null}

      {editingRow && activeRevision ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><h3 className="text-sm font-semibold text-slate-900">Edit size row</h3><button type="button" onClick={() => setEditingRow(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><form onSubmit={saveRowEdit} className="mt-4 space-y-4 text-xs"><label className="block font-semibold text-slate-700">Display label<input value={editingRow.displayLabel} onChange={(event) => setEditingRow({ ...editingRow, displayLabel: event.target.value })} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>{guide.sizeSystemId ? <label className="block font-semibold text-slate-700">Canonical definition<select value={editingRow.sizeDefinitionId} onChange={(event) => setEditingRow({ ...editingRow, sizeDefinitionId: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Unmapped</option>{sizeDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.label} ({definition.code})</option>)}</select></label> : null}<div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setEditingRow(null)} className="rounded-md border border-slate-300 px-3 py-1.5">Cancel</button><button type="submit" disabled={rowSaving || !editingRow.displayLabel.trim()} className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">{rowSaving ? 'Saving…' : 'Save row'}</button></div></form></div></div> : null}

      {editingGuide ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><div><h3 className="text-sm font-semibold text-slate-900">Edit guide</h3><p className="text-xs text-slate-500">Guide metadata uses optimistic version {guide.version}.</p></div><button type="button" onClick={() => setEditingGuide(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><form onSubmit={saveGuideMetadata} className="mt-4 space-y-4 text-xs"><label className="block font-semibold text-slate-700">Name<input value={editingGuide.name} onChange={(event) => setEditingGuide({ ...editingGuide, name: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" required /></label><label className="block font-semibold text-slate-700">Description<textarea rows={3} value={editingGuide.description} onChange={(event) => setEditingGuide({ ...editingGuide, description: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><label className="block font-semibold text-slate-700">Canonical size system<select value={editingGuide.sizeSystemId} onChange={(event) => setEditingGuide({ ...editingGuide, sizeSystemId: event.target.value })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">No system binding</option>{systems.map((system) => <option key={system.id} value={system.id}>{system.name}{system.regionCode ? ` · ${system.regionCode}` : ''}</option>)}</select><span className="mt-1 block font-normal text-slate-500">Changing a system is rejected if existing row mappings are incompatible.</span></label><div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setEditingGuide(null)} className="rounded-md border border-slate-300 px-3 py-1.5">Cancel</button><button type="submit" disabled={guideSaving || !editingGuide.name.trim()} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">{guideSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save guide</button></div></form></div></div> : null}

      {showDuplicateModal ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 pb-3"><h3 className="text-sm font-semibold text-slate-900">Duplicate size guide</h3><button type="button" onClick={() => setShowDuplicateModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><form onSubmit={duplicateGuide} className="mt-4 space-y-4 text-xs"><label className="block font-semibold text-slate-700">New guide name<input value={duplicateName} onChange={(event) => setDuplicateName(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label><p className="text-slate-500">The duplicate receives a fresh draft copied from the source guide’s current content.</p><div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setShowDuplicateModal(false)} className="rounded-md border border-slate-300 px-3 py-1.5">Cancel</button><button type="submit" disabled={duplicateBusy || !duplicateName.trim()} className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">{duplicateBusy ? 'Duplicating…' : 'Duplicate'}</button></div></form></div></div> : null}

      {showImportModal && activeRevision ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between border-b border-slate-100 pb-3"><div><h3 className="text-sm font-semibold text-slate-900">Import measurement matrix</h3><p className="text-xs text-slate-500">First column is Size. Remaining headers should use measurement codes: {measurements.map((measurement) => measurement.code).join(', ')}.</p></div><button type="button" onClick={() => setShowImportModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><form onSubmit={importCsv} className="mt-4 space-y-3 text-xs">{importError ? <div className="rounded-md bg-red-50 p-2.5 text-red-700">{importError}</div> : null}<textarea rows={12} value={importCsvText} onChange={(event) => setImportCsvText(event.target.value)} required placeholder={`Size,${measurements.map((measurement) => measurement.code).join(',')}\nS,84-88,66-70\nM,88-92,70-74`} className="w-full rounded-md border border-slate-300 p-3 font-mono text-xs" /><div className="rounded-md bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">Missing size rows are created automatically. For system-bound guides, the importer automatically links rows when the CSV Size matches a canonical definition label or code. Matrix values are committed in one bulk transaction after row creation.</div><div className="flex justify-between border-t border-slate-100 pt-3"><button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"><Download className="h-3 w-3" /> Export current template</button><div className="flex gap-2"><button type="button" onClick={() => setShowImportModal(false)} className="rounded-md border border-slate-300 px-3 py-1.5">Cancel</button><button type="submit" disabled={importBusy || !importCsvText.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40">{importBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Import</button></div></div></form></div></div> : null}
    </div>
  );
}
