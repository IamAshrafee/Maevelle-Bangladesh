'use client';

import { useEffect, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import type { UnitBarcodeLookupDto } from '@maevelle/contracts';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UnitScannerInput } from './unit-scanner-input';
import { UnitScanResult } from './unit-scan-result';

export interface UnitScanLookupDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function UnitScanLookupDialog({ open, onOpenChange }: UnitScanLookupDialogProps) {
  const [result, setResult] = useState<UnitBarcodeLookupDto | null>(null);

  useEffect(() => {
    if (open) setResult(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-none sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ScanBarcode className="size-4 text-primary" />
            Scan a physical unit
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Scan a barcode or enter a Unit Code to retrieve its current authorized state.
          </p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <UnitScannerInput autoFocus onUnitFound={setResult} />
          {result ? (
            <UnitScanResult
              result={result}
              onResultChange={setResult}
              onNavigate={() => onOpenChange(false)}
              compact
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
