'use client';

import { useState } from 'react';
import { CircleDollarSign, Coins, Info, Loader2, PackageCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { SupplyField } from '@/components/supply/supply-field';
import { formatSupplyMoney, formatSupplyNumber } from '@/lib/supply/api';
import type { StartLandedCostDialogProps } from '../types';

export function StartLandedCostDialog({
  open,
  onOpenChange,
  shipment,
  onStartWorksheet,
  saving,
}: StartLandedCostDialogProps) {
  const [notes, setNotes] = useState('');

  const receivedAllocations = shipment.allocations.filter(
    (a) => Number(a.receivedQuantity) > 0,
  );

  const totalReceivedUnits = receivedAllocations.reduce(
    (sum, a) => sum + Number(a.receivedQuantity),
    0,
  );

  const totalCommercialValue = receivedAllocations.reduce((sum, a) => {
    const unitPrice = Number(a.unitPrice ?? 0);
    const qty = Number(a.receivedQuantity);
    return sum + unitPrice * qty;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onStartWorksheet(notes.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-xl font-bold tracking-tight">
              Start Landed Cost Worksheet
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              {shipment.shipmentNumber}
            </Badge>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Initialize an acquisition costing workspace for this shipment. Verified physical
            receipt quantities become the baseline targets for apportioning freight and customs duties.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
            <div>
              <span className="text-muted-foreground">Destination Warehouse:</span>
              <p className="font-semibold text-foreground">{shipment.receivingLocationName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Valuation Base Currency:</span>
              <div className="flex items-center gap-1.5">
                <Coins className="size-3.5 text-primary" />
                <p className="font-mono font-bold text-foreground">{shipment.currencyCode}</p>
                <span className="text-[11px] text-muted-foreground">(Locked from purchase lines)</span>
              </div>
            </div>
          </div>

          {/* Received Cargo Targets Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cost Allocation Targets ({receivedAllocations.length} items)
            </h4>

            <div className="overflow-hidden rounded-lg border bg-card text-xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Item & Variant</TableHead>
                    <TableHead className="text-right">Received Count</TableHead>
                    <TableHead className="text-right">Purchase Unit Price</TableHead>
                    <TableHead className="text-right">Base Commercial Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivedAllocations.map((alloc) => {
                    const qty = Number(alloc.receivedQuantity);
                    const unitPrice = Number(alloc.unitPrice ?? 0);
                    const lineValue = qty * unitPrice;

                    return (
                      <TableRow key={alloc.id}>
                        <TableCell>
                          <p className="font-medium text-foreground">{alloc.productTitle}</p>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <span className="font-mono">{alloc.sku}</span>
                            {alloc.optionSummary ? (
                              <>
                                <span>·</span>
                                <span>{alloc.optionSummary}</span>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-foreground">
                          {formatSupplyNumber(alloc.receivedQuantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {alloc.unitPrice ? formatSupplyMoney(alloc.unitPrice, shipment.currencyCode) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-foreground">
                          {formatSupplyMoney(String(lineValue), shipment.currencyCode)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/50 font-semibold text-xs">
                    <TableCell>Total Targets</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSupplyNumber(String(totalReceivedUnits))}
                    </TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSupplyMoney(String(totalCommercialValue), shipment.currencyCode)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>

          {/* Worksheet Notes Field */}
          <SupplyField label="Worksheet Reference / Forwarder Notes (Optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Inbound shipment container tracking #MSKU901284. Forwarder: DHL Global."
              rows={2}
              className="text-xs"
              disabled={saving}
            />
          </SupplyField>

          {/* Notice Alert */}
          <div className="flex items-start gap-2.5 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 mt-0.5 text-primary" />
            <p>
              This creates a revisioned worksheet in <strong>Draft</strong> status. You will be able
              to record freight, customs tariffs, terminal handling, and port entry charges, preview
              their effect, and finalize the unit acquisition costs.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !receivedAllocations.length} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CircleDollarSign className="size-4" />}
              <span>{saving ? 'Creating worksheet...' : 'Initialize Worksheet'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
