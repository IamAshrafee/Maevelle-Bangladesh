'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ScanBarcode,
  Boxes,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Printer,
  Copy,
  Check,
} from 'lucide-react';
import type { UnitBarcodeLookupDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  AdminPage,
  PageHeader,
  PageTitle,
  PageDescription,
  PageSection,
} from '@/components/ui/page-shell';
import { UnitScannerInput } from '@/components/inventory/units/unit-scanner-input';
import { UnitStatusBadge } from '@/components/inventory/units/unit-status-badge';
import { UnitConditionBadge } from '@/components/inventory/units/unit-condition-badge';
import { UnitInspectDialog } from '@/components/inventory/units/unit-inspect-dialog';
import { UnitMoveDialog } from '@/components/inventory/units/unit-move-dialog';
import { UnitBarcodeModal } from '@/components/inventory/units/unit-barcode-modal';

export default function InventoryUnitScanPage() {
  const [lookupResult, setLookupResult] = useState<UnitBarcodeLookupDto | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [inspectOpen, setInspectOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const unit = lookupResult?.unit;

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <AdminPage>
      <Breadcrumb
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Physical Units', href: '/inventory/units' },
          { label: 'Barcode Scanner', current: true },
        ]}
      />

      <PageHeader>
        <div>
          <PageTitle className="flex items-center gap-2">
            <ScanBarcode className="size-6 text-primary" />
            <span>Mobile Barcode Scanner & Lookup</span>
          </PageTitle>
          <PageDescription>
            High-speed optical scanning for warehouse stock handling, physical inspections, and location movements.
          </PageDescription>
        </div>
      </PageHeader>

      <PageSection>
        <div className="max-w-xl mx-auto space-y-4">
          <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
            <span className="text-xs font-semibold text-foreground block">
              Scan Barcode with Handheld Gun or Device Camera:
            </span>
            <UnitScannerInput
              autoFocus
              size="lg"
              onUnitFound={(res) => setLookupResult(res)}
            />
          </div>

          {unit ? (
            <div className="rounded-xl border bg-card p-5 shadow-2xs space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-foreground">
                    {unit.unitCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(unit.unitCode)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded"
                  >
                    {copiedCode ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <UnitConditionBadge condition={unit.currentCondition} />
                  <UnitStatusBadge status={unit.status} />
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-foreground">{unit.productTitle}</h3>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  SKU: {unit.sku} {unit.optionSummary ? `· ${unit.optionSummary}` : ''}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3 rounded-lg border">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Warehouse Location</span>
                  <span className="font-semibold text-foreground mt-0.5 block">
                    {unit.locationName || unit.locationCode || 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Source Reference</span>
                  <span className="font-mono text-foreground mt-0.5 block truncate">
                    {unit.sourceReceiptNumber || unit.sourceType.replaceAll('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectOpen(true)}
                  className="gap-1.5"
                >
                  <ShieldCheck className="size-3.5 text-blue-600" /> Inspect
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMoveOpen(true)}
                  className="gap-1.5"
                >
                  <Boxes className="size-3.5 text-slate-600" /> Move
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintOpen(true)}
                  className="gap-1.5"
                >
                  <Printer className="size-3.5 text-slate-600" /> Label
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  render={<Link href={`/inventory/units/${unit.id}`} />}
                  className="gap-1.5"
                >
                  <span>Open Detail</span>
                  <ExternalLink className="size-3" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </PageSection>

      {unit ? (
        <>
          <UnitInspectDialog
            open={inspectOpen}
            onOpenChange={setInspectOpen}
            unit={unit}
          />
          <UnitMoveDialog
            open={moveOpen}
            onOpenChange={setMoveOpen}
            units={[unit]}
          />
          <UnitBarcodeModal
            open={printOpen}
            onOpenChange={setPrintOpen}
            units={[unit]}
          />
        </>
      ) : null}
    </AdminPage>
  );
}
