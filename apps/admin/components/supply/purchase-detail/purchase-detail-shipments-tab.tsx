'use client';

import Link from 'next/link';
import { ExternalLink, Plane, Ship, Truck } from 'lucide-react';
import type { InboundShipmentDto, PurchaseDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatSupplyDate } from '@/lib/supply/api';
import { purchaseQuantities } from '@/lib/supply/status';

export interface PurchaseDetailShipmentsTabProps {
  readonly purchase: PurchaseDto;
  readonly shipments: readonly InboundShipmentDto[];
  readonly canManageShipments: boolean;
  readonly onPlanShipmentClick?: (() => void) | undefined;
}

function getTransportIcon(mode?: string) {
  const m = mode?.toUpperCase();
  if (m === 'AIR' || m === 'EXPRESS') return <Plane className="size-3.5 text-sky-600 dark:text-sky-400" />;
  if (m === 'ROAD' || m === 'COURIER') return <Truck className="size-3.5 text-amber-600 dark:text-amber-400" />;
  return <Ship className="size-3.5 text-primary" />;
}

export function PurchaseDetailShipmentsTab({
  purchase,
  shipments,
  canManageShipments,
  onPlanShipmentClick,
}: PurchaseDetailShipmentsTabProps) {
  const totals = purchaseQuantities(purchase);
  const unallocatedCount = totals.ordered - totals.allocated;

  if (shipments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center sm:p-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Ship className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 font-heading text-base font-semibold">No shipments planned yet</h3>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {purchase.status === 'DRAFT'
            ? 'Place this purchase order to lock items and enable inbound freight shipment planning.'
            : purchase.status === 'CANCELLED'
              ? 'This purchase order was cancelled. No freight shipments can be planned.'
              : 'Allocate ordered items to inbound freight shipments when vendor dispatch details are ready.'}
        </p>
        {purchase.status === 'PLACED' && canManageShipments ? (
          onPlanShipmentClick ? (
            <Button className="mt-5 gap-1.5" onClick={onPlanShipmentClick}>
              <Ship className="size-4" />
              <span>Plan first shipment</span>
            </Button>
          ) : (
            <Button
              className="mt-5 gap-1.5"
              render={<Link href={`/inbound-shipments?create=shipment&purchase=${purchase.id}`} />}
            >
              <Ship className="size-4" />
              <span>Plan first shipment</span>
            </Button>
          )
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Inbound Shipments ({shipments.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            {unallocatedCount > 0
              ? `${unallocatedCount} ordered units still need shipment assignment.`
              : 'All ordered items from this purchase are assigned to inbound shipments.'}
          </p>
        </div>
        {purchase.status === 'PLACED' && canManageShipments && unallocatedCount > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                onPlanShipmentClick ? (
                  <Button
                    size="sm"
                    onClick={onPlanShipmentClick}
                    className="gap-1.5"
                  />
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    render={
                      <Link href={`/inbound-shipments?create=shipment&purchase=${purchase.id}`} />
                    }
                  />
                )
              }
            >
              <Ship className="size-3.5" />
              <span>Plan shipment ({unallocatedCount} left)</span>
            </TooltipTrigger>
            <TooltipContent side="top">
              Create an inbound shipment for the remaining {unallocatedCount} units
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Shipment Number</TableHead>
              <TableHead>Transport Mode</TableHead>
              <TableHead>Destination Warehouse</TableHead>
              <TableHead>Expected Arrival</TableHead>
              <TableHead>Freight Status</TableHead>
              <TableHead>Receiving Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((shipment) => (
              <TableRow key={shipment.id} className="group">
                {/* Shipment Number */}
                <TableCell className="font-medium">
                  <Link
                    href={`/inbound-shipments/${shipment.id}`}
                    className="inline-flex items-center gap-1 text-foreground hover:underline"
                  >
                    <span>{shipment.shipmentNumber}</span>
                    <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                  {shipment.trackingReference ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Track: {shipment.trackingReference}
                    </p>
                  ) : null}
                </TableCell>

                {/* Transport Mode */}
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {getTransportIcon(shipment.transportMode)}
                    <span className="text-xs font-medium capitalize">{shipment.transportMode.toLowerCase()}</span>
                  </div>
                </TableCell>

                {/* Receiving Location */}
                <TableCell className="text-muted-foreground text-xs">
                  {shipment.receivingLocationName || 'Default Warehouse'}
                </TableCell>

                {/* Expected Arrival */}
                <TableCell className="text-xs tabular-nums">
                  {formatSupplyDate(shipment.expectedArrivalDate)}
                </TableCell>

                {/* Shipment Status */}
                <TableCell>
                  <StatusBadge status={shipment.status} />
                </TableCell>

                {/* Receiving Status */}
                <TableCell>
                  <StatusBadge status={shipment.receivingStatus} />
                </TableCell>

                {/* Link */}
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link href={`/inbound-shipments/${shipment.id}`} />}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
