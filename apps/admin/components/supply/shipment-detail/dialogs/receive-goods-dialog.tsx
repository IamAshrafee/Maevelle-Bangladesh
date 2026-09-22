'use client';

import { Check, Info, PackageCheck } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SupplyField } from '@/components/supply/supply-field';
import { formatSupplyNumber, remainingSupplyQuantity } from '@/lib/supply/api';
import type { ReceiveGoodsDialogProps } from '../types';

const CONDITIONS = [
  { key: 'SELLABLE', label: 'Sellable', desc: 'Standard warehouse inventory' },
  { key: 'DAMAGED', label: 'Damaged', desc: 'Physical damage upon arrival' },
  { key: 'QUARANTINE', label: 'Quarantine', desc: 'Held pending quality review' },
  { key: 'INSPECTION', label: 'Inspection', desc: 'Undergoing batch sampling' },
] as const;

export function ReceiveGoodsDialog({
  open,
  onOpenChange,
  shipment,
  lines,
  setLines,
  onSubmit,
  saving,
}: ReceiveGoodsDialogProps) {
  const remainingAllocations = shipment.allocations.filter(
    (allocation) => Number(allocation.receivedQuantity) < Number(allocation.allocatedQuantity),
  );

  const quantityFor = (allocationId: string, condition: string) =>
    lines.find((line) => line.shipmentAllocationId === allocationId && line.condition === condition)
      ?.quantity ?? '';

  const updateQuantity = (allocationId: string, condition: string, quantity: string) => {
    const without = lines.filter(
      (line) => !(line.shipmentAllocationId === allocationId && line.condition === condition),
    );
    setLines(
      Number(quantity) > 0
        ? [...without, { shipmentAllocationId: allocationId, condition, quantity }]
        : without,
    );
  };

  const countFor = (allocationId: string) =>
    lines
      .filter((line) => line.shipmentAllocationId === allocationId)
      .reduce((total, line) => total + (Number(line.quantity) || 0), 0);

  const totalExpectedRemaining = remainingAllocations.reduce(
    (total, allocation) =>
      total +
      Number(remainingSupplyQuantity(allocation.allocatedQuantity, allocation.receivedQuantity)),
    0,
  );

  const totalCounted = lines.reduce((total, line) => total + (Number(line.quantity) || 0), 0);

  const hasOvercounted = remainingAllocations.some(
    (allocation) =>
      countFor(allocation.id) >
      Number(remainingSupplyQuantity(allocation.allocatedQuantity, allocation.receivedQuantity)),
  );

  const receiveAllSellable = () => {
    setLines(
      remainingAllocations.map((allocation) => ({
        shipmentAllocationId: allocation.id,
        condition: 'SELLABLE',
        quantity: remainingSupplyQuantity(
          allocation.allocatedQuantity,
          allocation.receivedQuantity,
        ),
      })),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-6 sm:max-w-4xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-xl font-bold tracking-tight">
              Receive Shipment {shipment.shipmentNumber}
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              {shipment.receivingLocationName}
            </Badge>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Verify physical quantities delivered to {shipment.receivingLocationName}. Posting creates
            immutable inventory receipt transactions and updates on-hand stock.
          </DialogDescription>
        </DialogHeader>

        {/* Quick Fill & Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Expected Remaining:</span>
              <strong className="font-semibold text-foreground">
                {formatSupplyNumber(String(totalExpectedRemaining))} units
              </strong>
            </div>
            <span className="text-muted-foreground/50">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Session Total:</span>
              <strong
                className={`font-semibold ${
                  hasOvercounted
                    ? 'text-destructive'
                    : totalCounted > 0
                      ? 'text-primary'
                      : 'text-foreground'
                }`}
              >
                {formatSupplyNumber(String(totalCounted))} units
              </strong>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!remainingAllocations.length || saving}
            onClick={receiveAllSellable}
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <Check className="size-3.5" />
            Receive all remaining as sellable
          </Button>
        </div>

        <form className="space-y-5" onSubmit={onSubmit}>
          {/* Item Counting Rows */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cargo Items ({remainingAllocations.length})
            </h4>

            <div className="divide-y rounded-xl border">
              {remainingAllocations.map((allocation) => {
                const remaining = Number(
                  remainingSupplyQuantity(allocation.allocatedQuantity, allocation.receivedQuantity),
                );
                const counted = countFor(allocation.id);
                const isOver = counted > remaining;

                return (
                  <div className="space-y-3 p-4 transition-colors" key={allocation.id}>
                    {/* Item Heading */}
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{allocation.productTitle}</p>
                          {allocation.optionSummary ? (
                            <Badge variant="secondary" className="text-[11px] font-normal">
                              {allocation.optionSummary}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          SKU: {allocation.sku} · PO: {allocation.purchaseNumber} ({allocation.supplierName})
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <span className="text-muted-foreground">Remaining to receive: </span>
                        <strong className="font-semibold text-foreground">
                          {formatSupplyNumber(String(remaining))}
                        </strong>
                        {Number(allocation.receivedQuantity) > 0 ? (
                          <span className="text-muted-foreground">
                            {' '}({formatSupplyNumber(allocation.receivedQuantity)} prior)
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Condition Inputs */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CONDITIONS.map((cond) => (
                        <div key={cond.key} className="space-y-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            {cond.label}
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            className={`h-9 text-xs tabular-nums ${isOver ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                            value={quantityFor(allocation.id, cond.key)}
                            onChange={(e) => updateQuantity(allocation.id, cond.key, e.target.value)}
                            disabled={saving}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Line status info */}
                    <div
                      className={`flex items-center justify-between text-xs ${
                        isOver
                          ? 'font-medium text-destructive'
                          : counted === remaining && counted > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      <span>
                        {isOver
                          ? 'Count exceeds the expected remaining shipment quantity!'
                          : counted === remaining && counted > 0
                            ? 'Complete count for this item'
                            : counted > 0
                              ? `${formatSupplyNumber(String(remaining - counted))} units will remain for later delivery`
                              : '0 counted in this session'}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatSupplyNumber(String(counted))} / {formatSupplyNumber(String(remaining))}
                      </span>
                    </div>
                  </div>
                );
              })}

              {!remainingAllocations.length ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  All items in this shipment have already been fully received.
                </div>
              ) : null}
            </div>
          </div>

          {/* Session Metadata */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SupplyField label="Packing Slip / Delivery Note #">
              <Input
                name="packingSlipReference"
                placeholder="e.g. PK-2026-9042"
                className="text-xs"
                disabled={saving}
              />
            </SupplyField>

            <SupplyField label="Receiving Session Notes (Optional)">
              <Textarea
                name="notes"
                placeholder="Note any carton seal integrity, dock bay #, or container comments..."
                rows={2}
                className="text-xs"
                disabled={saving}
              />
            </SupplyField>
          </div>

          {/* Invariant Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 mt-0.5 text-primary" />
            <p>
              Posting this receipt automatically creates a warehouse inventory batch at{' '}
              <strong>{shipment.receivingLocationName}</strong> with provisional cost layers tied to
              the purchase line.
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
            <Button
              type="submit"
              disabled={saving || totalCounted <= 0 || hasOvercounted}
              className="gap-1.5"
            >
              <PackageCheck className="size-4" />
              <span>{saving ? 'Posting receipt...' : `Post Receipt (${formatSupplyNumber(String(totalCounted))} units)`}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
