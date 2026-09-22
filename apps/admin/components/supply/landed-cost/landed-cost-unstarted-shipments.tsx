'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Package,
  Plus,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSupplyNumber } from '@/lib/supply/api';
import type { LandedCostUnstartedShipmentsProps } from './types';

export function LandedCostUnstartedShipments({
  shipments,
  canManageCost,
  busy,
  onStartLandedCost,
}: LandedCostUnstartedShipmentsProps) {
  if (shipments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-6" />
        </div>
        <h3 className="mt-3 font-heading text-base font-semibold">
          All Received Shipments Have Landed Cost Worksheets
        </h3>
        <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
          Every arrived shipment with verified dock counts already has an active or finalized landed-cost worksheet. Newly received shipments will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-sm font-semibold">
            Shipments Awaiting Landed Cost Valuation ({shipments.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Physical receiving is verified at the dock. Start a worksheet to allocate freight, customs, and port clearance into unit stock.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="font-semibold">Shipment</TableHead>
              <TableHead className="font-semibold">Receiving Dock</TableHead>
              <TableHead className="font-semibold">Currency</TableHead>
              <TableHead className="text-right font-semibold">Verified Cargo Units</TableHead>
              <TableHead className="font-semibold">SKU Allocations</TableHead>
              <TableHead className="text-right font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((shipment) => {
              const totalReceivedUnits = shipment.allocations.reduce(
                (sum, a) => sum + Number(a.receivedQuantity),
                0,
              );

              return (
                <TableRow key={shipment.id} className="text-xs hover:bg-muted/50">
                  {/* Column 1: Shipment Number */}
                  <TableCell className="font-medium">
                    <Link
                      href={`/inbound-shipments/${shipment.id}`}
                      className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                    >
                      <Truck className="size-3.5 shrink-0" />
                      <span>{shipment.shipmentNumber}</span>
                      <ArrowUpRight className="size-2.5 opacity-60" />
                    </Link>
                  </TableCell>

                  {/* Column 2: Dock */}
                  <TableCell>
                    <span className="text-foreground/80">{shipment.receivingLocationName}</span>
                  </TableCell>

                  {/* Column 3: Currency */}
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {shipment.currencyCode}
                    </Badge>
                  </TableCell>

                  {/* Column 4: Verified Units */}
                  <TableCell className="text-right font-mono font-semibold">
                    {formatSupplyNumber(totalReceivedUnits.toString())} units
                  </TableCell>

                  {/* Column 5: SKU Allocations */}
                  <TableCell>
                    <span className="text-muted-foreground">
                      {shipment.allocations.length} line{shipment.allocations.length === 1 ? '' : 's'}
                    </span>
                  </TableCell>

                  {/* Column 6: Action CTA */}
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => onStartLandedCost(shipment)}
                      disabled={!canManageCost || busy}
                      className="gap-1.5 shadow-xs"
                    >
                      <CircleDollarSign className="size-3.5" />
                      <span>Start Landed Cost</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
