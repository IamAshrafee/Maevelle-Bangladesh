'use client';

import React, { useState, useEffect } from 'react';
import { Settings2, ArrowRight, Loader2, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { VariantTrackingModeDto, WarehouseLocationDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { fetchApiData } from '@/lib/api';
import { setVariantTrackingMode, convertStockToSerialized } from '@/lib/inventory/units';

export interface TrackingModeDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly currentTrackingMode: VariantTrackingModeDto;
  readonly currentItemVersion: number;
  readonly currentOnHand?: number;
  readonly onSuccess?: () => void;
}

export function TrackingModeDialog({
  open,
  onOpenChange,
  variantId,
  sku,
  productTitle,
  currentTrackingMode,
  currentItemVersion,
  currentOnHand = 0,
  onSuccess,
}: TrackingModeDialogProps) {
  const [selectedMode, setSelectedMode] = useState<VariantTrackingModeDto>(currentTrackingMode);
  const [locationId, setLocationId] = useState<string>('');
  const [storageNotes, setStorageNotes] = useState<string>('');
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMode(currentTrackingMode);
  }, [currentTrackingMode, currentOnHand]);

  useEffect(() => {
    if (open) {
      setError(null);
      void fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations')
        .then((locs) => {
          const active = (locs || []).filter((l) => l.status === 'ACTIVE');
          setLocations(active);
          const firstLoc = active[0];
          if (firstLoc && !locationId) {
            setLocationId(firstLoc.id);
          }
        })
        .catch(() => {});
    }
  }, [open, locationId]);

  const isConvertingExistingStock =
    currentTrackingMode === 'STANDARD' && selectedMode === 'SERIAL' && currentOnHand > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (isConvertingExistingStock) {
        if (!locationId) throw new Error('Warehouse location is required to register existing stock.');

        await convertStockToSerialized({
          variantId,
          locationId,
          expectedVersion: currentItemVersion,
          storageNotes: storageNotes.trim() || undefined,
        });
      } else {
        // Direct mode toggle
        await setVariantTrackingMode({
          variantId,
          trackingMode: selectedMode,
          expectedVersion: currentItemVersion,
        });
      }

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tracking mode.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Settings2 className="size-4 text-primary" />
            <span>Inventory Tracking Mode — {sku}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{productTitle}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Mode Selector Radio Cards */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Select Tracking Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Standard Mode Card */}
              <div
                onClick={() => setSelectedMode('STANDARD')}
                className={`p-3 rounded-lg border cursor-pointer transition-colors text-left ${
                  selectedMode === 'STANDARD'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">Quantity-Based</span>
                  {selectedMode === 'STANDARD' ? (
                    <CheckCircle2 className="size-3.5 text-primary" />
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Track the total aggregate count of identical items without individual physical piece IDs.
                </p>
              </div>

              {/* Serialized Mode Card */}
              <div
                onClick={() => setSelectedMode('SERIAL')}
                className={`p-3 rounded-lg border cursor-pointer transition-colors text-left ${
                  selectedMode === 'SERIAL'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">Individual Unit (Serial)</span>
                  {selectedMode === 'SERIAL' ? (
                    <CheckCircle2 className="size-3.5 text-primary" />
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Give every physical garment its own Unit ID for condition QC, repairs, barcode labels, and picking verification.
                </p>
              </div>
            </div>
          </div>

          {/* Existing Stock Conversion Guidance */}
          {isConvertingExistingStock ? (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 block">
                    Existing Stock Detected ({currentOnHand} Units On Hand)
                  </span>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                    Converting this variant requires registering permanent serialized Unit IDs for current physical inventory. The newly generated units will be marked as <strong>AWAITING_QC</strong> until inspected and labeled.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 pt-1 border-t border-amber-500/20">
                <div className="space-y-1">
                  <label htmlFor="convert-location" className="text-[11px] font-medium text-foreground">
                    Storage Warehouse *
                  </label>
                  <NativeSelect
                    id="convert-location"
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    disabled={submitting}
                    className="text-xs"
                    required
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Every unrepresented whole unit in the selected warehouse ledger will receive an identity. Existing identities are preserved, and the command stops if the ledger contains fractional stock.
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor="convert-notes" className="text-[11px] font-medium text-foreground">
                  Storage / Batch Notes
                </label>
                <Input
                  id="convert-notes"
                  type="text"
                  placeholder="e.g. Existing stock converted during serialized rollout"
                  value={storageNotes}
                  onChange={(e) => setStorageNotes(e.target.value)}
                  disabled={submitting}
                  className="text-xs font-sans"
                />
              </div>
            </div>
          ) : null}

          {/* Warning when downgrading from SERIAL to STANDARD */}
          {currentTrackingMode === 'SERIAL' && selectedMode === 'STANDARD' ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block">Caution: Disabling Individual Tracking</strong>
                <span className="text-[11px] leading-relaxed">
                  Existing physical units will no longer be tracked individually during picking and receiving. Uninspected or damaged unit records will be preserved in audit history.
                </span>
              </div>
            </div>
          ) : null}

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
              disabled={submitting || (selectedMode === currentTrackingMode && !isConvertingExistingStock)}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <ArrowRight className="size-3.5" />
                  <span>{isConvertingExistingStock ? 'Register & Convert' : 'Update Tracking Mode'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
