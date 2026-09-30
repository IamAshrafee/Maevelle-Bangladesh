'use client';

import {
  AlertTriangle,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  HelpCircle,
  Package,
  PackageCheck,
  PackageX,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  DeliveryAttemptOutcomeDto,
  DeliveryOperationalStatusDto,
  DeliveryOutcomeStatusDto,
  FulfillmentStatusDto,
  ReturnAuthorizationStatusDto,
  ReturnCaseStatusDto,
  ReturnInspectionStatusDto,
  ReturnReceiptStatusDto,
  ReturnTransportStatusDto,
} from '@maevelle/contracts';

/* -------------------------------------------------------------------------
 * Fulfillment Status Badge
 * ------------------------------------------------------------------------- */

export function FulfillmentStatusBadge({
  status,
  className,
}: {
  status: FulfillmentStatusDto | string;
  className?: string;
}) {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="outline" className={cn('gap-1 border-muted-foreground/30 text-muted-foreground', className)}>
          <Clock className="size-3" /> Draft
        </Badge>
      );
    case 'READY':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20', className)}>
          <Package className="size-3" /> Ready
        </Badge>
      );
    case 'PICKING':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', className)}>
          <Clock className="size-3" /> Picking
        </Badge>
      );
    case 'PACKED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20', className)}>
          <PackageCheck className="size-3" /> Packed
        </Badge>
      );
    case 'DISPATCHED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', className)}>
          <CheckCircle2 className="size-3" /> Dispatched
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <XCircle className="size-3" /> Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status.replaceAll('_', ' ')}
        </Badge>
      );
  }
}

/* -------------------------------------------------------------------------
 * Delivery Operational Status Badge
 * ------------------------------------------------------------------------- */

export function DeliveryStatusBadge({
  status,
  className,
}: {
  status: DeliveryOperationalStatusDto | string;
  className?: string;
}) {
  switch (status) {
    case 'READY':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', className)}>
          <Clock className="size-3" /> Needs booking
        </Badge>
      );
    case 'BOOKING':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 animate-pulse', className)}>
          <Truck className="size-3" /> Booking…
        </Badge>
      );
    case 'BOOKED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20', className)}>
          <PackageCheck className="size-3" /> Booked / Ready for handover
        </Badge>
      );
    case 'HANDED_OVER':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20', className)}>
          <Truck className="size-3" /> Handed over
        </Badge>
      );
    case 'IN_TRANSIT':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20', className)}>
          <Truck className="size-3" /> In transit
        </Badge>
      );
    case 'OUT_FOR_DELIVERY':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20 font-semibold', className)}>
          <Truck className="size-3" /> Out for delivery
        </Badge>
      );
    case 'DELIVERED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold', className)}>
          <CheckCircle2 className="size-3" /> Delivered
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive" className={cn('gap-1 font-semibold', className)}>
          <AlertTriangle className="size-3" /> Delivery failed
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="outline" className={cn('gap-1 text-muted-foreground', className)}>
          <XCircle className="size-3" /> Cancelled
        </Badge>
      );
    case 'RTO_INITIATED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 font-semibold', className)}>
          <RotateCcw className="size-3" /> RTO initiated
        </Badge>
      );
    case 'RETURNING':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20', className)}>
          <ArrowDownLeft className="size-3" /> Returning
        </Badge>
      );
    case 'RETURNED_TO_ORIGIN':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20', className)}>
          <PackageCheck className="size-3" /> Returned to origin
        </Badge>
      );
    case 'LOST':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <PackageX className="size-3" /> Lost in transit
        </Badge>
      );
    case 'DAMAGED':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <AlertTriangle className="size-3" /> Damaged
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status.replaceAll('_', ' ')}
        </Badge>
      );
  }
}

/* -------------------------------------------------------------------------
 * Delivery Outcome Status Badge
 * ------------------------------------------------------------------------- */

export function DeliveryOutcomeBadge({
  outcome,
  className,
}: {
  outcome?: DeliveryOutcomeStatusDto | string | null;
  className?: string;
}) {
  if (!outcome || outcome === 'PENDING') return null;
  switch (outcome) {
    case 'DELIVERED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]', className)}>
          <CheckCircle2 className="size-2.5" /> Outcome: Delivered
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive" className={cn('gap-1 text-[10px]', className)}>
          <XCircle className="size-2.5" /> Outcome: Failed
        </Badge>
      );
    case 'CANCELLED_BEFORE_HANDOVER':
      return (
        <Badge variant="outline" className={cn('gap-1 text-muted-foreground text-[10px]', className)}>
          Cancelled before handover
        </Badge>
      );
    case 'RETURNED_TO_ORIGIN':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20 text-[10px]', className)}>
          <RotateCcw className="size-2.5" /> Outcome: Returned
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={cn('text-[10px]', className)}>
          {outcome.replaceAll('_', ' ')}
        </Badge>
      );
  }
}

/* -------------------------------------------------------------------------
 * Delivery Attempt Outcome Badge
 * ------------------------------------------------------------------------- */

export function AttemptOutcomeBadge({
  outcome,
  className,
}: {
  outcome: DeliveryAttemptOutcomeDto | string;
  className?: string;
}) {
  switch (outcome) {
    case 'DELIVERED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', className)}>
          <CheckCircle2 className="size-3" /> Delivered
        </Badge>
      );
    case 'CUSTOMER_UNAVAILABLE':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400', className)}>
          <Clock className="size-3" /> Customer unavailable
        </Badge>
      );
    case 'CUSTOMER_REFUSED':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <XCircle className="size-3" /> Customer refused
        </Badge>
      );
    case 'ADDRESS_NOT_FOUND':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-rose-500/10 text-rose-700 dark:text-rose-400', className)}>
          <AlertTriangle className="size-3" /> Address not found
        </Badge>
      );
    case 'RESCHEDULE_REQUESTED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-sky-500/10 text-sky-700 dark:text-sky-400', className)}>
          <Clock className="size-3" /> Rescheduled
        </Badge>
      );
    case 'PHONE_UNREACHABLE':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400', className)}>
          <AlertTriangle className="size-3" /> Phone unreachable
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {outcome.replaceAll('_', ' ')}
        </Badge>
      );
  }
}

/* -------------------------------------------------------------------------
 * Return & Reverse Logistics Badges
 * ------------------------------------------------------------------------- */

export function ReturnCaseStatusBadge({
  status,
  className,
}: {
  status: ReturnCaseStatusDto | string;
  className?: string;
}) {
  switch (status) {
    case 'OPEN':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', className)}>
          <Clock className="size-3" /> Open
        </Badge>
      );
    case 'RESOLVED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', className)}>
          <CheckCircle2 className="size-3" /> Resolved
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <XCircle className="size-3" /> Cancelled
        </Badge>
      );
    default:
      return <Badge variant="outline" className={className}>{status}</Badge>;
  }
}

export function ReturnAuthStatusBadge({
  status,
  className,
}: {
  status: ReturnAuthorizationStatusDto | string;
  className?: string;
}) {
  switch (status) {
    case 'PENDING':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400', className)}>
          <Clock className="size-3" /> Auth pending
        </Badge>
      );
    case 'APPROVED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', className)}>
          <CheckCircle2 className="size-3" /> Authorized
        </Badge>
      );
    case 'PARTIALLY_APPROVED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-sky-500/10 text-sky-700 dark:text-sky-400', className)}>
          Partial auth
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <XCircle className="size-3" /> Auth rejected
        </Badge>
      );
    case 'NOT_REQUIRED':
      return (
        <Badge variant="outline" className={cn('text-muted-foreground', className)}>
          Not required (RTO)
        </Badge>
      );
    default:
      return <Badge variant="outline" className={className}>{status.replaceAll('_', ' ')}</Badge>;
  }
}

export function ReturnTransportStatusBadge({
  status,
  className,
}: {
  status: ReturnTransportStatusDto | string;
  className?: string;
}) {
  switch (status) {
    case 'EXPECTED':
      return (
        <Badge variant="outline" className={cn('gap-1 text-muted-foreground', className)}>
          <Clock className="size-3" /> Awaiting courier
        </Badge>
      );
    case 'IN_TRANSIT':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20', className)}>
          <Truck className="size-3" /> Returning
        </Badge>
      );
    case 'ARRIVED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold', className)}>
          <PackageCheck className="size-3" /> Arrived at warehouse
        </Badge>
      );
    case 'LOST':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <PackageX className="size-3" /> Lost in reverse transit
        </Badge>
      );
    default:
      return <Badge variant="outline" className={className}>{status.replaceAll('_', ' ')}</Badge>;
  }
}

export function ReturnReceiptStatusBadge({
  status,
  className,
}: {
  status: ReturnReceiptStatusDto | string;
  className?: string;
}) {
  switch (status) {
    case 'NOT_RECEIVED':
      return (
        <Badge variant="outline" className={cn('gap-1 text-muted-foreground', className)}>
          Awaiting receipt
        </Badge>
      );
    case 'PARTIALLY_RECEIVED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400', className)}>
          Partial receipt
        </Badge>
      );
    case 'RECEIVED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', className)}>
          <PackageCheck className="size-3" /> Received into inspection
        </Badge>
      );
    case 'DISCREPANCY':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <AlertTriangle className="size-3" /> Quantity discrepancy
        </Badge>
      );
    default:
      return <Badge variant="outline" className={className}>{status.replaceAll('_', ' ')}</Badge>;
  }
}

export function ReturnInspectionStatusBadge({
  status,
  className,
}: {
  status: ReturnInspectionStatusDto | string;
  className?: string;
}) {
  switch (status) {
    case 'PENDING':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400', className)}>
          <Clock className="size-3" /> Inspection pending
        </Badge>
      );
    case 'PARTIALLY_INSPECTED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-sky-500/10 text-sky-700 dark:text-sky-400', className)}>
          Partially inspected
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', className)}>
          <CheckCircle2 className="size-3" /> Inspected & dispositioned
        </Badge>
      );
    default:
      return <Badge variant="outline" className={className}>{status.replaceAll('_', ' ')}</Badge>;
  }
}

export function InventoryDispositionBadge({
  outcome,
  className,
}: {
  outcome: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'REJECTED_RETURN' | string;
  className?: string;
}) {
  switch (outcome) {
    case 'SELLABLE':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', className)}>
          <CheckCircle2 className="size-3" /> Restocked (Sellable)
        </Badge>
      );
    case 'DAMAGED':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20', className)}>
          <AlertTriangle className="size-3" /> Restocked (Damaged)
        </Badge>
      );
    case 'QUARANTINE':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', className)}>
          <Clock className="size-3" /> Quarantined
        </Badge>
      );
    case 'REJECTED_RETURN':
      return (
        <Badge variant="destructive" className={cn('gap-1', className)}>
          <XCircle className="size-3" /> Return rejected
        </Badge>
      );
    default:
      return <Badge variant="outline" className={className}>{outcome.replaceAll('_', ' ')}</Badge>;
  }
}

/* -------------------------------------------------------------------------
 * Customer Risk Badge
 * ------------------------------------------------------------------------- */

export function CustomerRiskBadge({
  level,
  className,
}: {
  level?: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED' | string | null;
  className?: string;
}) {
  if (!level) return null;
  switch (level) {
    case 'LOW':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', className)}>
          <ShieldCheck className="size-3" /> Reliable history
        </Badge>
      );
    case 'MODERATE':
      return (
        <Badge variant="secondary" className={cn('gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', className)}>
          <AlertTriangle className="size-3" /> Moderate risk
        </Badge>
      );
    case 'ELEVATED':
      return (
        <Badge variant="destructive" className={cn('gap-1 font-semibold', className)}>
          <ShieldAlert className="size-3" /> Elevated RTO risk
        </Badge>
      );
    case 'INSUFFICIENT_HISTORY':
    default:
      return (
        <Badge variant="outline" className={cn('gap-1 text-muted-foreground border-muted-foreground/30', className)}>
          <HelpCircle className="size-3" /> Limited history
        </Badge>
      );
  }
}
