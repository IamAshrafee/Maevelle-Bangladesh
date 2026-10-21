'use client';

import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  User,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  Wrench,
  Boxes,
  Truck,
  RotateCcw,
  Ban,
  PackageCheck,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import type {
  UnitConditionDto,
  UnitEventDto,
  UnitEventTypeDto,
  UnitStatusDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { UnitStatusBadge } from './unit-status-badge';
import { UnitConditionBadge } from './unit-condition-badge';

export interface UnitEventTimelineProps {
  readonly events: readonly UnitEventDto[];
  readonly loading?: boolean;
}

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-BD', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function getEventIcon(type: UnitEventTypeDto) {
  switch (type) {
    case 'REGISTERED':
      return <PackageCheck className="size-3.5 text-primary" />;
    case 'INSPECTED':
    case 'RETURN_INSPECTED':
      return <ShieldCheck className="size-3.5 text-info" />;
    case 'LOCATION_MOVED':
      return <Boxes className="size-3.5 text-muted-foreground" />;
    case 'REPACKAGED':
      return <Tag className="size-3.5 text-muted-foreground" />;
    case 'REPAIR_REQUESTED':
    case 'REPAIR_STARTED':
    case 'REPAIR_COMPLETED':
      return <Wrench className="size-3.5 text-warning" />;
    case 'RELEASED_FOR_SALE':
      return <CheckCircle className="size-3.5 text-success" />;
    case 'QUARANTINED':
      return <AlertTriangle className="size-3.5 text-warning" />;
    case 'ALLOCATED_TO_FULFILLMENT':
    case 'RELEASED_FROM_FULFILLMENT':
    case 'PICKED':
    case 'PACKED':
      return <Tag className="size-3.5 text-info" />;
    case 'DISPATCHED':
      return <Truck className="size-3.5 text-success" />;
    case 'RETURNED':
      return <RotateCcw className="size-3.5 text-warning" />;
    case 'WRITTEN_OFF':
      return <Ban className="size-3.5 text-destructive" />;
    default:
      return <Clock className="size-3.5 text-muted-foreground" />;
  }
}

const UNIT_STATUSES = new Set<UnitStatusDto>([
  'AWAITING_QC',
  'AVAILABLE',
  'RESERVED',
  'IN_FULFILLMENT',
  'IN_TRANSFER',
  'DISPATCHED',
  'ON_HOLD',
  'RETURNED',
  'WRITTEN_OFF',
]);

const UNIT_CONDITIONS = new Set<UnitConditionDto>([
  'GRADE_A',
  'GRADE_B',
  'REPAIR_REQUIRED',
  'DAMAGED_UNSELLABLE',
]);

function isUnitStatus(value: string): value is UnitStatusDto {
  return UNIT_STATUSES.has(value as UnitStatusDto);
}

function isUnitCondition(value: string): value is UnitConditionDto {
  return UNIT_CONDITIONS.has(value as UnitConditionDto);
}

function formatMetadataLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function StatusValue({ value }: { readonly value: string }) {
  return isUnitStatus(value) ? (
    <UnitStatusBadge status={value} />
  ) : (
    <span className="font-mono text-[11px] text-foreground">{value.replaceAll('_', ' ')}</span>
  );
}

function ConditionValue({ value }: { readonly value: string }) {
  return isUnitCondition(value) ? (
    <UnitConditionBadge condition={value} short />
  ) : (
    <span className="font-mono text-[11px] text-foreground">{value.replaceAll('_', ' ')}</span>
  );
}

function getEventTitle(event: UnitEventDto): string {
  switch (event.eventType) {
    case 'REGISTERED':
      return 'Unit Registered';
    case 'INSPECTED':
      return event.toCondition
        ? `Quality Inspection (${event.toCondition.replaceAll('_', ' ')})`
        : 'Quality Inspection';
    case 'RETURN_INSPECTED':
      return 'Return Intake Inspection';
    case 'LOCATION_MOVED':
      return 'Storage Location Moved';
    case 'REPACKAGED':
      return 'Packaging & Notes Updated';
    case 'REPAIR_REQUESTED':
      return 'Sent to Repair Queue';
    case 'REPAIR_STARTED':
      return 'Repair Work Commenced';
    case 'REPAIR_COMPLETED':
      return 'Repair Completed';
    case 'RELEASED_FOR_SALE':
      return 'Approved & Released for Sale';
    case 'QUARANTINED':
      return 'Placed on Quarantine Hold';
    case 'ALLOCATED_TO_FULFILLMENT':
      return 'Allocated to Order Fulfillment';
    case 'RELEASED_FROM_FULFILLMENT':
      return 'Released from Order Fulfillment';
    case 'PICKED':
      return 'Picked for Packaging';
    case 'PACKED':
      return 'Packed into Shipping Parcel';
    case 'DISPATCHED':
      return 'Dispatched to Customer';
    case 'RETURNED':
      return 'Returned & Quarantined';
    case 'WRITTEN_OFF':
      return 'Authorized Write-Off';
    case 'AUTHORIZED_CORRECTION':
      return 'Authorized Inventory Correction';
    default:
      return event.eventType.replaceAll('_', ' ');
  }
}

export function UnitEventTimeline({ events, loading = false }: UnitEventTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground animate-pulse">
        Loading unit history timeline…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-card">
        No recorded lifecycle events found for this unit.
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
      {events.map((event) => {
        const isExpanded = !!expandedIds[event.id];
        const hasMetadata =
          (event.metadata && Object.keys(event.metadata).length > 0) ||
          event.reason ||
          event.fromStatus ||
          event.toStatus;

        return (
          <div key={event.id} className="relative group">
            {/* Dot marker */}
            <div className="absolute -left-6 top-1.5 size-5 rounded-full border bg-card flex items-center justify-center shadow-2xs group-hover:border-primary transition-colors">
              {getEventIcon(event.eventType)}
            </div>

            {/* Event Item Card */}
            <div className="rounded-lg border bg-card p-3.5 shadow-2xs transition-colors hover:border-border/80">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2">
                    <span>{getEventTitle(event)}</span>
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1 font-mono text-[11px]">
                      <Calendar className="size-3" />
                      {formatDate(event.createdAt)}
                    </span>
                    {event.actorId ? (
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        <span className="capitalize">{event.actorType.toLowerCase()}</span>
                      </span>
                    ) : null}
                    {event.referenceType && event.referenceId ? (
                      <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-foreground/80">
                        {event.referenceType}: {event.referenceId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </div>
                </div>

                {hasMetadata ? (
                  <Button
                    onClick={() => toggleExpand(event.id)}
                    variant="ghost"
                    size="xs"
                    aria-expanded={isExpanded}
                  >
                    <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                    {isExpanded ? (
                      <ChevronUp className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                  </Button>
                ) : null}
              </div>

              {/* Status / Condition transitions */}
              {event.fromStatus || event.toStatus || event.fromCondition || event.toCondition ? (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t text-xs">
                  {event.fromStatus || event.toStatus ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-[11px]">Status:</span>
                      {event.fromStatus ? <StatusValue value={event.fromStatus} /> : null}
                      {event.fromStatus && event.toStatus ? (
                        <ArrowRight className="size-2.5" />
                      ) : null}
                      {event.toStatus ? <StatusValue value={event.toStatus} /> : null}
                    </div>
                  ) : null}

                  {event.fromCondition || event.toCondition ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-[11px]">Condition:</span>
                      {event.fromCondition ? <ConditionValue value={event.fromCondition} /> : null}
                      {event.fromCondition && event.toCondition ? (
                        <ArrowRight className="size-2.5" />
                      ) : null}
                      {event.toCondition ? <ConditionValue value={event.toCondition} /> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Reason / Notes */}
              {event.reason ? (
                <p className="mt-2 text-xs text-muted-foreground bg-muted/40 p-2 rounded border border-border/50">
                  <strong className="text-foreground font-medium">Note / Reason:</strong>{' '}
                  {event.reason}
                </p>
              ) : null}

              {/* Expanded structured metadata */}
              {isExpanded && event.metadata && Object.keys(event.metadata).length > 0 ? (
                <div className="mt-3 pt-2 border-t">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    Operational evidence
                  </p>
                  <dl className="grid gap-x-4 gap-y-1.5 rounded-md bg-muted/60 p-2.5 text-[11px] sm:grid-cols-[minmax(8rem,auto)_1fr]">
                    {Object.entries(event.metadata).map(([key, value]) => (
                      <React.Fragment key={key}>
                        <dt className="text-muted-foreground">{formatMetadataLabel(key)}</dt>
                        <dd className="break-all font-mono text-foreground/90">
                          {formatMetadataValue(value)}
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
