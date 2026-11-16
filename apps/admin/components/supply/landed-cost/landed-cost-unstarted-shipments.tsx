'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleDollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  loading,
}: LandedCostUnstartedShipmentsProps) {
  const isInitialLoading = Boolean(loading && shipments.length === 0);

  if (!isInitialLoading && shipments.length === 0) {
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
          Shipments Awaiting Landed Cost {isInitialLoading ? '' : `(${shipments.length})`}
        </h2>
        <p className="text-pretty text-xs text-muted-foreground">
          Receiving is verified. Open the shipment to start its worksheet and allocate all import
          charges.
        </p>
      </div>

      <div className={`grid gap-3 md:hidden ${loading && !isInitialLoading ? 'opacity-60 transition-opacity' : ''}`}>
        {isInitialLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <article key={i} className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-5 w-12 rounded-md" />
              </div>
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-9 w-full rounded-md" />
            </article>
          ))
        ) : (
          shipments.map((shipment) => {
            const totalReceivedUnits = shipment.allocations.reduce(
              (sum, allocation) => sum + Number(allocation.receivedQuantity),
              0,
            );
            const shipmentHref = canManageCost
              ? `/inbound-shipments/${shipment.id}?tab=costing&startCosting=1`
              : `/inbound-shipments/${shipment.id}?tab=costing`;
            return (
              <article key={shipment.id} className="rounded-xl border bg-card p-4 shadow-2xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={shipmentHref}
                      className="font-mono font-semibold text-primary hover:underline"
                    >
                      {shipment.shipmentNumber}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {shipment.receivingLocationName}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {shipment.currencyCode}
                  </Badge>
                </div>
                <p className="mt-3 font-mono text-xs text-muted-foreground tabular-nums">
                  {formatSupplyNumber(totalReceivedUnits.toString())} units ·{' '}
                  {shipment.allocations.length} variant lines
                </p>
                <Button
                  className="mt-4 w-full justify-between"
                  variant={canManageCost ? 'default' : 'outline'}
                  render={<Link href={shipmentHref} />}
                >
                  <span>{canManageCost ? 'Start Landed Cost' : 'Review Shipment'}</span>
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </article>
            );
          })
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-2xs md:block">
        <Table density="compact" stickyHeader>
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
          <TableBody className={loading && !isInitialLoading ? 'opacity-60 transition-opacity' : undefined}>
            {isInitialLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="text-xs">
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-28 ml-auto rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : (
              shipments.map((shipment) => {
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
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
