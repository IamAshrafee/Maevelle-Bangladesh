'use client';

import React, { useState, useEffect } from 'react';
import { Printer, X, Check, Copy } from 'lucide-react';
import type { InventoryUnitDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { getUnitBarcodeSvgUrl } from '@/lib/inventory/units';

export interface UnitBarcodeModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly units: readonly InventoryUnitDto[];
}

type LabelSizePreset = 'compact' | 'standard' | 'large';

const LABEL_SIZES: Record<
  LabelSizePreset,
  { label: string; widthMm: number; heightMm: number; className: string }
> = {
  compact: {
    label: '40 × 25 mm (Jewelry & Small Accessories)',
    widthMm: 40,
    heightMm: 25,
    className: 'w-[180px] h-[115px]',
  },
  standard: {
    label: '50 × 30 mm (Standard Clothing Tag)',
    widthMm: 50,
    heightMm: 30,
    className: 'w-[230px] h-[138px]',
  },
  large: {
    label: '70 × 40 mm (Box / Polybag Shipping Label)',
    widthMm: 70,
    heightMm: 40,
    className: 'w-[300px] h-[170px]',
  },
};

export function UnitBarcodeModal({ open, onOpenChange, units }: UnitBarcodeModalProps) {
  const [sizePreset, setSizePreset] = useState<LabelSizePreset>('standard');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activePreset = LABEL_SIZES[sizePreset];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-6 border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Barcode Labels ({units.length} {units.length === 1 ? 'Unit' : 'Units'})
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Print permanent machine-readable Code 128 barcode labels for physical tracking.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="label-size" className="text-xs text-muted-foreground hidden sm:inline">
                Label Size:
              </label>
              <NativeSelect
                id="label-size"
                value={sizePreset}
                onChange={(e) => setSizePreset(e.target.value as LabelSizePreset)}
                className="text-xs h-8 w-44"
              >
                <option value="compact">{LABEL_SIZES.compact.label}</option>
                <option value="standard">{LABEL_SIZES.standard.label}</option>
                <option value="large">{LABEL_SIZES.large.label}</option>
              </NativeSelect>
            </div>
          </div>
        </DialogHeader>

        {/* Printable & Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/20">
          <div
            id="barcode-print-container"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-items-center"
          >
            {units.map((unit) => {
              const svgUrl = getUnitBarcodeSvgUrl(unit.id);

              return (
                <div
                  key={unit.id}
                  className={`bg-white text-black border border-slate-300 rounded shadow-xs p-2.5 flex flex-col justify-between items-center text-center relative print:border-none print:shadow-none print:m-0 print:break-inside-avoid ${activePreset.className}`}
                  style={{
                    pageBreakInside: 'avoid',
                  }}
                >
                  {/* Top Bar: Brand & SKU */}
                  <div className="w-full flex justify-between items-baseline border-b border-black/10 pb-0.5 text-[9px] font-sans">
                    <span className="font-bold tracking-widest uppercase">MAEVELLE</span>
                    <span className="font-mono text-slate-700 truncate max-w-[120px]">
                      {unit.sku}
                    </span>
                  </div>

                  {/* Product Title / Option */}
                  <div className="w-full text-center px-1 py-0.5">
                    <p className="text-[10px] font-semibold leading-tight truncate text-black">
                      {unit.productTitle}
                    </p>
                    {unit.optionSummary ? (
                      <p className="text-[8px] text-slate-600 leading-tight truncate">
                        {unit.optionSummary}
                      </p>
                    ) : null}
                  </div>

                  {/* Barcode SVG */}
                  <div className="w-full h-11 flex items-center justify-center my-0.5 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={svgUrl}
                      alt={`Barcode for ${unit.unitCode}`}
                      className="max-h-full max-w-full object-contain filter contrast-200"
                    />
                  </div>

                  {/* Human-Readable Unit Code */}
                  <div className="w-full flex items-center justify-between pt-0.5 border-t border-black/10 text-[10px] font-mono font-bold tracking-wider">
                    <span>{unit.unitCode}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(unit.unitCode)}
                      className="print:hidden text-[9px] text-slate-500 hover:text-black inline-flex items-center gap-0.5"
                      title="Copy code"
                    >
                      {copiedId === unit.unitCode ? (
                        <Check className="size-2.5 text-emerald-600" />
                      ) : (
                        <Copy className="size-2.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Footer */}
        <DialogFooter className="p-4 border-t bg-card flex sm:justify-between items-center gap-2">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Standard thermal or desktop sticker printing. Contrast is optimized for optical scanners.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 shadow-2xs"
            >
              <Printer className="size-3.5" />
              <span>Print {units.length} {units.length === 1 ? 'Label' : 'Labels'}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Scoped Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 0;
            size: auto;
          }
          body {
            background: white !important;
          }
          body * {
            visibility: hidden;
          }
          #barcode-print-container,
          #barcode-print-container * {
            visibility: visible;
          }
          #barcode-print-container {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            height: auto !important;
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
            align-content: flex-start !important;
            justify-content: flex-start !important;
            gap: 4mm !important;
            background: white !important;
            padding: 4mm !important;
            margin: 0 !important;
            z-index: 99999 !important;
          }
        }
      `}</style>
    </Dialog>
  );
}
