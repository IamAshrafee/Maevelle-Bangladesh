'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ScanBarcode,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Boxes,
  Printer,
  Copy,
  Check,
} from 'lucide-react';
import type { UnitBarcodeLookupDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UnitScannerInput } from './unit-scanner-input';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitConditionBadge } from './unit-condition-badge';
import { UnitInspectDialog } from './unit-inspect-dialog';
import { UnitMoveDialog } from './unit-move-dialog';
import { UnitBarcodeModal } from './unit-barcode-modal';

export interface UnitScanLookupDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function UnitScanLookupDialog({ open, onOpenChange }: UnitScanLookupDialogProps) {
  const [lookupResult, setLookupResult] = useState<UnitBarcodeLookupDto | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Sub-dialogs
  const [inspectOpen, setInspectOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const unit = lookupResult?.unit;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <ScanBarcode className="size-4 text-primary" />
              <span>Physical Unit Barcode Scanner</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Scan barcode or enter unit code to instantly retrieve condition, location, and history.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <UnitScannerInput
              autoFocus
              onUnitFound={(res) => setLookupResult(res)}
              size="default"
            />

            {unit ? (
              <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 animate-in fade-in duration-200">
                {/* Header: Unit Code & Statuses */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-foreground">
                      {unit.unitCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(unit.unitCode)}
                      className="text-muted-foreground hover:text-foreground p-1 rounded"
                      title="Copy Unit Code"
                    >
                      {copiedCode ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <UnitConditionBadge condition={unit.currentCondition} short />
                    <UnitStatusBadge status={unit.status} />
                  </div>
                </div>

                {/* Product details */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{unit.productTitle}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    SKU: {unit.sku} {unit.optionSummary ? `· ${unit.optionSummary}` : ''}
                  </p>
                </div>

                {/* Location & Source */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-lg border">
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Warehouse Location</span>
                    <span className="font-medium text-foreground">
                      {unit.locationName || unit.locationCode || 'Unassigned'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">Source Reference</span>
                    <span className="font-mono text-[11px] text-foreground truncate block">
                      {unit.sourceReceiptNumber || unit.sourceType.replaceAll('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => setInspectOpen(true)}
                  >
                    <ShieldCheck className="size-3" /> Inspect
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => setMoveOpen(true)}
                  >
                    <Boxes className="size-3" /> Move
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => setPrintOpen(true)}
                  >
                    <Printer className="size-3" /> Label
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs gap-1"
                    render={<Link href={`/inventory/units/${unit.id}`} onClick={() => onOpenChange(false)} />}
                  >
                    <span>Detail</span>
                    <ArrowRight className="size-3" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Embedded Sub-Modals */}
      {unit ? (
        <>
          <UnitInspectDialog
            open={inspectOpen}
            onOpenChange={setInspectOpen}
            unit={unit}
            onSuccess={() => {
              // Refresh unit
              setInspectOpen(false);
            }}
          />
          <UnitMoveDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            units={[unit]}
            onSuccess={() => setMoveOpen(false)}
          />
          <UnitBarcodeModal
            open={printOpen}
            onOpenChange={setPrintOpen}
            units={[unit]}
          />
        </>
      ) : null}
    </>
  );
}
