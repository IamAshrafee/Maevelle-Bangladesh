'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, UploadCloud, Loader2, CheckCircle, X, FileImage } from 'lucide-react';
import type {
  InventoryUnitDto,
  UnitConditionDto,
  InspectionStageDto,
  InspectionDispositionDto,
} from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { performUnitInspection } from '@/lib/inventory/units';
import { uploadMediaFile } from '@/lib/media/api';
import { UnitCommandError } from './unit-command-error';

export interface UnitInspectDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly unit: InventoryUnitDto;
  readonly defaultStage?: InspectionStageDto;
  readonly onSuccess?: () => void;
}

export function UnitInspectDialog({
  open,
  onOpenChange,
  unit,
  defaultStage = 'INBOUND_INTAKE',
  onSuccess,
}: UnitInspectDialogProps) {
  const [stage, setStage] = useState<InspectionStageDto>(defaultStage);
  const [condition, setCondition] = useState<UnitConditionDto>('GRADE_A');
  const [defectDescription, setDefectDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [disposition, setDisposition] = useState<InspectionDispositionDto>('RELEASE_SELLABLE');

  // Media photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<{ id: string; name: string }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextCondition =
      unit.currentCondition === 'REPAIR_REQUIRED' ? 'GRADE_A' : unit.currentCondition;
    setStage(defaultStage);
    setCondition(nextCondition);
    setDisposition(
      nextCondition === 'GRADE_A'
        ? 'RELEASE_SELLABLE'
        : nextCondition === 'GRADE_B'
          ? 'RESTRICTED_SALE'
          : 'HOLD',
    );
    setDefectDescription('');
    setNotes('');
    setPhotoAssetIds([]);
    setPhotoPreviews([]);
    setError(null);
  }, [defaultStage, open, unit.currentCondition, unit.id, unit.version]);

  // Synchronize sensible default disposition when condition changes
  const handleConditionChange = (newCondition: UnitConditionDto) => {
    setCondition(newCondition);
    if (newCondition === 'GRADE_A') {
      setDisposition('RELEASE_SELLABLE');
    } else if (newCondition === 'GRADE_B') {
      setDisposition('RESTRICTED_SALE');
    } else if (newCondition === 'REPAIR_REQUIRED') {
      setDisposition('MOVE_TO_REPAIR');
    } else if (newCondition === 'DAMAGED_UNSELLABLE') {
      setDisposition('HOLD');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadMediaFile(file, {
          visibility: 'PRIVATE',
          title: `QC Defect Photo for ${unit.unitCode}`,
        });
        setPhotoAssetIds((prev) => [...prev, uploaded.assetId]);
        setPhotoPreviews((prev) => [...prev, { id: uploaded.assetId, name: file.name }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Photo upload failed.'));
    } finally {
      setUploadingPhoto(false);
      // Reset input value
      e.target.value = '';
    }
  };

  const removePhoto = (id: string) => {
    setPhotoAssetIds((prev) => prev.filter((item) => item !== id));
    setPhotoPreviews((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await performUnitInspection(unit.id, {
        expectedVersion: unit.version,
        inspectionStage: stage,
        conditionResult: condition,
        defectDescription: defectDescription.trim() || undefined,
        notes: notes.trim() || undefined,
        disposition,
        photoAssetIds: photoAssetIds.length > 0 ? photoAssetIds : undefined,
      });

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Inspection recording failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-h-[90vh] sm:max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="size-4 text-primary" />
            <span>Record QC Inspection — {unit.unitCode}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {unit.productTitle} · <span className="font-mono">{unit.sku}</span>
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error ? (
            <UnitCommandError
              error={error}
              onReload={() => {
                onOpenChange(false);
                onSuccess?.();
              }}
            />
          ) : null}

          {/* Inspection Stage */}
          <div className="space-y-1.5">
            <label htmlFor="qc-stage" className="text-xs font-medium text-foreground">
              Inspection Stage
            </label>
            <NativeSelect
              id="qc-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as InspectionStageDto)}
              disabled={submitting}
              className="w-full text-xs"
            >
              <option value="INBOUND_INTAKE">Inbound Goods Intake</option>
              <option value="REINSPECTION">Post-Repair Reinspection</option>
              <option value="RETURN_INSPECTION">Return Receipt Inspection</option>
              <option value="ROUTINE_AUDIT">Routine Warehouse Audit</option>
            </NativeSelect>
          </div>

          {/* Condition Result */}
          <div className="space-y-1.5">
            <label htmlFor="qc-condition" className="text-xs font-medium text-foreground">
              Condition Assessment *
            </label>
            <NativeSelect
              id="qc-condition"
              value={condition}
              onChange={(e) => handleConditionChange(e.target.value as UnitConditionDto)}
              disabled={submitting}
              className="w-full text-xs font-medium"
              required
            >
              <option value="GRADE_A">Grade A — Flawless / Perfect Condition</option>
              <option value="GRADE_B">Grade B — Minor Imperfection / Restricted Sale</option>
              <option value="REPAIR_REQUIRED">Repair Required — Requires Sewing / Cleaning</option>
              <option value="DAMAGED_UNSELLABLE">Damaged / Unsellable — Severe Defect</option>
            </NativeSelect>
          </div>

          {/* Disposition */}
          <div className="space-y-1.5">
            <label htmlFor="qc-disposition" className="text-xs font-medium text-foreground">
              Recommended Disposition *
            </label>
            <NativeSelect
              id="qc-disposition"
              value={disposition}
              onChange={(e) => setDisposition(e.target.value as InspectionDispositionDto)}
              disabled={submitting}
              className="w-full text-xs"
              required
            >
              <option value="RELEASE_SELLABLE">Release to Sellable Stock</option>
              <option value="RESTRICTED_SALE">Restricted / Minor Defect Sale</option>
              <option value="MOVE_TO_REPAIR">Route to Repair Queue</option>
              <option value="HOLD">Hold in Quality Quarantine</option>
            </NativeSelect>
          </div>

          {/* Defect Description if not Grade A */}
          {condition !== 'GRADE_A' ? (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label htmlFor="qc-defect" className="text-xs font-medium text-foreground">
                Defect Description *
              </label>
              <Input
                id="qc-defect"
                type="text"
                placeholder="e.g. Small tear near inner seam, stain on sleeve, broken zipper"
                value={defectDescription}
                onChange={(e) => setDefectDescription(e.target.value)}
                disabled={submitting}
                required
                className="text-xs font-sans"
              />
            </div>
          ) : null}

          {/* Additional Notes */}
          <div className="space-y-1.5">
            <label htmlFor="qc-notes" className="text-xs font-medium text-foreground">
              Inspector Notes (Optional)
            </label>
            <Textarea
              id="qc-notes"
              placeholder="Additional inspection remarks or details…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              rows={2}
              className="text-xs resize-none"
            />
          </div>

          {/* Defect Photo Upload */}
          <div className="space-y-2 pt-1 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Defect Photographs</span>
              <label
                htmlFor="photo-upload-input"
                className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                {uploadingPhoto ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <UploadCloud className="size-3.5" />
                )}
                <span>Upload Photos</span>
              </label>
              <input
                id="photo-upload-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto || submitting}
                className="hidden"
              />
            </div>

            {photoPreviews.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {photoPreviews.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1.5 bg-muted/60 border rounded px-2 py-1 text-xs text-foreground"
                  >
                    <FileImage className="size-3 text-muted-foreground" />
                    <span className="max-w-[120px] truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${p.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Optional photographic evidence attached to this inspection record.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={submitting || (condition !== 'GRADE_A' && !defectDescription.trim())}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Submitting QC…</span>
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5" />
                  <span>Save Inspection</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
