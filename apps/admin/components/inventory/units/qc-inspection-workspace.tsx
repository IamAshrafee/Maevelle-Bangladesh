'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Printer,
  Loader2,
  RefreshCw,
  UploadCloud,
  FileImage,
  X,
  Sparkles,
} from 'lucide-react';
import type {
  InventoryUnitDto,
  UnitConditionDto,
  InspectionDispositionDto,
  InspectionStageDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  bulkInspectUnits,
  performUnitInspection,
  listInventoryUnits,
} from '@/lib/inventory/units';
import { uploadMediaFile } from '@/lib/media/api';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitBarcodeModal } from './unit-barcode-modal';
import { UnitScannerInput } from './unit-scanner-input';
import { cn } from '@/lib/utils';

export interface QCInspectionWorkspaceProps {
  readonly initialUnits?: readonly InventoryUnitDto[];
  readonly sourceReceiptId?: string;
  readonly variantId?: string;
  readonly stage?: InspectionStageDto;
  readonly onCompleted?: () => void;
}

export function QCInspectionWorkspace({
  initialUnits,
  sourceReceiptId,
  variantId,
  stage = 'INBOUND_INTAKE',
  onCompleted,
}: QCInspectionWorkspaceProps) {
  const [units, setUnits] = useState<readonly InventoryUnitDto[]>(initialUnits || []);
  const [loading, setLoading] = useState(!initialUnits);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);

  // Exception inspection form state
  const [exceptionCondition, setExceptionCondition] = useState<UnitConditionDto>('GRADE_B');
  const [exceptionDefect, setExceptionDefect] = useState('');
  const [exceptionNotes, setExceptionNotes] = useState('');
  const [exceptionDisposition, setExceptionDisposition] =
    useState<InspectionDispositionDto>('RESTRICTED_SALE');
  const [exceptionPhotos, setExceptionPhotos] = useState<{ id: string; name: string }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Operational states
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: 'success' | 'danger' | 'info';
  } | null>(null);

  // Label printing modal
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Refresh units from backend
  const loadUnits = useCallback(async () => {
    if (!sourceReceiptId && !variantId && initialUnits) return;
    setLoading(true);
    try {
      const res = await listInventoryUnits({
        sourceReceiptId: sourceReceiptId || undefined,
        variantId: variantId || undefined,
        pageSize: 100,
      });
      setUnits(res.data);
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to load inspection units.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [initialUnits, sourceReceiptId, variantId]);

  useEffect(() => {
    if (!initialUnits && (sourceReceiptId || variantId)) {
      void loadUnits();
    }
  }, [initialUnits, sourceReceiptId, variantId, loadUnits]);

  // Derived progress statistics
  const stats = useMemo(() => {
    const total = units.length;
    const awaitingQC = units.filter((u) => u.status === 'AWAITING_QC').length;
    const inspected = total - awaitingQC;
    const gradeA = units.filter((u) => u.currentCondition === 'GRADE_A' && u.status !== 'AWAITING_QC').length;
    const gradeB = units.filter((u) => u.currentCondition === 'GRADE_B').length;
    const repairRequired = units.filter(
      (u) => u.currentCondition === 'REPAIR_REQUIRED' || u.status === 'ON_HOLD',
    ).length;
    const damaged = units.filter((u) => u.currentCondition === 'DAMAGED_UNSELLABLE').length;

    return {
      total,
      awaitingQC,
      inspected,
      gradeA,
      gradeB,
      repairRequired,
      damaged,
      isFinished: total > 0 && awaitingQC === 0,
    };
  }, [units]);

  // Set default active unit when units load
  useEffect(() => {
    if (!activeUnitId && units.length > 0) {
      const firstAwaiting = units.find((u) => u.status === 'AWAITING_QC');
      const firstUnit = units[0];
      setActiveUnitId(firstAwaiting ? firstAwaiting.id : (firstUnit ? firstUnit.id : null));
    }
  }, [units, activeUnitId]);

  const activeUnit = useMemo(() => {
    return units.find((u) => u.id === activeUnitId) || null;
  }, [units, activeUnitId]);

  // Select all uninspected units
  const handleSelectAllUninspected = (checked: boolean) => {
    if (checked) {
      const uninspected = units
        .filter((u) => u.status === 'AWAITING_QC')
        .map((u) => u.id);
      setSelectedIds(new Set(uninspected));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 1. QUICK-PASS BATCH WORKFLOW: Pass all selected units as Grade A Flawless
  const handleQuickPassSelected = async () => {
    if (selectedIds.size === 0) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const result = await bulkInspectUnits({
        units: units
          .filter((unit) => selectedIds.has(unit.id))
          .map((unit) => ({ unitId: unit.id, expectedVersion: unit.version })),
        conditionResult: 'GRADE_A',
        disposition: 'RELEASE_SELLABLE',
        notes: 'Bulk passed during physical QC intake.',
      });

      setFeedback({
        message: `Successfully approved ${result.inspectedCount} units as Grade A (Flawless).`,
        tone: 'success',
      });

      setSelectedIds(new Set());
      await loadUnits();

      if (onCompleted && stats.awaitingQC - result.inspectedCount === 0) {
        onCompleted();
      }
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Bulk inspection failed.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 2. EXCEPTION INSPECTION: Submit specific defect for active unit
  const handleSaveActiveException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUnit) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      await performUnitInspection(activeUnit.id, {
        expectedVersion: activeUnit.version,
        inspectionStage: stage,
        conditionResult: exceptionCondition,
        defectDescription: exceptionDefect.trim() || undefined,
        notes: exceptionNotes.trim() || undefined,
        disposition: exceptionDisposition,
        photoAssetIds: exceptionPhotos.map((p) => p.id),
      });

      setFeedback({
        message: `Saved inspection for ${activeUnit.unitCode} (${exceptionCondition.replaceAll('_', ' ')}).`,
        tone: 'success',
      });

      // Clear exception inputs
      setExceptionDefect('');
      setExceptionNotes('');
      setExceptionPhotos([]);

      await loadUnits();

      // Automatically advance to next awaiting unit
      const remainingAwaiting = units.filter(
        (u) => u.status === 'AWAITING_QC' && u.id !== activeUnit.id,
      );
      const nextUnit = remainingAwaiting[0];
      if (nextUnit) {
        setActiveUnitId(nextUnit.id);
      }
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to save unit inspection.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle barcode scanned payload in workspace
  const handleCodeScanned = async (code: string) => {
    const matched = units.find(
      (u) => u.unitCode.toUpperCase() === code.toUpperCase() || u.barcodePayload === code,
    );
    if (matched) {
      setActiveUnitId(matched.id);
      setFeedback({
        message: `Found unit ${matched.unitCode}. Ready for inspection.`,
        tone: 'info',
      });
    } else {
      throw new Error(`Unit with code '${code}' is not in this inspection session.`);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeUnit) return;

    setUploadingPhoto(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadMediaFile(file, {
          visibility: 'PRIVATE',
          title: `Defect photo for ${activeUnit.unitCode}`,
        });
        setExceptionPhotos((prev) => [...prev, { id: uploaded.assetId, name: file.name }]);
      }
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Photo upload failed.',
        tone: 'danger',
      });
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Session Progress Breakdown */}
      <div className="rounded-xl border bg-card p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <span>Quality Control Inspection Workspace</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect physical pieces, grade condition, record defects with photos, and print Code 128 labels.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadUnits()}
              disabled={loading || submitting}
              className="gap-1.5"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPrintModalOpen(true)}
              disabled={units.length === 0}
              className="gap-1.5"
            >
              <Printer className="size-3.5" />
              <span>Print All Labels</span>
            </Button>
          </div>
        </div>

        {/* Inspection Progress Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-3.5 text-center">
          <div className="rounded-lg bg-muted/40 p-2 border">
            <span className="text-[11px] text-muted-foreground block font-medium">Total Units</span>
            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
              {stats.total}
            </span>
          </div>

          <div className="rounded-lg bg-amber-500/10 p-2 border border-amber-500/20">
            <span className="text-[11px] text-amber-700 dark:text-amber-400 block font-medium">
              Awaiting QC
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {stats.awaitingQC}
            </span>
          </div>

          <div className="rounded-lg bg-emerald-500/10 p-2 border border-emerald-500/20">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-medium">
              Grade A (Passed)
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {stats.gradeA}
            </span>
          </div>

          <div className="rounded-lg bg-sky-500/10 p-2 border border-sky-500/20">
            <span className="text-[11px] text-sky-700 dark:text-sky-400 block font-medium">
              Grade B (Minor)
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400">
              {stats.gradeB}
            </span>
          </div>

          <div className="rounded-lg bg-amber-500/10 p-2 border border-amber-500/20">
            <span className="text-[11px] text-amber-700 dark:text-amber-400 block font-medium">
              Repair Hold
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {stats.repairRequired}
            </span>
          </div>

          <div className="rounded-lg bg-rose-500/10 p-2 border border-rose-500/20">
            <span className="text-[11px] text-rose-700 dark:text-rose-400 block font-medium">
              Damaged / Quarantined
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
              {stats.damaged}
            </span>
          </div>
        </div>

        {/* Completion status alert */}
        {stats.isFinished ? (
          <div className="mt-3 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle className="size-4 text-emerald-600" />
              All units in this receiving batch have been inspected! Ready for labeling and storage allocation.
            </span>
            <Button
              size="xs"
              variant="default"
              onClick={() => setPrintModalOpen(true)}
              className="gap-1"
            >
              <Printer className="size-3" /> Print Labels
            </Button>
          </div>
        ) : null}
      </div>

      {/* Operational Feedback alert */}
      {feedback ? (
        <div
          className={cn(
            'p-3 rounded-lg text-xs border flex items-center justify-between',
            feedback.tone === 'success' && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
            feedback.tone === 'danger' && 'bg-destructive/10 border-destructive/20 text-destructive',
            feedback.tone === 'info' && 'bg-primary/10 border-primary/20 text-primary',
          )}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-70 rounded"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* Barcode scanner bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-center bg-card p-3 rounded-xl border shadow-2xs">
        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap hidden sm:inline">
          Scan Unit:
        </span>
        <UnitScannerInput
          placeholder="Scan barcode to select and inspect unit in hand…"
          onCodeScanned={handleCodeScanned}
          size="sm"
        />
      </div>

      {/* Main Two-Column Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Batch Inspection & Units Table (7 cols on desktop) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="rounded-xl border bg-card shadow-2xs overflow-hidden flex flex-col">
            {/* Batch Action Toolbar */}
            <div className="p-3 bg-muted/30 border-b flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all-uninspected"
                  checked={
                    stats.awaitingQC > 0 &&
                    units
                      .filter((u) => u.status === 'AWAITING_QC')
                      .every((u) => selectedIds.has(u.id))
                  }
                  onCheckedChange={handleSelectAllUninspected}
                  disabled={submitting || stats.awaitingQC === 0}
                />
                <label
                  htmlFor="select-all-uninspected"
                  className="text-xs font-medium text-foreground cursor-pointer"
                >
                  Select Uninspected ({selectedIds.size} selected)
                </label>
              </div>

              {selectedIds.size > 0 ? (
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleQuickPassSelected}
                  disabled={submitting}
                  className="gap-1.5 shadow-2xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Sparkles className="size-3" />
                  <span>Pass {selectedIds.size} as Grade A (Flawless)</span>
                </Button>
              ) : null}
            </div>

            {/* Units List */}
            <div className="max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin mx-auto mb-2" />
                  Loading units…
                </div>
              ) : units.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No inventory units found for this session.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 p-2"></TableHead>
                      <TableHead className="text-xs">Unit Code</TableHead>
                      <TableHead className="text-xs">Condition</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((unit) => {
                      const isSelected = selectedIds.has(unit.id);
                      const isActive = activeUnitId === unit.id;

                      return (
                        <TableRow
                          key={unit.id}
                          className={cn(
                            'cursor-pointer transition-colors',
                            isActive && 'bg-primary/10 font-medium',
                            !isActive && isSelected && 'bg-muted/40',
                          )}
                          onClick={() => setActiveUnitId(unit.id)}
                        >
                          <TableCell className="p-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectOne(unit.id)}
                              disabled={submitting}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">
                            {unit.unitCode}
                            <span className="block text-[10px] font-sans text-muted-foreground truncate max-w-[140px]">
                              {unit.productTitle}
                            </span>
                          </TableCell>
                          <TableCell>
                            <UnitConditionBadge condition={unit.currentCondition} short />
                          </TableCell>
                          <TableCell>
                            <UnitStatusBadge status={unit.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={isActive ? 'default' : 'ghost'}
                              size="xs"
                              className="h-6 px-2 text-[11px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveUnitId(unit.id);
                              }}
                            >
                              Inspect
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Unit Exception & Detailed Inspection (5 cols on desktop) */}
        <div className="lg:col-span-5">
          {activeUnit ? (
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-4">
              <div className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Selected Unit For Inspection
                  </span>
                  <UnitStatusBadge status={activeUnit.status} />
                </div>
                <h3 className="text-lg font-mono font-bold tracking-tight text-foreground mt-0.5">
                  {activeUnit.unitCode}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {activeUnit.productTitle} · <span className="font-mono">{activeUnit.sku}</span>
                </p>
              </div>

              {/* Quick pass single action button */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 block">
                    Flawless / Perfect Piece?
                  </span>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    No tears, stains, or sewing defects.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    setSelectedIds(new Set([activeUnit.id]));
                    void handleQuickPassSelected();
                  }}
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                >
                  <CheckCircle className="size-3.5 mr-1" /> Pass Flawless
                </Button>
              </div>

              {/* Exception Recording Form */}
              <form onSubmit={handleSaveActiveException} className="space-y-3 pt-1 border-t">
                <span className="text-xs font-semibold text-foreground block">
                  Record Exception / Defect
                </span>

                <div className="space-y-1">
                  <label htmlFor="active-qc-cond" className="text-[11px] font-medium text-foreground">
                    Condition Assessment *
                  </label>
                  <NativeSelect
                    id="active-qc-cond"
                    value={exceptionCondition}
                    onChange={(e) => {
                      const c = e.target.value as UnitConditionDto;
                      setExceptionCondition(c);
                      if (c === 'GRADE_B') setExceptionDisposition('RESTRICTED_SALE');
                      else if (c === 'REPAIR_REQUIRED') setExceptionDisposition('MOVE_TO_REPAIR');
                      else if (c === 'DAMAGED_UNSELLABLE') setExceptionDisposition('HOLD');
                    }}
                    disabled={submitting}
                    className="w-full text-xs font-medium"
                    required
                  >
                    <option value="GRADE_B">Grade B — Minor Imperfection / Restricted Sale</option>
                    <option value="REPAIR_REQUIRED">Repair Required — Send to Sewing / Cleaning</option>
                    <option value="DAMAGED_UNSELLABLE">Damaged / Unsellable — Quarantine Hold</option>
                  </NativeSelect>
                </div>

                <div className="space-y-1">
                  <label htmlFor="active-qc-disp" className="text-[11px] font-medium text-foreground">
                    Action / Disposition *
                  </label>
                  <NativeSelect
                    id="active-qc-disp"
                    value={exceptionDisposition}
                    onChange={(e) =>
                      setExceptionDisposition(e.target.value as InspectionDispositionDto)
                    }
                    disabled={submitting}
                    className="w-full text-xs"
                    required
                  >
                    <option value="RESTRICTED_SALE">Restricted / Minor Defect Sale</option>
                    <option value="MOVE_TO_REPAIR">Route to Repair Queue</option>
                    <option value="HOLD">Hold in Quality Quarantine</option>
                  </NativeSelect>
                </div>

                <div className="space-y-1">
                  <label htmlFor="active-qc-defect" className="text-[11px] font-medium text-foreground">
                    Defect Description *
                  </label>
                  <Input
                    id="active-qc-defect"
                    type="text"
                    placeholder="e.g. Small tear near inner seam, stain on sleeve"
                    value={exceptionDefect}
                    onChange={(e) => setExceptionDefect(e.target.value)}
                    disabled={submitting}
                    required
                    className="text-xs font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="active-qc-notes" className="text-[11px] font-medium text-foreground">
                    Inspector Notes
                  </label>
                  <Textarea
                    id="active-qc-notes"
                    placeholder="Observations, location of defect, or repair instructions…"
                    value={exceptionNotes}
                    onChange={(e) => setExceptionNotes(e.target.value)}
                    disabled={submitting}
                    rows={2}
                    className="text-xs resize-none"
                  />
                </div>

                {/* Defect photo upload */}
                <div className="space-y-2 pt-1 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-foreground">Defect Photos</span>
                    <label
                      htmlFor="workspace-photo-upload"
                      className="cursor-pointer inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                    >
                      {uploadingPhoto ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <UploadCloud className="size-3" />
                      )}
                      <span>Upload Photo</span>
                    </label>
                    <input
                      id="workspace-photo-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto || submitting}
                      className="hidden"
                    />
                  </div>

                  {exceptionPhotos.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {exceptionPhotos.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-1 bg-muted/60 border rounded px-1.5 py-0.5 text-[11px]"
                        >
                          <FileImage className="size-2.5 text-muted-foreground" />
                          <span className="max-w-[100px] truncate">{p.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setExceptionPhotos((prev) => prev.filter((i) => i.id !== p.id))
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="size-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button
                    type="submit"
                    variant="default"
                    size="sm"
                    disabled={submitting || !exceptionDefect.trim()}
                    className="w-full gap-1.5"
                  >
                    {submitting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="size-3.5" />
                    )}
                    <span>Save Defect & Advance</span>
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground shadow-2xs">
              Select or scan a unit from the list to view and record inspection results.
            </div>
          )}
        </div>
      </div>

      {/* Barcode Label Printing Modal */}
      <UnitBarcodeModal
        open={printModalOpen}
        onOpenChange={setPrintModalOpen}
        units={units}
      />
    </div>
  );
}
