'use client';

import { Check, Clock, Copy, Edit3, Plane, Ship, Train, Truck, Weight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSupplyDate, formatSupplyMoney, formatSupplyNumber } from '@/lib/supply/api';
import type { ShipmentDetailLogisticsCardProps } from './types';

function getTransportIcon(mode?: string) {
  const m = mode?.toUpperCase();
  if (m === 'AIR') return <Plane className="size-4 text-info" />;
  if (m === 'ROAD') return <Truck className="size-4 text-warning" />;
  if (m === 'RAIL') return <Train className="size-4 text-success" />;
  return <Ship className="size-4 text-info" />;
}

export function ShipmentDetailLogisticsCard({
  shipment,
  canManage,
  onOpenEdit,
}: ShipmentDetailLogisticsCardProps) {
  const [copied, setCopied] = useState(false);

  const copyTracking = () => {
    if (!shipment.trackingReference) return;
    void navigator.clipboard.writeText(shipment.trackingReference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Route & Carrier Card */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {getTransportIcon(shipment.transportMode)}
              <span>Freight & Route</span>
            </CardTitle>
            {canManage && shipment.status !== 'CANCELLED' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={onOpenEdit}
              >
                <Edit3 className="size-3" />
                <span>Edit</span>
              </Button>
            ) : null}
          </div>
          <CardDescription className="text-xs">
            Physical logistics routing, carrier references, and transit modality.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-xs">
          <div className="grid gap-1">
            <span className="text-muted-foreground">Transport Mode:</span>
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Badge variant="secondary" className="text-xs font-normal">
                {shipment.transportMode} FREIGHT
              </Badge>
            </div>
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground">Tracking / Bill of Lading / AWB:</span>
            {shipment.trackingReference ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {shipment.trackingReference}
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={copyTracking}
                        className="inline-flex text-muted-foreground hover:text-foreground cursor-pointer"
                      />
                    }
                  >
                    {copied ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {copied ? 'Copied' : 'Copy tracking #'}
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <span className="italic text-muted-foreground">Not assigned yet</span>
            )}
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground">Origin Port / Location:</span>
            <span className="font-medium text-foreground">
              {shipment.originText || (
                <span className="italic text-muted-foreground">Not specified</span>
              )}
            </span>
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground">Destination Warehouse:</span>
            <span className="font-medium text-foreground">{shipment.receivingLocationName}</span>
          </div>

          {shipment.providerReference ? (
            <div className="grid gap-1">
              <span className="text-muted-foreground">Provider batch:</span>
              <span className="font-mono font-semibold text-foreground">
                {shipment.providerReference}
              </span>
            </div>
          ) : null}

          {shipment.grossWeight || shipment.chargeableWeight ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
                <Weight className="size-3.5 text-primary" /> Freight measurement
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-muted-foreground">Gross / received</span>
                  <span className="font-mono tabular-nums">
                    {shipment.grossWeight
                      ? `${formatSupplyNumber(shipment.grossWeight)} ${shipment.weightUnit ?? 'KG'}`
                      : 'Not recorded'}
                  </span>
                </div>
                <div>
                  <span className="block text-muted-foreground">Chargeable</span>
                  <span className="font-mono tabular-nums">
                    {shipment.chargeableWeight
                      ? `${formatSupplyNumber(shipment.chargeableWeight)} ${shipment.weightUnit ?? 'KG'}`
                      : 'Not recorded'}
                  </span>
                </div>
                {shipment.freightRate ? (
                  <div>
                    <span className="block text-muted-foreground">Rate</span>
                    <span className="font-mono tabular-nums">
                      {formatSupplyMoney(shipment.freightRate, shipment.currencyCode)}{' '}
                      {shipment.freightRateUnit === 'FLAT'
                        ? 'flat'
                        : shipment.freightRateUnit === 'PER_LB'
                          ? '/ lb'
                          : '/ kg'}
                    </span>
                  </div>
                ) : null}
                {shipment.reportedFreightAmount ? (
                  <div>
                    <span className="block text-muted-foreground">Provider charge</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatSupplyMoney(shipment.reportedFreightAmount, shipment.currencyCode)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Schedule & Concurrency Card */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" />
            <span>Schedule & Concurrency</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Transit timeline milestones and immutable ledger audit versioning.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-xs">
          <div className="grid gap-1">
            <span className="text-muted-foreground">Creation Timestamp:</span>
            <span className="font-medium text-foreground">
              {formatSupplyDate(shipment.createdAt)}
            </span>
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground">Expected Arrival Date (ETA):</span>
            <span className="font-medium text-foreground">
              {shipment.expectedArrivalDate ? (
                formatSupplyDate(shipment.expectedArrivalDate)
              ) : (
                <span className="italic text-muted-foreground">Unscheduled</span>
              )}
            </span>
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground">Freight Departure:</span>
            <span className="font-medium text-foreground">
              {shipment.departedAt ? (
                <span className="font-semibold text-info">
                  Departed on {formatSupplyDate(shipment.departedAt)}
                </span>
              ) : (
                <span className="italic text-muted-foreground">Pending departure</span>
              )}
            </span>
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground">Actual Dock Arrival:</span>
            <span className="font-medium text-foreground">
              {shipment.arrivedAt ? (
                <span className="font-semibold text-success">
                  Arrived on {formatSupplyDate(shipment.arrivedAt)}
                </span>
              ) : (
                <span className="italic text-muted-foreground">Pending dock arrival</span>
              )}
            </span>
          </div>

          <div className="grid gap-1">
            <span className="text-muted-foreground">Concurrency Version:</span>
            <span className="font-mono font-medium text-foreground">
              v{shipment.version} (optimistic locking enforced)
            </span>
          </div>

          {shipment.events.length ? (
            <div className="border-t pt-3">
              <p className="mb-2 font-semibold text-foreground">Milestone timeline</p>
              <ol className="space-y-2">
                {[...shipment.events].reverse().map((event) => (
                  <li key={event.id} className="border-l-2 border-primary/30 pl-3">
                    <p className="font-medium text-foreground">{event.title}</p>
                    <p className="text-muted-foreground">
                      {formatSupplyDate(event.occurredAt)}
                      {event.locationText ? ` · ${event.locationText}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
