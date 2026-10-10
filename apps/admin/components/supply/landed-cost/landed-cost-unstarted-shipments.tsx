'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleDollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
}: LandedCostUnstartedShipmentsProps) {
  if (shipments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/60 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 aria-hidden="true" className="size-6" />
        </div>
        <h3 className="mt-3 text-pretty font-heading text-base font-semibold">
          Every Received Shipment Has a Worksheet
        </h3>
        <p className="mt-1 max-w-md text-pretty text-xs leading-relaxed text-muted-foreground">
          Newly received shipments will appear here automatically when they are ready for landed
          cost.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="awaiting-costing-title">
      <div>
        <h2 id="awaiting-costing-title" className="font-heading text-sm font-semibold">
          Shipments Awaiting Landed Cost ({shipments.length})
        </h2>
        <p className="text-pretty text-xs text-muted-foreground">
          Receiving is verified. Open the shipment to start its worksheet and allocate all import
          charges.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs">
              <TableHead className="font-semibold">Shipment</TableHead>
              <TableHead className="font-semibold">Receiving Location</TableHead>
              <TableHead className="font-semibold">Currency</TableHead>
              <TableHead className="text-right font-semibold">Received Units</TableHead>
              <TableHead className="text-right font-semibold">Variant Lines</TableHead>
              <TableHead className="text-right font-semibold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((shipment) => {
              const totalReceivedUnits = shipment.allocations.reduce(
                (sum, allocation) => sum + Number(allocation.receivedQuantity),
                0,
              );
              const shipmentHref = canManageCost
                ? `/inbound-shipments/${shipment.id}?tab=costing&startCosting=1`
                : `/inbound-shipments/${shipment.id}?tab=costing`;

              return (
                <TableRow key={shipment.id} className="text-xs hover:bg-muted/40">
                  <TableCell>
                    <Link
                      href={shipmentHref}
                      className="font-mono font-semibold text-primary hover:underline"
                    >
                      {shipment.shipmentNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-56 truncate">
                      {shipment.receivingLocationName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {shipment.currencyCode}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {formatSupplyNumber(totalReceivedUnits.toString())}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {shipment.allocations.length}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={canManageCost ? 'default' : 'outline'}
                      render={<Link href={shipmentHref} />}
                      className="gap-1.5 whitespace-nowrap"
                    >
                      <CircleDollarSign aria-hidden="true" className="size-3.5" />
                      <span>{canManageCost ? 'Start in Shipment' : 'Review Shipment'}</span>
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
