'use client';

import {
  Calendar,
  Check,
  CircleDollarSign,
  Copy,
  HelpCircle,
  MapPin,
  PackageCheck,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import {
  Stats,
  StatsCard,
  StatsDescription,
  StatsTitle,
  StatsValue,
} from '@/components/ui/stats';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  formatSupplyDate,
  formatSupplyMoney,
  formatSupplyNumber,
} from '@/lib/supply/api';
import { percentage, shipmentQuantities } from '@/lib/supply/status';
import type { ShipmentDetailStatsProps } from './types';

export function ShipmentDetailStats({ shipment, worksheet }: ShipmentDetailStatsProps) {
  const [copiedTracking, setCopiedTracking] = useState(false);
  const totals = shipmentQuantities(shipment);
  const receivedPct = percentage(totals.received, totals.expected);
  const remaining = totals.expected - totals.received;

  // Calculate total commercial cargo value
  const totalValue = shipment.allocations.reduce((sum, alloc) => {
    const price = Number(alloc.unitPrice ?? 0);
    const qty = Number(alloc.allocatedQuantity ?? 0);
    return sum + price * qty;
  }, 0);

  const uniquePurchases = new Set(shipment.allocations.map((a) => a.purchaseId)).size;

  const copyTracking = () => {
    if (!shipment.trackingReference) return;
    void navigator.clipboard.writeText(shipment.trackingReference);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  return (
    <Stats className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Receiving Progress */}
      <StatsCard>
        <div className="flex items-center justify-between">
          <StatsTitle>Physical Receiving</StatsTitle>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
              <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">
              Quantity counted and verified at destination dock into on-hand inventory.
            </TooltipContent>
          </Tooltip>
        </div>
        <StatsValue>
          {formatSupplyNumber(String(totals.received))}
          <span className="text-xs font-normal text-muted-foreground">
            {' '}/ {formatSupplyNumber(String(totals.expected))}
          </span>
        </StatsValue>
        <div className="mt-1.5 space-y-1">
          <Progress value={receivedPct} className="h-1.5" />
          <StatsDescription>
            {receivedPct}% received ·{' '}
            {remaining > 0 ? (
              <span>{formatSupplyNumber(String(remaining))} units remaining</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">All units accounted for</span>
            )}
          </StatsDescription>
        </div>
      </StatsCard>

      {/* 2. Commercial Cargo Value */}
      <StatsCard>
        <div className="flex items-center justify-between">
          <StatsTitle>Cargo Value</StatsTitle>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
              <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">
              Purchase contract value of goods consolidated into this physical container.
            </TooltipContent>
          </Tooltip>
        </div>
        <StatsValue>
          {totalValue > 0 ? (
            formatSupplyMoney(String(totalValue), shipment.currencyCode)
          ) : (
            <span className="text-sm font-normal text-muted-foreground">Value in PO lines</span>
          )}
        </StatsValue>
        <StatsDescription>
          {shipment.allocations.length}{' '}
          {shipment.allocations.length === 1 ? 'item line' : 'item lines'} across {uniquePurchases}{' '}
          {uniquePurchases === 1 ? 'purchase order' : 'purchase orders'}
        </StatsDescription>
      </StatsCard>

      {/* 3. Destination Warehouse */}
      <StatsCard>
        <div className="flex items-center justify-between">
          <StatsTitle>Destination Warehouse</StatsTitle>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
              <HelpCircle className="size-3 text-muted-foreground/60 hover:text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">
              Warehouse receiving dock where container will be unsealed and checked into stock.
            </TooltipContent>
          </Tooltip>
        </div>
        <StatsValue className="text-base truncate">{shipment.receivingLocationName}</StatsValue>
        <StatsDescription>
          Inventory receiving dock · {shipment.currencyCode} valuation
        </StatsDescription>
      </StatsCard>

      {/* 4. Tracking & ETA */}
      <StatsCard>
        <div className="flex items-center justify-between">
          <StatsTitle>Tracking & Schedule</StatsTitle>
          {shipment.trackingReference ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={copyTracking}
                    className="inline-flex text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
                  />
                }
              >
                {copiedTracking ? (
                  <Check className="size-3 text-emerald-600" />
                ) : (
                  <Copy className="size-3" />
                )}
              </TooltipTrigger>
              <TooltipContent side="top">
                {copiedTracking ? 'Copied tracking #' : 'Copy tracking reference'}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <StatsValue className="text-sm font-mono truncate">
          {shipment.trackingReference ?? 'No tracking #'}
        </StatsValue>
        <StatsDescription>
          {shipment.arrivedAt
            ? `Arrived: ${formatSupplyDate(shipment.arrivedAt)}`
            : shipment.expectedArrivalDate
              ? `ETA: ${formatSupplyDate(shipment.expectedArrivalDate)}`
              : 'ETA not scheduled'}
        </StatsDescription>
      </StatsCard>
    </Stats>
  );
}
