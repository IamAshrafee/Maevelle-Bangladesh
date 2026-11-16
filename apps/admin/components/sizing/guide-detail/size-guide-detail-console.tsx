'use client';

import {
  Archive,
  ArrowLeft,
  Copy,
  Eye,
  ExternalLink,
  History,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

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

import { AdminPage, ErrorState, PagePanel } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Textarea } from '@/components/ui/textarea';
import {
  type CellEditState,
  type Feedback,
  type GuideEditState,
  type RowEditState,
  csvEscape,
  errorMessage,
  parseCsvLine,
  parseMeasurementCell,
} from './guide-detail-utils';
import { GuideMeasurementMatrix } from './guide-measurement-matrix';
import { GuideDetailDialogs } from './guide-detail-dialogs';

export function SizeGuideStudioConsole() {
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

  // Linked items drawer & previews
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
      'Working changes published to Storefront successfully.',
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
    return (
      <AdminPage>
        <div>
          <Link
            href="/sizing/guides"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Size Guides</span>
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 border-b border-border pb-5">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2 border-b border-border pb-2">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <div className="h-72 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        </div>
      </AdminPage>
    );
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
              : feedback.tone === 'warning'
                ? 'border-warning/30 bg-warning-subtle text-warning'
                : 'border-destructive/30 bg-destructive-subtle text-destructive'
          }`}
        >
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {/* Revision Segmented Bar */}
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
                  <Textarea
                    rows={2}
                    value={metaFitNotes}
                    onChange={(e) => {
                      setMetaFitNotes(e.target.value);
                      setMetaDirty(true);
                    }}
                    placeholder="e.g. True to size. If between sizes, recommend sizing up."
                    className="mt-1 text-xs bg-card"
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
                  <Textarea
                    rows={2}
                    value={metaInstructions}
                    onChange={(e) => {
                      setMetaInstructions(e.target.value);
                      setMetaDirty(true);
                    }}
                    placeholder="e.g. Measure around the fullest part of your chest, keeping tape horizontal."
                    className="mt-1 text-xs bg-card"
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground italic bg-muted/20 p-2.5 rounded-md">
                    {activeRevision.instructions || 'No measuring instructions specified.'}
                  </p>
                )}
              </label>
            </div>
          </PagePanel>

          <GuideMeasurementMatrix
            guide={guide}
            activeRevision={activeRevision}
            measurements={measurements}
            availableMeasurements={availableMeasurements}
            unusedMeasurements={unusedMeasurements}
            sortedRows={sortedRows}
            sizeDefinitions={sizeDefinitions}
            newColumnDefinitionId={newColumnDefinitionId}
            setNewColumnDefinitionId={setNewColumnDefinitionId}
            busy={busy}
            inlineSavingKey={inlineSavingKey}
            onExportCsv={exportCsv}
            onOpenImport={() => {
              setImportCsvText('');
              setImportError('');
              setShowImportModal(true);
            }}
            onAddColumn={() => void addColumn()}
            onAddRow={addRow}
            onRenameColumn={(columnId, displayName) => void renameColumn(columnId, displayName)}
            onRemoveColumn={(columnId, displayName) => void removeColumn(columnId, displayName)}
            onMoveRow={(rowId, direction) => void moveRow(rowId, direction)}
            onSaveInlineCell={(row, m, value) => saveInlineCell(row, m, value)}
            onPasteMeasurementTable={(rowIdx, columnIndex, rawValue) =>
              pasteMeasurementTable(rowIdx, columnIndex, rawValue)
            }
            onOpenCellEditor={(row, m) => openCellEditor(row, m)}
            onEditRow={(row) =>
              setEditingRow({
                id: row.id,
                displayLabel: row.displayLabel,
                sizeDefinitionId: row.sizeDefinitionId ?? '',
              })
            }
            onDeleteRow={(row) => void deleteRow(row)}
          />
        </div>
      ) : null}

      <GuideDetailDialogs
        guide={guide}
        activeRevisionNumber={activeRevision?.revisionNumber}
        measurements={measurements}
        sizeDefinitions={sizeDefinitions}
        systems={systems}
        busy={busy}
        showCustomerPreview={showCustomerPreview}
        setShowCustomerPreview={setShowCustomerPreview}
        customerPreview={customerPreview}
        publishPreview={publishPreview}
        setPublishPreview={setPublishPreview}
        onPublishRevision={() => void publishRevision()}
        editingCell={editingCell}
        setEditingCell={setEditingCell}
        cellSaving={cellSaving}
        cellError={cellError}
        onSaveCell={saveCell}
        onClearCell={() => void clearCell()}
        editingRow={editingRow}
        setEditingRow={setEditingRow}
        rowSaving={rowSaving}
        onSaveRowEdit={saveRowEdit}
        editingGuide={editingGuide}
        setEditingGuide={setEditingGuide}
        guideSaving={guideSaving}
        onSaveGuideMetadata={saveGuideMetadata}
        showDuplicateModal={showDuplicateModal}
        setShowDuplicateModal={setShowDuplicateModal}
        duplicateName={duplicateName}
        setDuplicateName={setDuplicateName}
        duplicateBusy={duplicateBusy}
        onDuplicateGuide={duplicateGuide}
        showImportModal={showImportModal}
        setShowImportModal={setShowImportModal}
        importCsvText={importCsvText}
        setImportCsvText={setImportCsvText}
        importBusy={importBusy}
        importError={importError}
        onImportCsv={importCsv}
        onExportCsv={exportCsv}
        showLinkedDrawer={showLinkedDrawer}
        setShowLinkedDrawer={setShowLinkedDrawer}
      />
    </AdminPage>
  );
}
