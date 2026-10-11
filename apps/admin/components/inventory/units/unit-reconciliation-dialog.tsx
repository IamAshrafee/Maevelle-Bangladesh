'use client';

import React, { useState, useEffect } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Boxes,
} from 'lucide-react';
import Link from 'next/link';
import type {
  SerializedStockReconciliationDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { reconcileSerializedInventory } from '@/lib/inventory/units';
import { fetchApiData } from '@/lib/api';

export interface UnitReconciliationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
}

export function UnitReconciliationDialog({
  open,
  onOpenChange,
  variantId,
  sku,
  productTitle,
}: UnitReconciliationDialogProps) {
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [reconciliation, setReconciliation] =
    useState<SerializedStockReconciliationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      void fetchApiData<readonly WarehouseLocationDto[]>('/admin/warehouse/locations')
        .then((locs) => {
          const active = (locs || []).filter((l) => l.status === 'ACTIVE');
          setLocations(active);
          const firstLoc = active[0];
          if (firstLoc && !selectedLocationId) {
            setSelectedLocationId(firstLoc.id);
          }
        })
        .catch(() => {});
    }
  }, [open, selectedLocationId]);

  useEffect(() => {
    if (open && variantId && selectedLocationId) {
      setLoading(true);
      setError(null);
      void reconcileSerializedInventory(variantId, selectedLocationId)
        .then((res) => {
          setReconciliation(res);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Reconciliation check failed.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, variantId, selectedLocationId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Scale className="size-4 text-primary" />
            <span>Serialized Stock Ledger Reconciliation</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {productTitle} · <span className="font-mono">{sku}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Location Picker */}
          <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg border">
            <label htmlFor="recon-loc" className="text-xs font-medium text-foreground whitespace-nowrap">
              Warehouse Location:
            </label>
            <NativeSelect
              id="recon-loc"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="text-xs h-8 flex-1"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </NativeSelect>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="size-5 animate-spin mx-auto mb-2 text-primary" />
              Auditing physical units against stock ledger…
            </div>
          ) : error ? (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive">
              {error}
            </div>
          ) : reconciliation ? (
            <div className="space-y-4">
              {/* Consistency Status Banner */}
              {reconciliation.isConsistent ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>100% Balanced & Reconciled:</strong> Physical serialized piece counts match stock ledger quantities exactly across available, reserved, and held buckets.
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>Discrepancy Detected Between Physical Units and Stock Ledger</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    {reconciliation.discrepancies.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Side-by-Side Comparison Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                {/* Physical Units Breakdown */}
                <div className="rounded-lg border bg-card p-3.5 space-y-2.5">
                  <h4 className="font-semibold text-foreground flex items-center gap-1.5 border-b pb-2">
                    <Boxes className="size-3.5 text-primary" />
                    <span>Physical Serialized Units</span>
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total On Hand Units:</span>
                      <strong className="font-mono tabular-nums">{reconciliation.onHandUnitsCount}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Available (Grade A/B):</span>
                      <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {reconciliation.availableUnitsCount}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">On Hold / QC / Repair:</span>
                      <strong className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                        {reconciliation.onHoldUnitsCount}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reserved for Orders:</span>
                      <strong className="font-mono tabular-nums text-sky-700 dark:text-sky-400">
                        {reconciliation.reservedUnitsCount}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Stock Ledger Breakdown */}
                <div className="rounded-lg border bg-card p-3.5 space-y-2.5">
                  <h4 className="font-semibold text-foreground flex items-center gap-1.5 border-b pb-2">
                    <Scale className="size-3.5 text-slate-500" />
                    <span>Inventory Stock Ledger</span>
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sellable Ledger Qty:</span>
                      <strong className="font-mono tabular-nums">
                        {reconciliation.ledgerSellableQuantity}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unavailable / Hold Qty:</span>
                      <strong className="font-mono tabular-nums">
                        {reconciliation.ledgerUnavailableQuantity}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reserved Ledger Qty:</span>
                      <strong className="font-mono tabular-nums">
                        {reconciliation.ledgerReservedQuantity}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tracking Mode:</span>
                      <strong className="font-mono text-[11px]">{reconciliation.trackingMode}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Links */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link
                      href={`/inventory/units?variantId=${encodeURIComponent(variantId)}&locationId=${encodeURIComponent(selectedLocationId)}`}
                      onClick={() => onOpenChange(false)}
                    />
                  }
                  className="gap-1.5 text-xs"
                >
                  <Boxes className="size-3.5" />
                  <span>Inspect Physical Units</span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
