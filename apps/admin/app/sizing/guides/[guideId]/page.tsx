'use client';

import {
  ArrowLeft,
  Copy,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Edit2,
  X,
  Check,
  Loader2,
  AlertCircle,
  Archive,
  Download,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { OperationalEmptyState } from '../../../../components/operational-worklist';
import { StatusBadge } from '../../../../components/status-badge';

import {
  createSizeGuideRevision,
  createSizeGuideRow,
  deleteSizeGuideRow,
  duplicateSizeGuide,
  fetchSizeGuideDetail,
  fetchSizingWorkspace,
  publishSizeGuideRevision,
  setRowMeasurement,
  updateSizeGuideRevisionMeta,
} from '@/lib/sizing/api';
import type {
  SizeGuideDetailDto,
  MeasurementDefinitionDto,
  SizeGuideRevisionDetailDto,
} from '@maevelle/contracts';

type CellEditModalState = {
  rowId: string;
  rowLabel: string;
  measurementId: string;
  measurementName: string;
  defaultUnit: 'cm' | 'inch';
  exact: string;
  min: string;
  max: string;
  unit: 'cm' | 'inch';
  isApproximate: boolean;
} | null;

export default function SizeGuideEditorPage() {
  const router = useRouter();
  const params = useParams();
  const guideId = String(params?.guideId ?? '');

  const [guide, setGuide] = useState<SizeGuideDetailDto | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementDefinitionDto[]>([]);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Cell modal
  const [editingCell, setEditingCell] = useState<CellEditModalState>(null);
  const [cellSaving, setCellSaving] = useState(false);
  const [cellError, setCellError] = useState('');

  // Duplicate modal
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateBusy, setDuplicateBusy] = useState(false);

  // CSV Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');

  // Meta editor
  const [metaInstructions, setMetaInstructions] = useState('');
  const [metaFitNotes, setMetaFitNotes] = useState('');
  const [metaDirty, setMetaDirty] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);

  const load = useCallback(async () => {
    if (!guideId) return;
    setLoading(true);
    try {
      const [guideData, workspaceData] = await Promise.all([
        fetchSizeGuideDetail(guideId),
        fetchSizingWorkspace(),
      ]);

      setGuide(guideData);
      const relevantMeasurements = (workspaceData.measurementDefinitions ?? []).filter(
        (m) => m.sizingDomainId === guideData.sizingDomainId,
      );
      setMeasurements(relevantMeasurements);

      // Set active revision
      if (guideData.revisions.length > 0) {
        setActiveRevisionId((prev) => {
          if (prev && guideData.revisions.some((r) => r.id === prev)) return prev;
          return guideData.revisions[0]!.id;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load guide');
    } finally {
      setLoading(false);
    }
  }, [guideId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeRevision = useMemo(
    () => guide?.revisions.find((r) => r.id === activeRevisionId) ?? guide?.revisions[0],
    [guide, activeRevisionId],
  );

  // Sync meta state when active revision changes
  useEffect(() => {
    if (activeRevision) {
      setMetaInstructions(activeRevision.instructions ?? '');
      setMetaFitNotes(activeRevision.fitNotes ?? '');
      setMetaDirty(false);
    }
  }, [activeRevision?.id]);

  const publishRevision = async () => {
    if (!activeRevision || !guide) return;
    if (
      !confirm(
        `Are you sure you want to publish Revision ${activeRevision.revisionNumber}? Once published, all measurement data becomes immutable.`,
      )
    )
      return;
    setBusy(true);
    try {
      await publishSizeGuideRevision(guide.id, activeRevision.id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Publish failed.');
    } finally {
      setBusy(false);
    }
  };

  const createDraft = async () => {
    if (!guide) return;
    setBusy(true);
    try {
      await createSizeGuideRevision(guide.id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create revision.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!activeRevision) return;
    setMetaSaving(true);
    try {
      await updateSizeGuideRevisionMeta(activeRevision.id, {
        instructions: metaInstructions.trim() || null,
        fitNotes: metaFitNotes.trim() || null,
      });
      setMetaDirty(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save notes.');
    } finally {
      setMetaSaving(false);
    }
  };

  const handleAddRow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeRevision) return;
    const form = new FormData(e.currentTarget);
    const label = String(form.get('label') ?? '').trim();
    if (!label) return;

    setBusy(true);
    try {
      await createSizeGuideRow(activeRevision.id, {
        displayLabel: label,
        position: activeRevision.rows.length,
      });
      e.currentTarget.reset();
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add row.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRow = async (rowId: string, label: string) => {
    if (!activeRevision) return;
    if (!confirm(`Delete size row "${label}"? This will remove all measurements for this size.`))
      return;
    setBusy(true);
    try {
      await deleteSizeGuideRow(activeRevision.id, rowId);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete row.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenCellEditor = (
    rowId: string,
    rowLabel: string,
    measurement: MeasurementDefinitionDto,
  ) => {
    if (activeRevision?.status !== 'DRAFT') return;
    const row = activeRevision.rows.find((r) => r.id === rowId);
    const existing = row?.measurements.find((m) => m.measurementDefinitionId === measurement.id);

    setEditingCell({
      rowId,
      rowLabel,
      measurementId: measurement.id,
      measurementName: measurement.name,
      defaultUnit: measurement.defaultUnit,
      exact: existing?.exact ?? '',
      min: existing?.min ?? '',
      max: existing?.max ?? '',
      unit: (existing?.unit as 'cm' | 'inch') || measurement.defaultUnit,
      isApproximate: existing?.approximate ?? false,
    });
    setCellError('');
  };

  const handleSaveCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell || !activeRevision) return;
    if (!editingCell.exact && (!editingCell.min || !editingCell.max)) {
      setCellError('Please enter either an exact measurement or both Min & Max values.');
      return;
    }

    setCellSaving(true);
    setCellError('');
    try {
      await setRowMeasurement(
        activeRevision.id,
        editingCell.rowId,
        editingCell.measurementId,
        {
          unitCode: editingCell.unit,
          exact: editingCell.exact.trim() || undefined,
          min: editingCell.min.trim() || undefined,
          max: editingCell.max.trim() || undefined,
          isApproximate: editingCell.isApproximate,
        },
      );
      setEditingCell(null);
      await load();
    } catch (err) {
      setCellError(err instanceof Error ? err.message : 'Could not save measurement.');
    } finally {
      setCellSaving(false);
    }
  };

  const handleDuplicateGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guide || !duplicateName.trim()) return;
    setDuplicateBusy(true);
    try {
      const duplicated = await duplicateSizeGuide(guide.id, duplicateName.trim());
      setShowDuplicateModal(false);
      router.push(`/sizing/guides/${duplicated.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not duplicate guide.');
    } finally {
      setDuplicateBusy(false);
    }
  };

  const handleExportCsv = () => {
    if (!activeRevision || measurements.length === 0) return;
    const header = ['Size', ...measurements.map((m) => m.name)].join(',');
    const rows = activeRevision.rows.map((r) => {
      const rowVals = [r.displayLabel];
      for (const m of measurements) {
        const val = r.measurements.find((meas) => meas.measurementDefinitionId === m.id);
        if (!val) {
          rowVals.push('');
        } else if (val.exact) {
          rowVals.push(val.exact);
        } else if (val.min && val.max) {
          rowVals.push(`${val.min}-${val.max}`);
        } else {
          rowVals.push('');
        }
      }
      return rowVals.join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...rows].join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute(
      'download',
      `${(guide?.name || 'size-guide').toLowerCase().replace(/\s+/g, '-')}-r${activeRevision.revisionNumber}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRevision || !importCsvText.trim()) return;
    setImportBusy(true);
    setImportError('');
    try {
      const lines = importCsvText
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        throw new Error('CSV must contain a header row and at least one size row.');
      }

      const rawHeaders = lines[0]!.split(',').map((h: string) => h.trim().toLowerCase());
      const sizeColIdx = 0;

      const colToMeasurement = new Map<number, MeasurementDefinitionDto>();
      for (let colIdx = 1; colIdx < rawHeaders.length; colIdx++) {
        const headerName = rawHeaders[colIdx]!;
        const match = measurements.find(
          (m) =>
            m.name.toLowerCase() === headerName ||
            m.code.toLowerCase() === headerName ||
            headerName.includes(m.name.toLowerCase()),
        );
        if (match) {
          colToMeasurement.set(colIdx, match);
        }
      }

      if (colToMeasurement.size === 0) {
        throw new Error(
          `No headers matched current measurements (${measurements.map((m) => m.name).join(', ')}).`,
        );
      }

      for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
        const cells = lines[rowIdx]!.split(',').map((c: string) => c.trim());
        const sizeLabel = cells[sizeColIdx];
        if (!sizeLabel) continue;

        let existingRow = activeRevision.rows.find(
          (r) => r.displayLabel.toLowerCase() === sizeLabel.toLowerCase(),
        );

        let rowId = existingRow?.id;
        if (!rowId) {
          try {
            const created = await createSizeGuideRow(activeRevision.id, {
              displayLabel: sizeLabel,
              position: activeRevision.rows.length + rowIdx,
            });
            rowId = created.id;
          } catch {
            continue;
          }
        }

        if (!rowId) continue;

        for (const [colIdx, measurement] of colToMeasurement.entries()) {
          const cellVal = cells[colIdx];
          if (!cellVal) continue;

          let exact: string | undefined;
          let min: string | undefined;
          let max: string | undefined;

          if (cellVal.includes('-')) {
            const parts = cellVal.split('-').map((p: string) => p.trim());
            min = parts[0];
            max = parts[1];
          } else {
            exact = cellVal;
          }

          if (exact || (min && max)) {
            await setRowMeasurement(
              activeRevision.id,
              rowId,
              measurement.id,
              {
                unitCode: measurement.defaultUnit,
                exact,
                min,
                max,
              },
            );
          }
        }
      }

      setShowImportModal(false);
      setImportCsvText('');
      await load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImportBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading size guide editor...
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="p-6">
        <OperationalEmptyState title="Could not load size guide" description={error} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link
          href="/sizing/guides"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Size Guides
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{guide.name}</h1>
              <StatusBadge status={guide.status} />
              {guide.currentPublishedRevisionId ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Published
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Draft only
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Domain: <span className="font-semibold text-slate-700">{guide.sizingDomainName}</span> &middot; Version {guide.version} &middot; {guide.products.length} product{guide.products.length === 1 ? '' : 's'} linked
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDuplicateName(`${guide.name} (Copy)`);
                setShowDuplicateModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate Guide
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Revision Navigation */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Revisions
            </h3>
            <button
              onClick={createDraft}
              disabled={busy || guide.revisions[0]?.status === 'DRAFT'}
              title={
                guide.revisions[0]?.status === 'DRAFT'
                  ? 'A draft revision is already in progress'
                  : 'Start a new draft revision'
              }
              className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> New Draft
            </button>
          </div>
          <div className="space-y-2">
            {guide.revisions.map((rev) => {
              const isSelected = activeRevision?.id === rev.id;
              return (
                <button
                  key={rev.id}
                  onClick={() => setActiveRevisionId(rev.id)}
                  className={`w-full rounded-lg border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-slate-900 bg-white shadow-sm ring-1 ring-slate-900'
                      : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">
                      Revision {rev.revisionNumber}
                    </span>
                    <StatusBadge status={rev.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{rev.rows.length} size{rev.rows.length === 1 ? '' : 's'}</span>
                    <span>{new Date(rev.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-white p-6">
          {activeRevision ? (
            <div className="mx-auto max-w-5xl space-y-6">
              {/* Revision Status & Publish Action */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      Revision {activeRevision.revisionNumber}
                    </h2>
                    <StatusBadge status={activeRevision.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {activeRevision.status === 'PUBLISHED'
                      ? `Published on ${new Date(activeRevision.publishedAt!).toLocaleString()} — Immutable baseline`
                      : 'Draft revision — Changes here will not affect customer storefront until published.'}
                  </p>
                </div>

                {activeRevision.status === 'DRAFT' && (
                  <button
                    onClick={publishRevision}
                    disabled={busy || activeRevision.rows.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> Publish Revision
                  </button>
                )}

                {activeRevision.status === 'PUBLISHED' && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <ShieldCheck className="h-4 w-4" /> Locked &amp; Immutable
                  </div>
                )}
              </div>

              {/* Revision Meta: Instructions & Fit Notes */}
              <div className="rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Fit Notes &amp; Guidance</h3>
                  {activeRevision.status === 'DRAFT' && metaDirty && (
                    <button
                      onClick={handleSaveMeta}
                      disabled={metaSaving}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      {metaSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                      Save Notes
                    </button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      Fit Notes (e.g. Regular fit, True to size)
                    </label>
                    {activeRevision.status === 'DRAFT' ? (
                      <textarea
                        rows={2}
                        value={metaFitNotes}
                        onChange={(e) => {
                          setMetaFitNotes(e.target.value);
                          setMetaDirty(true);
                        }}
                        placeholder="e.g. Relaxed silhouette; if between sizes, size down."
                        className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-xs outline-none focus:border-slate-500"
                      />
                    ) : (
                      <p className="mt-1 text-xs text-slate-600 italic">
                        {activeRevision.fitNotes || 'No fit notes specified.'}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      General Instructions
                    </label>
                    {activeRevision.status === 'DRAFT' ? (
                      <textarea
                        rows={2}
                        value={metaInstructions}
                        onChange={(e) => {
                          setMetaInstructions(e.target.value);
                          setMetaDirty(true);
                        }}
                        placeholder="e.g. Lay garment flat on a smooth surface before measuring."
                        className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-xs outline-none focus:border-slate-500"
                      />
                    ) : (
                      <p className="mt-1 text-xs text-slate-600 italic">
                        {activeRevision.instructions || 'No instructions specified.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Measurement Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Measurement Matrix</h3>
                    <p className="text-xs text-slate-500">
                      {activeRevision.status === 'DRAFT'
                        ? 'Click any cell to edit dimensions (exact value or min-max range).'
                        : 'Published measurement values for this revision.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      disabled={measurements.length === 0 || activeRevision.rows.length === 0}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" /> Export CSV
                    </button>

                    {activeRevision.status === 'DRAFT' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setImportCsvText('');
                            setImportError('');
                            setShowImportModal(true);
                          }}
                          disabled={measurements.length === 0}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                        >
                          <Upload className="h-3.5 w-3.5" /> Import CSV
                        </button>
                        <form onSubmit={handleAddRow} className="flex gap-2">
                          <input
                            name="label"
                            placeholder="Size label (e.g. S, M, L)"
                            required
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-600"
                          />
                          <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Size Row
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>

                {measurements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center text-xs text-amber-800">
                    No measurements defined for domain <strong>{guide.sizingDomainName}</strong>.
                    <Link
                      href="/sizing/measurements"
                      className="ml-2 font-semibold underline hover:text-amber-900"
                    >
                      Add measurements in Measurements &rarr;
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr>
                          <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-semibold border-r border-slate-200">
                            Size
                          </th>
                          {measurements.map((m) => (
                            <th key={m.id} className="px-4 py-3 font-semibold whitespace-nowrap">
                              {m.name}{' '}
                              <span className="font-normal text-slate-400">({m.defaultUnit})</span>
                            </th>
                          ))}
                          {activeRevision.status === 'DRAFT' && (
                            <th className="px-4 py-3 font-semibold text-right">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {activeRevision.rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={measurements.length + 2}
                              className="p-8 text-center text-slate-400"
                            >
                              No size rows yet. Use &ldquo;Add Size Row&rdquo; above to create sizes
                              (e.g., S, M, L).
                            </td>
                          </tr>
                        ) : (
                          activeRevision.rows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50/60">
                              <td className="sticky left-0 z-10 bg-white px-4 py-3 font-bold text-slate-900 border-r border-slate-200">
                                {row.displayLabel}
                              </td>

                              {measurements.map((m) => {
                                const val = row.measurements.find(
                                  (meas) => meas.measurementDefinitionId === m.id,
                                );
                                const hasValue =
                                  val && (val.exact || (val.min && val.max));

                                return (
                                  <td
                                    key={m.id}
                                    onClick={() =>
                                      activeRevision.status === 'DRAFT' &&
                                      handleOpenCellEditor(row.id, row.displayLabel, m)
                                    }
                                    className={`px-4 py-3 transition whitespace-nowrap ${
                                      activeRevision.status === 'DRAFT'
                                        ? 'cursor-pointer hover:bg-blue-50'
                                        : ''
                                    }`}
                                  >
                                    {hasValue ? (
                                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                        <span>
                                          {val.exact ?? `${val.min} - ${val.max}`} {val.unit}
                                        </span>
                                        {val.approximate && (
                                          <span className="text-slate-400 text-[10px]">(approx)</span>
                                        )}
                                        {activeRevision.status === 'DRAFT' && (
                                          <Edit2 className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100" />
                                        )}
                                      </div>
                                    ) : activeRevision.status === 'DRAFT' ? (
                                      <span className="inline-flex items-center rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-slate-400 hover:text-slate-600">
                                        + Set
                                      </span>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                );
                              })}

                              {activeRevision.status === 'DRAFT' && (
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRow(row.id, row.displayLabel)}
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    title="Delete row"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-slate-400">
              Select a revision from the left to view details.
            </div>
          )}
        </main>
      </div>

      {/* Cell Editor Modal */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {editingCell.measurementName}
                </h3>
                <p className="text-xs text-slate-500">Size: {editingCell.rowLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCell} className="mt-4 space-y-4 text-xs">
              {cellError && (
                <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-700">
                  {cellError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700">Exact Measurement</label>
                <input
                  type="text"
                  value={editingCell.exact}
                  onChange={(e) =>
                    setEditingCell((prev) => (prev ? { ...prev, exact: e.target.value } : null))
                  }
                  placeholder="e.g. 40 or 40.5"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-600"
                />
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200" />
                <span className="mx-2 shrink-0 text-slate-400 text-[10px] uppercase">
                  Or Range
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700">Min</label>
                  <input
                    type="text"
                    value={editingCell.min}
                    onChange={(e) =>
                      setEditingCell((prev) => (prev ? { ...prev, min: e.target.value } : null))
                    }
                    placeholder="e.g. 38"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700">Max</label>
                  <input
                    type="text"
                    value={editingCell.max}
                    onChange={(e) =>
                      setEditingCell((prev) => (prev ? { ...prev, max: e.target.value } : null))
                    }
                    placeholder="e.g. 42"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700">Unit</label>
                  <select
                    value={editingCell.unit}
                    onChange={(e) =>
                      setEditingCell((prev) =>
                        prev ? { ...prev, unit: e.target.value as 'cm' | 'inch' } : null,
                      )
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="cm">cm</option>
                    <option value="inch">inch</option>
                  </select>
                </div>

                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                    <input
                      type="checkbox"
                      checked={editingCell.isApproximate}
                      onChange={(e) =>
                        setEditingCell((prev) =>
                          prev ? { ...prev, isApproximate: e.target.checked } : null,
                        )
                      }
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Approximate (~)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cellSaving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {cellSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate Guide Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Duplicate Size Guide</h3>
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleDuplicateGuide} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">New Guide Name *</label>
                <input
                  type="text"
                  required
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-600"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                This will create a new size guide duplicating all revisions, rows, and measurements from this guide.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDuplicateModal(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={duplicateBusy || !duplicateName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {duplicateBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Duplicate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Import Measurements from CSV</h3>
                <p className="text-xs text-slate-500">Paste comma-separated rows or export from Excel.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleImportCsv} className="mt-4 space-y-3 text-xs">
              {importError && (
                <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-700">
                  {importError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  CSV Data (Header row required: Size, {measurements.map((m) => m.name).join(', ')})
                </label>
                <textarea
                  rows={8}
                  required
                  value={importCsvText}
                  onChange={(e) => setImportCsvText(e.target.value)}
                  placeholder={`Size,${measurements.map((m) => m.name).join(',')}\nXS,80-84,62-66,88-92\nS,84-88,66-70,92-96\nM,88-92,70-74,96-100`}
                  className="font-mono w-full rounded-md border border-slate-300 p-2.5 text-xs outline-none focus:border-slate-600"
                />
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                >
                  <Download className="h-3 w-3" /> Download template CSV
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importBusy || !importCsvText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white shadow hover:bg-slate-800 disabled:opacity-50"
                  >
                    {importBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Import Rows
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
