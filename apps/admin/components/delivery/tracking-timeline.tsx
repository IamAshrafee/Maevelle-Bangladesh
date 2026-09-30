'use client';

import {
  AlertTriangle,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  PackageCheck,
  PackageOpen,
  Route,
  Truck,
  XCircle,
} from 'lucide-react';
import React from 'react';

import { cn } from '@/lib/utils';
import type { DeliveryAttemptDto, DeliveryEventDto } from '@maevelle/contracts';

import { AttemptOutcomeBadge } from './delivery-status-badges';

interface TrackingTimelineProps {
  events: readonly DeliveryEventDto[];
  attempts?: readonly DeliveryAttemptDto[];
  className?: string;
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-BD', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return isoString;
  }
}

function getEventIcon(type: string) {
  const t = type.toUpperCase();
  if (t.includes('DELIVERED')) return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (t.includes('FAILED')) return <AlertTriangle className="size-4 text-rose-600" />;
  if (t.includes('OUT_FOR_DELIVERY')) return <Truck className="size-4 text-purple-600" />;
  if (t.includes('DISPATCH') || t.includes('HANDOVER') || t.includes('IN_TRANSIT')) return <Truck className="size-4 text-sky-600" />;
  if (t.includes('BOOKED')) return <PackageCheck className="size-4 text-blue-600" />;
  if (t.includes('RTO') || t.includes('RETURN')) return <ArrowDownLeft className="size-4 text-rose-600" />;
  if (t.includes('CANCEL')) return <XCircle className="size-4 text-muted-foreground" />;
  return <Route className="size-4 text-muted-foreground" />;
}

export function TrackingTimeline({ events, attempts, className }: TrackingTimelineProps) {
  // Sort events chronologically descending (latest first)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Delivery Attempts (if any) */}
      {attempts && attempts.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="size-3.5" /> Delivery Attempts ({attempts.length})
          </h4>
          <div className="space-y-2">
            {attempts.map((attempt) => (
              <div
                key={attempt.attemptNumber}
                className="rounded-lg border bg-card p-3 text-xs flex flex-col gap-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Attempt #{attempt.attemptNumber}</span>
                    <AttemptOutcomeBadge outcome={attempt.outcome} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{formatDateTime(attempt.attemptedAt)}</span>
                </div>
                {attempt.reasonCode ? (
                  <p className="text-muted-foreground">
                    Reason: <span className="font-medium text-foreground">{attempt.reasonCode.replaceAll('_', ' ')}</span>
                  </p>
                ) : null}
                {attempt.note ? <p className="italic text-muted-foreground">“{attempt.note}”</p> : null}
                {attempt.nextAttemptAt ? (
                  <div className="flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-400 font-medium bg-sky-50 dark:bg-sky-950/30 p-1.5 rounded">
                    <Calendar className="size-3" />
                    <span>Next scheduled attempt: {formatDateTime(attempt.nextAttemptAt)}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Tracking Milestones / Event Timeline */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Route className="size-3.5" /> Operational History
        </h4>
        {sortedEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No tracking events recorded yet.</p>
        ) : (
          <ol className="relative border-l border-border/80 ml-3 space-y-4 py-1">
            {sortedEvents.map((event, idx) => (
              <li key={`${event.type}-${event.occurredAt}-${idx}`} className="ml-5 relative group">
                {/* Node icon circle */}
                <span className="absolute -left-[29px] top-0.5 flex size-5 items-center justify-center rounded-full bg-background border border-border shadow-2xs">
                  {getEventIcon(event.type)}
                </span>
                <div className="flex flex-col">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="text-xs font-semibold text-foreground">
                      {event.type.replaceAll('_', ' ')}
                    </strong>
                    <time className="text-[11px] text-muted-foreground">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </div>
                  {event.source ? (
                    <span className="text-[10px] text-muted-foreground">
                      Source: {event.source}
                      {event.providerStatusRaw ? ` (${event.providerStatusRaw})` : ''}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
