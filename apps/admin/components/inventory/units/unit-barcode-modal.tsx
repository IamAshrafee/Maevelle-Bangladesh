'use client';

import React, { useState } from 'react';
import { Printer, Check, Copy, Loader2, AlertCircle } from 'lucide-react';
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function UnitBarcodeModal({ open, onOpenChange, units }: UnitBarcodeModalProps) {
  const [sizePreset, setSizePreset] = useState<LabelSizePreset>('standard');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handlePrint = async () => {
    if (!units.length || printing) return;
    setPrinting(true);
    setPrintError(null);
    let frame: HTMLIFrameElement | null = null;
    try {
      const labels = await Promise.all(
        units.map(async (unit) => {
          const response = await fetch(getUnitBarcodeSvgUrl(unit.id), { credentials: 'include' });
          if (!response.ok) throw new Error(`Could not load the barcode for ${unit.unitCode}.`);
          const svg = await response.text();
          return `<section class="label">
            <header><strong>MAEVELLE</strong><span>${escapeHtml(unit.sku)}</span></header>
            <div class="product"><strong>${escapeHtml(unit.productTitle)}</strong>${unit.optionSummary ? `<small>${escapeHtml(unit.optionSummary)}</small>` : ''}</div>
            <div class="barcode">${svg}</div>
            <footer>${escapeHtml(unit.unitCode)}</footer>
          </section>`;
        }),
      );

      frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.append(frame);
      const printDocument = frame.contentDocument;
      if (!printDocument) throw new Error('The browser could not prepare the label document.');
      printDocument.open();
      printDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>Maevelle unit labels</title><style>
        @page { size: ${activePreset.widthMm}mm ${activePreset.heightMm}mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; background: #fff; }
        .label { width: ${activePreset.widthMm}mm; height: ${activePreset.heightMm}mm; padding: 2mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; break-after: page; page-break-after: always; }
        .label:last-child { break-after: auto; page-break-after: auto; }
        header { width: 100%; display: flex; justify-content: space-between; gap: 2mm; border-bottom: 0.2mm solid #ddd; padding-bottom: 0.5mm; font-size: 7pt; }
        header strong { letter-spacing: 0.08em; }
        header span { max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; }
        .product { width: 100%; text-align: center; overflow: hidden; font-size: 7.5pt; line-height: 1.1; }
        .product strong, .product small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .product small { margin-top: 0.3mm; color: #444; font-size: 6.5pt; }
        .barcode { width: 100%; min-height: 9mm; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .barcode svg { width: 100%; height: 9mm; }
        footer { width: 100%; border-top: 0.2mm solid #ddd; padding-top: 0.5mm; text-align: center; font: bold 8pt monospace; letter-spacing: 0.08em; }
      </style></head><body>${labels.join('')}</body></html>`);
      printDocument.close();
      const printWindow = frame.contentWindow;
      if (!printWindow) throw new Error('The browser could not open the label print document.');
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => frame?.remove(), 60_000);
    } catch (error) {
      frame?.remove();
      setPrintError(error instanceof Error ? error.message : 'Could not prepare barcode labels.');
    } finally {
      setPrinting(false);
    }
  };

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activePreset = LABEL_SIZES[sizePreset];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-2xl sm:max-h-[90vh] flex flex-col p-0 overflow-hidden">
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
          {printError ? (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{printError}</span>
            </div>
          ) : null}
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
                      aria-label={`Copy unit code ${unit.unitCode}`}
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
              onClick={() => void handlePrint()}
              disabled={printing || units.length === 0}
              className="gap-1.5 shadow-2xs"
            >
              {printing ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
              <span>{printing ? 'Preparing…' : `Print ${units.length} ${units.length === 1 ? 'Label' : 'Labels'}`}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}
