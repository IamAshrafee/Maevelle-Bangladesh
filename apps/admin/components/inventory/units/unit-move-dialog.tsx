'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, Boxes, Loader2, AlertCircle } from 'lucide-react';
import type { InventoryUnitDto, WarehouseLocationDto } from '@maevelle/contracts';
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
import { moveUnitLocation, bulkMoveUnitsLocation } from '@/lib/inventory/units';

export interface UnitMoveDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly units: readonly InventoryUnitDto[];
  readonly onSuccess?: () => void;
}

export function UnitMoveDialog({
  open,
  onOpenChange,
  units,
  onSuccess,
}: UnitMoveDialogProps) {
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoadingLocations(true);
      setError(null);
      void fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations')
        .then((locs) => {
          const active = (locs || []).filter((l) => l.status === 'ACTIVE');
          setLocations(active);
          const firstLoc = active[0];
          if (firstLoc && !selectedLocationId) {
            setSelectedLocationId(firstLoc.id);
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load warehouse locations.');
        })
        .finally(() => {
          setLoadingLocations(false);
        });
    }
  }, [open, selectedLocationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocationId || units.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const singleUnit = units[0];
      if (units.length === 1 && singleUnit) {
        await moveUnitLocation(singleUnit.id, {
          newLocationId: selectedLocationId,
          reason: reason.trim() || undefined,
        });
      } else {
        await bulkMoveUnitsLocation({
          unitIds: units.map((u) => u.id),
          newLocationId: selectedLocationId,
          reason: reason.trim() || undefined,
        });
      }

      onOpenChange(false);
      setReason('');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move unit location.');
    } finally {
      setSubmitting(false);
    }
  };

  const isMulti = units.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Boxes className="size-4 text-primary" />
            {isMulti
              ? `Move ${units.length} Units to New Location`
              : `Move Unit ${units[0]?.unitCode || ''}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Current location indication */}
          {!isMulti && units[0] ? (
            <div className="bg-muted/40 p-2.5 rounded-lg border text-xs flex justify-between items-center">
              <span className="text-muted-foreground">Current Location:</span>
              <span className="font-semibold text-foreground">
                {units[0].locationName || units[0].locationCode || 'Unassigned'}
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="destination-location" className="text-xs font-medium text-foreground">
              Destination Warehouse Location *
            </label>
            <NativeSelect
              id="destination-location"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              disabled={loadingLocations || submitting}
              className="w-full text-xs"
              required
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="move-reason" className="text-xs font-medium text-foreground">
              Movement Reason (Optional)
            </label>
            <Input
              id="move-reason"
              type="text"
              placeholder="e.g. Relocated to Rack B-04 for picking"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              className="text-xs font-sans"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
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
              disabled={submitting || !selectedLocationId || units.length === 0}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Moving…</span>
                </>
              ) : (
                <>
                  <ArrowRight className="size-3.5" />
                  <span>Confirm Movement</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
