'use client';

import React, { useState } from 'react';
import { Wrench, CheckCircle, Loader2, AlertCircle, UploadCloud, X, FileImage } from 'lucide-react';
import type { InventoryUnitDto, UnitRepairDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { requestUnitRepair, completeUnitRepair } from '@/lib/inventory/units';
import { uploadMediaFile } from '@/lib/media/api';

export interface UnitRepairDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly unit: InventoryUnitDto;
  readonly existingRepair?: UnitRepairDto | null | undefined;
  readonly mode?: 'request' | 'complete' | undefined;
  readonly onSuccess?: (() => void) | undefined;
}

export function UnitRepairDialog({
  open,
  onOpenChange,
  unit,
  existingRepair,
  mode = 'request',
  onSuccess,
}: UnitRepairDialogProps) {
  // Request mode fields
  const [defectDescription, setDefectDescription] = useState(
    unit.latestInspection?.defectDescription || '',
  );
  const [actionRequired, setActionRequired] = useState('');
  const [requestNotes, setRequestNotes] = useState('');

  // Complete mode fields
  const [actionPerformed, setActionPerformed] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');

  // Photos
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoAssetIds, setPhotoAssetIds] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<{ id: string; name: string }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadMediaFile(file, {
          visibility: 'PRIVATE',
          title: `Repair photo for ${unit.unitCode}`,
        });
        setPhotoAssetIds((prev) => [...prev, uploaded.assetId]);
        setPhotoPreviews((prev) => [...prev, { id: uploaded.assetId, name: file.name }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
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
      if (mode === 'request') {
        await requestUnitRepair(unit.id, {
          defectDescription: defectDescription.trim(),
          actionRequired: actionRequired.trim() || undefined,
          notes: requestNotes.trim() || undefined,
        });
      } else {
        const repairId = existingRepair?.id || unit.activeRepair?.id;
        if (!repairId) {
          throw new Error('No active repair record found to complete.');
        }

        await completeUnitRepair(repairId, {
          actionPerformed: actionPerformed.trim(),
          technicianName: technicianName.trim() || undefined,
          costAmount: costAmount.trim() || undefined,
          costCurrency: 'BDT',
          notes: completeNotes.trim() || undefined,
          photoAssetIds: photoAssetIds.length > 0 ? photoAssetIds : undefined,
        });
      }

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Repair operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Wrench className="size-4 text-amber-500" />
            <span>
              {mode === 'request'
                ? `Route Unit ${unit.unitCode} for Repair`
                : `Complete Repair for ${unit.unitCode}`}
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {unit.productTitle} · <span className="font-mono">{unit.sku}</span>
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {mode === 'request' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="repair-defect" className="text-xs font-medium text-foreground">
                  Defect Description *
                </label>
                <Input
                  id="repair-defect"
                  type="text"
                  placeholder="e.g. Broken zipper on dress side seam"
                  value={defectDescription}
                  onChange={(e) => setDefectDescription(e.target.value)}
                  disabled={submitting}
                  required
                  className="text-xs font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="repair-action" className="text-xs font-medium text-foreground">
                  Action Required (Optional)
                </label>
                <Input
                  id="repair-action"
                  type="text"
                  placeholder="e.g. Replace zipper slide or re-stitch seam"
                  value={actionRequired}
                  onChange={(e) => setActionRequired(e.target.value)}
                  disabled={submitting}
                  className="text-xs font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="repair-notes" className="text-xs font-medium text-foreground">
                  Instructions / Notes
                </label>
                <Textarea
                  id="repair-notes"
                  placeholder="Details for the repair technician…"
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  disabled={submitting}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            </>
          ) : (
            <>
              {/* Prior defect context */}
              <div className="bg-muted/40 p-2.5 rounded-lg border text-xs">
                <span className="text-muted-foreground block text-[11px]">Original Defect:</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {existingRepair?.defectDescription ||
                    unit.activeRepair?.defectDescription ||
                    'Repair request'}
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="repair-performed" className="text-xs font-medium text-foreground">
                  Work / Action Performed *
                </label>
                <Input
                  id="repair-performed"
                  type="text"
                  placeholder="e.g. Re-stitched seam, dry-cleaned stain"
                  value={actionPerformed}
                  onChange={(e) => setActionPerformed(e.target.value)}
                  disabled={submitting}
                  required
                  className="text-xs font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="technician-name" className="text-xs font-medium text-foreground">
                    Technician / Tailor
                  </label>
                  <Input
                    id="technician-name"
                    type="text"
                    placeholder="e.g. Master Rafiq"
                    value={technicianName}
                    onChange={(e) => setTechnicianName(e.target.value)}
                    disabled={submitting}
                    className="text-xs font-sans"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="repair-cost" className="text-xs font-medium text-foreground">
                    Repair Cost (BDT)
                  </label>
                  <Input
                    id="repair-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 150"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    disabled={submitting}
                    className="text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="complete-notes" className="text-xs font-medium text-foreground">
                  Completion Notes
                </label>
                <Textarea
                  id="complete-notes"
                  placeholder="Technician observations or details for reinspection…"
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  disabled={submitting}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>

              {/* Photos */}
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">After-Repair Photos</span>
                  <label
                    htmlFor="repair-photo-input"
                    className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <UploadCloud className="size-3.5" />
                    )}
                    <span>Upload</span>
                  </label>
                  <input
                    id="repair-photo-input"
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
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <p className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/20 p-2 rounded text-amber-900 dark:text-amber-200">
                Completing a repair routes the item to <strong>AWAITING_QC</strong> for formal reinspection before it can be released for sale.
              </p>
            </>
          )}

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
              disabled={
                submitting ||
                (mode === 'request' ? !defectDescription.trim() : !actionPerformed.trim())
              }
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle className="size-3.5" />
                  <span>{mode === 'request' ? 'Submit to Repair Queue' : 'Complete Repair'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
