'use client';

import { useEffect, useState } from 'react';
import { CircleDollarSign, Coins, Info, Loader2, PackageCheck, Truck } from 'lucide-react';
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
import type { LandedCostStartDialogProps } from './types';

export function LandedCostStartDialog({
  open,
  onOpenChange,
  eligibleShipments,
  initialShipmentId,
  onStartWorksheet,
  saving,
}: LandedCostStartDialogProps) {
  const [selectedShipmentId, setSelectedShipmentId] = useState(
    initialShipmentId || eligibleShipments[0]?.id || '',
  );
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialShipmentId) {
      setSelectedShipmentId(initialShipmentId);
    } else if (!selectedShipmentId && eligibleShipments[0]) {
      setSelectedShipmentId(eligibleShipments[0].id);
    }
  }, [initialShipmentId, eligibleShipments, selectedShipmentId]);

  const currentShipment = eligibleShipments.find((s) => s.id === selectedShipmentId);

  const receivedAllocations = currentShipment
    ? currentShipment.allocations.filter((a) => Number(a.receivedQuantity) > 0)
    : [];

  const totalReceivedUnits = receivedAllocations.reduce(
    (sum, a) => sum + Number(a.receivedQuantity),
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShipment) return;
    await onStartWorksheet(currentShipment.id, currentShipment.currencyCode, notes);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <CircleDollarSign className="size-5 shrink-0 text-primary" />
            <DialogTitle>Start Landed Cost Valuation</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Initialize an operational landed-cost worksheet to allocate freight, customs duty, port
            charges, and insurance across physical received inventory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Shipment Selector */}
          <SupplyField
            label="Inbound Shipment"
            hint="Select an arrived shipment with verified dock receipt counts"
          >
            <select
              value={selectedShipmentId}
              onChange={(e) => setSelectedShipmentId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-ring"
            >
              {eligibleShipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shipmentNumber} · {s.receivingLocationName} · {s.currencyCode}
                </option>
              ))}
            </select>
          </SupplyField>

          {currentShipment ? (
            <>
              {/* Currency and Dock Info Callout */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Coins className="size-4 text-primary" />
                  <div>
                    <span className="font-semibold text-foreground">Base Currency: </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {currentShipment.currencyCode}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Truck className="size-3.5" />
                  <span>Dock: {currentShipment.receivingLocationName}</span>
                </div>
              </div>

              {/* Target Received Items Summary */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Verified Received Cargo Items</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {formatSupplyNumber(totalReceivedUnits.toString())} units across{' '}
                    {receivedAllocations.length} items
                  </Badge>
                </div>

                <div className="overflow-hidden rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-xs">
                        <TableHead className="font-semibold">Product / Variant</TableHead>
                        <TableHead className="font-semibold">SKU</TableHead>
                        <TableHead className="text-right font-semibold">Received Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivedAllocations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                            No received items found on this shipment.
                          </TableCell>
                        </TableRow>
                      ) : (
                        receivedAllocations.map((alloc) => (
                          <TableRow key={alloc.id} className="text-xs">
                            <TableCell className="font-medium text-foreground">
                              {alloc.productTitle}
                              <div className="text-[10px] text-muted-foreground">
                                PO: {alloc.purchaseNumber} · {alloc.supplierName}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {alloc.sku}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatSupplyNumber(alloc.receivedQuantity)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-muted/60 text-xs font-semibold">
                        <TableCell colSpan={2}>Total Verified Cargo Basis</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">
                          {formatSupplyNumber(totalReceivedUnits.toString())} units
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            </>
          ) : null}

          {/* Optional Notes */}
          <SupplyField
            label="Worksheet Notes (Optional)"
            hint="Reference bill of lading, customs entry #, forwarder invoice, or operational notes"
          >
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Inbound customs clearance via Chittagong Port, freight invoice #INV-8832."
              rows={2}
              className="resize-none text-xs"
            />
          </SupplyField>

          {/* Educational Notice */}
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Creating this worksheet opens Revision 1 in <strong>DRAFT</strong> status. You can record
              freight, customs, handling, and insurance components, preview largest-remainder
              allocations, and finalize when all invoices are ready.
            </span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !currentShipment || totalReceivedUnits <= 0}
              className="gap-1.5 shadow-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <CircleDollarSign className="size-3.5" />
                  <span>Create Draft Worksheet</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
