'use client';

import React, { useState } from 'react';
import { Boxes, Plus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { InboundReceiptDto, InboundReceiptLineDto } from '@maevelle/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { registerInventoryUnits } from '@/lib/inventory/units';

export interface ReceiptRegisterUnitsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly receipt: InboundReceiptDto;
  readonly defaultLine?: InboundReceiptLineDto;
  readonly onSuccess?: () => void;
}

export function ReceiptRegisterUnitsDialog({
  open,
  onOpenChange,
  receipt,
  defaultLine,
  onSuccess,
}: ReceiptRegisterUnitsDialogProps) {
  const [selectedLineId, setSelectedLineId] = useState<string>(
    defaultLine?.id || receipt.lines[0]?.id || '',
  );
  const activeLine = receipt.lines.find((l) => l.id === selectedLineId) || receipt.lines[0];

  const [count, setCount] = useState<number>(Number(activeLine?.quantity) || 1);
  const [packageReference, setPackageReference] = useState<string>('');
  const [storageNotes, setStorageNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLine) return;
    if (count <= 0) {
      setError('Count must be at least 1 unit.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await registerInventoryUnits({
        variantId: activeLine.variantId,
        locationId: receipt.locationId,
        count,
        sourceType: 'INBOUND_RECEIPT',
        sourceReceiptId: receipt.id,
        sourceReceiptLineId: activeLine.id,
        packageReference: packageReference.trim() || undefined,
        storageNotes: storageNotes.trim() || undefined,
      });

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register serialized units.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Boxes className="size-4 text-primary" />
            <span>Register Physical Units for Receiving</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Receipt: <strong className="font-mono">{receipt.receiptNumber}</strong> · Location:{' '}
            <strong>{receipt.locationName}</strong>
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Select Receipt Line */}
          <div className="space-y-1.5">
            <label htmlFor="receipt-line-select" className="text-xs font-medium text-foreground">
              Select Line Item *
            </label>
            <NativeSelect
              id="receipt-line-select"
              value={selectedLineId}
              onChange={(e) => {
                const lineId = e.target.value;
                setSelectedLineId(lineId);
                const l = receipt.lines.find((line) => line.id === lineId);
                if (l) setCount(Number(l.quantity) || 1);
              }}
              disabled={submitting}
              className="text-xs w-full"
              required
            >
              {receipt.lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.productTitle} — {line.sku} ({line.quantity} pcs)
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Quantity Count */}
          <div className="space-y-1.5">
            <label htmlFor="register-count" className="text-xs font-medium text-foreground">
              Physical Units to Register (Unit IDs) *
            </label>
            <Input
              id="register-count"
              type="number"
              min="1"
              max="500"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={submitting}
              required
              className="text-xs font-mono tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Generates individual permanent <code className="font-mono">MVU-XXXXXX</code> codes for each physical piece.
            </p>
          </div>

          {/* Packaging ref */}
          <div className="space-y-1.5">
            <label htmlFor="package-ref" className="text-xs font-medium text-foreground">
              Polybag / Carton / Box Reference (Optional)
            </label>
            <Input
              id="package-ref"
              type="text"
              placeholder="e.g. CARTON-04 or POLY-A12"
              value={packageReference}
              onChange={(e) => setPackageReference(e.target.value)}
              disabled={submitting}
              className="text-xs font-sans"
            />
          </div>

          {/* Storage notes */}
          <div className="space-y-1.5">
            <label htmlFor="storage-notes" className="text-xs font-medium text-foreground">
              Receiving / Storage Notes
            </label>
            <Input
              id="storage-notes"
              type="text"
              placeholder="e.g. Unpacked from Guangzhou shipment batch 2"
              value={storageNotes}
              onChange={(e) => setStorageNotes(e.target.value)}
              disabled={submitting}
              className="text-xs font-sans"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
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
              disabled={submitting || count <= 0}
              className="gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Registering Units…</span>
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  <span>Register {count} Physical Units</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
