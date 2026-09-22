'use client';

import Link from 'next/link';
import {
  Boxes,
  Check,
  CircleDollarSign,
  Copy,
  Edit3,
  ExternalLink,
  PackageCheck,
  Plane,
  Ship,
  Train,
  Truck,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ShipmentDetailHeaderProps } from './types';

const SHIPMENT_STATUS_EXPLANATIONS: Record<string, string> = {
  PLANNED: 'Cargo has been allocated to this shipment. Awaiting carrier pickup and port departure.',
  IN_TRANSIT: 'Shipment has departed origin and is currently en route via freight carrier.',
  ARRIVED: 'Shipment has docked at the receiving warehouse dock. Awaiting physical count verification.',
  CANCELLED: 'Shipment was cancelled before departure. All allocated quantities were released.',
};

const RECEIVING_STATUS_EXPLANATIONS: Record<string, string> = {
  NOT_RECEIVED: 'No physical receiving vouchers posted yet. Stock remains uncounted.',
  PARTIALLY_RECEIVED: 'Some items have been counted and posted to warehouse inventory. Remainder pending.',
  RECEIVED: 'All expected items have been physically verified and booked into warehouse stock.',
};

function getTransportModeIcon(mode?: string) {
  const m = mode?.toUpperCase();
  if (m === 'AIR') return <Plane className="size-3.5 text-sky-500" />;
  if (m === 'ROAD') return <Truck className="size-3.5 text-amber-500" />;
  if (m === 'RAIL') return <Train className="size-3.5 text-emerald-500" />;
  return <Ship className="size-3.5 text-blue-500" />;
}

export function ShipmentDetailHeader({
  shipment,
  canManage,
  canReceive,
  canManageCost,
  busy,
  worksheet,
  onDepart,
  onArrive,
  onOpenReceive,
  onOpenEdit,
  onOpenCancel,
  onOpenStartWorksheet,
}: ShipmentDetailHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyShipmentNumber = () => {
    void navigator.clipboard.writeText(shipment.shipmentNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine current lifecycle step (1 to 5)
  let currentStep = 1;
  if (shipment.status === 'IN_TRANSIT') currentStep = 2;
  else if (shipment.status === 'ARRIVED') {
    if (shipment.receivingStatus === 'RECEIVED') {
      currentStep = worksheet?.status === 'FINALIZED' ? 5 : 4;
    } else {
      currentStep = 3;
    }
  } else if (shipment.status === 'CANCELLED') {
    currentStep = 0;
  }

  const steps = [
    { number: 1, label: 'Planned' },
    { number: 2, label: 'In Transit' },
    { number: 3, label: 'Dock Arrived' },
    { number: 4, label: 'Received to Stock' },
    { number: 5, label: 'Cost Finalized' },
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Shipments', href: '/inbound-shipments' },
          { label: shipment.shipmentNumber, current: true },
        ]}
      />

      {/* Main Header Bar */}
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {shipment.shipmentNumber}
            </h1>

            {/* Quick Copy Button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={copyShipmentNumber}
                  />
                }
              >
                {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              </TooltipTrigger>
              <TooltipContent side="top">
                {copied ? 'Copied to clipboard!' : 'Copy shipment number'}
              </TooltipContent>
            </Tooltip>

            {/* Status Badges with Tooltips */}
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <StatusBadge status={shipment.status} />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {SHIPMENT_STATUS_EXPLANATIONS[shipment.status] ?? shipment.status}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <StatusBadge status={shipment.receivingStatus} />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {RECEIVING_STATUS_EXPLANATIONS[shipment.receivingStatus] ?? shipment.receivingStatus}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Route & Transport Subtext */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="gap-1 px-2 py-0.5 text-xs font-normal">
              {getTransportModeIcon(shipment.transportMode)}
              <span>{shipment.transportMode} Freight</span>
            </Badge>
            <span>·</span>
            <span>
              {shipment.originText ? `${shipment.originText} → ` : 'Origin → '}
              <strong className="font-medium text-foreground">{shipment.receivingLocationName}</strong>
            </span>
            {shipment.trackingReference ? (
              <>
                <span>·</span>
                <span className="font-mono text-xs">Tracking: {shipment.trackingReference}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Action 1: Record Departure (when PLANNED) */}
          {shipment.status === 'PLANNED' && canManage ? (
            <Button disabled={busy} onClick={onDepart} className="gap-1.5 shadow-sm">
              <Truck className="size-4" />
              <span>Record Departure</span>
            </Button>
          ) : null}

          {/* Action 2: Record Arrival (when IN_TRANSIT) */}
          {shipment.status === 'IN_TRANSIT' && canManage ? (
            <Button disabled={busy} onClick={onArrive} className="gap-1.5 shadow-sm">
              <PackageCheck className="size-4" />
              <span>Mark Arrived at Dock</span>
            </Button>
          ) : null}

          {/* Action 3: Receive Goods (when ARRIVED and not fully received) */}
          {shipment.status === 'ARRIVED' &&
          shipment.receivingStatus !== 'RECEIVED' &&
          canReceive ? (
            <Button onClick={onOpenReceive} className="gap-1.5 shadow-sm">
              <PackageCheck className="size-4" />
              <span>Receive Goods</span>
            </Button>
          ) : null}

          {/* Action 4: Landed Cost (when RECEIVED) */}
          {shipment.receivingStatus === 'RECEIVED' && canManageCost ? (
            !worksheet ? (
              <Button onClick={onOpenStartWorksheet} className="gap-1.5 shadow-sm">
                <CircleDollarSign className="size-4" />
                <span>Start Landed Cost</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                render={<Link href={`/landed-cost?shipment=${shipment.id}`} />}
                className="gap-1.5 shadow-sm"
              >
                <CircleDollarSign className="size-4" />
                <span>Landed Cost Console</span>
              </Button>
            )
          ) : null}

          {/* Action 5: Edit Logistics (when not cancelled) */}
          {shipment.status !== 'CANCELLED' && canManage ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="outline" size="sm" onClick={onOpenEdit} disabled={busy} />
                }
              >
                <Edit3 className="size-3.5" />
                <span>Edit Logistics</span>
              </TooltipTrigger>
              <TooltipContent side="top">Update tracking #, ETA, origin port, or transport mode</TooltipContent>
            </Tooltip>
          ) : null}

          {/* Action 6: Cancel Shipment (when PLANNED) */}
          {shipment.status === 'PLANNED' && canManage ? (
            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={onOpenCancel} disabled={busy}>
              <XCircle className="size-3.5" />
              <span>Cancel</span>
            </Button>
          ) : null}

          {/* Secondary Links */}
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href={`/inventory/history?q=${encodeURIComponent(shipment.shipmentNumber)}`} />
            }
          >
            <Boxes className="size-3.5" />
            <span className="hidden sm:inline">Inventory Movements</span>
          </Button>
        </div>
      </header>

      {/* Logistics Lifecycle Stepper */}
      {shipment.status !== 'CANCELLED' ? (
        <div className="rounded-xl border bg-card/60 p-3 shadow-xs">
          <div className="grid grid-cols-5 gap-2 text-center">
            {steps.map((step) => {
              const isDone = step.number < currentStep;
              const isCurrent = step.number === currentStep;

              return (
                <div key={step.number} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      isDone
                        ? 'bg-primary text-primary-foreground'
                        : isCurrent
                          ? 'border-2 border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/20'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check className="size-3.5" /> : step.number}
                  </div>
                  <span
                    className={`text-[11px] leading-tight ${
                      isCurrent
                        ? 'font-semibold text-foreground'
                        : isDone
                          ? 'font-medium text-foreground/80'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
          <XCircle className="size-4 shrink-0" />
          <span>This shipment has been cancelled. Purchase line quantities were returned to unallocated stock.</span>
        </div>
      )}
    </div>
  );
}
