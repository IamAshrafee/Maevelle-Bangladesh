'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  PackageCheck,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatSupplyDate, formatSupplyNumber } from '@/lib/supply/api';
import type { ShipmentDetailReceiptsSectionProps } from './types';

export function ShipmentDetailReceiptsSection({
  shipment,
  receipts,
  canReceive,
  onOpenReceive,
}: ShipmentDetailReceiptsSectionProps) {
  const isArrived = shipment.status === 'ARRIVED';
  const isComplete = shipment.receivingStatus === 'RECEIVED';

  return (
    <div className="space-y-4">
      {/* Header and Receive CTA */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">
            Warehouse Receiving Sessions ({receipts.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Each physical count is an immutable warehouse receiving voucher that increases stock and logs audit provenance.
          </p>
        </div>

        {isArrived && !isComplete && canReceive ? (
          <Button size="sm" onClick={onOpenReceive} className="gap-1.5 shadow-sm">
            <PackageCheck className="size-4" />
            <span>Post New Count</span>
          </Button>
        ) : null}
      </div>

      {/* Receipts List or Empty State */}
      {receipts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center sm:p-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <PackageCheck className="size-6 text-muted-foreground" />
          </div>
          <h4 className="mt-4 font-heading text-base font-semibold">No receiving vouchers posted yet</h4>
          <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
            {isArrived
              ? 'Goods have docked at the warehouse. Count delivered items to increase on-hand inventory.'
              : 'Receiving sessions can be posted as soon as the carrier records arrival at the destination dock.'}
          </p>
          {isArrived && canReceive ? (
            <Button size="sm" onClick={onOpenReceive} className="mt-4 gap-1.5">
              <PackageCheck className="size-4" />
              <span>Receive First Batch</span>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.map((receipt) => {
            const totalUnits = receipt.lines.reduce(
              (sum, line) => sum + Number(line.quantity),
              0,
            );

            const conditionCounts = receipt.lines.reduce<Record<string, number>>((acc, line) => {
              acc[line.condition] = (acc[line.condition] ?? 0) + Number(line.quantity);
              return acc;
            }, {});

            return (
              <Card key={receipt.id} className="overflow-hidden shadow-xs hover:border-primary/40 transition-colors">
                <CardContent className="p-4 space-y-3">
                  {/* Top Bar: Receipt # and Timestamp */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/receiving/${receipt.id}`}
                          className="font-mono text-sm font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          {receipt.receiptNumber}
                        </Link>
                        <StatusBadge status={receipt.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Posted {formatSupplyDate(receipt.postedAt)} at{' '}
                        <strong className="text-foreground font-medium">{receipt.locationName}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        render={<Link href={`/receiving/${receipt.id}`} />}
                      >
                        <FileCheck className="size-3" />
                        <span>View Voucher</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        render={
                          <Link href={`/inventory/history?q=${encodeURIComponent(receipt.receiptNumber)}`} />
                        }
                      >
                        <Boxes className="size-3" />
                        <span className="hidden sm:inline">Movement</span>
                      </Button>
                    </div>
                  </div>

                  {/* Conditions Breakdown Strip */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className="text-muted-foreground font-medium">
                      Counted {formatSupplyNumber(String(totalUnits))} total units:
                    </span>

                    {conditionCounts['SELLABLE'] ? (
                      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40">
                        <CheckCircle2 className="size-3" />
                        <span>{formatSupplyNumber(String(conditionCounts['SELLABLE']))} Sellable</span>
                      </Badge>
                    ) : null}

                    {conditionCounts['DAMAGED'] ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="size-3" />
                        <span>{formatSupplyNumber(String(conditionCounts['DAMAGED']))} Damaged</span>
                      </Badge>
                    ) : null}

                    {conditionCounts['QUARANTINE'] ? (
                      <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 dark:text-amber-400">
                        <ShieldAlert className="size-3" />
                        <span>{formatSupplyNumber(String(conditionCounts['QUARANTINE']))} Quarantine</span>
                      </Badge>
                    ) : null}

                    {conditionCounts['INSPECTION'] ? (
                      <Badge variant="outline" className="gap-1 text-sky-600 border-sky-300 dark:text-sky-400">
                        <span>{formatSupplyNumber(String(conditionCounts['INSPECTION']))} Inspection</span>
                      </Badge>
                    ) : null}
                  </div>

                  {/* Packing Slip & Notes Details */}
                  {(receipt.packingSlipReference || receipt.notes) ? (
                    <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-1">
                      {receipt.packingSlipReference ? (
                        <p>
                          <strong className="text-foreground font-medium">Packing Slip / Delivery Note:</strong>{' '}
                          {receipt.packingSlipReference}
                        </p>
                      ) : null}
                      {receipt.notes ? (
                        <p>
                          <strong className="text-foreground font-medium">Receiver Notes:</strong>{' '}
                          {receipt.notes}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
