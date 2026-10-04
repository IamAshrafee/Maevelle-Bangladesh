'use client';

import {
  AlertCircle,
  Box,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  MessageSquare,
  Package,
  PhoneCall,
  RotateCcw,
  ShoppingBag,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

import type { OrderTimelineEventDto } from '@maevelle/contracts';

interface OrderTimelineCardProps {
  readonly timeline: readonly OrderTimelineEventDto[];
}

function formatTimelineDate(dateString: string): { relative: string; full: string } {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return { relative: '—', full: '—' };

  const now = new Date();
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);
  let relative = 'just now';

  if (diffMinutes >= 1 && diffMinutes < 60) {
    relative = `${diffMinutes}m ago`;
  } else if (diffMinutes >= 60 && diffMinutes < 1440) {
    relative = `${Math.round(diffMinutes / 60)}h ago`;
  } else if (diffMinutes >= 1440) {
    relative = `${Math.round(diffMinutes / 1440)}d ago`;
  }

  const full = new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

  return { relative, full };
}

function getEventVisuals(event: OrderTimelineEventDto) {
  const category = event.category?.toUpperCase() ?? '';
  const eventType = event.eventType.toUpperCase();

  if (category === 'VERIFICATION') {
    return {
      icon: PhoneCall,
      bgColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    };
  }
  if (category === 'PAYMENT' || eventType.includes('PAYMENT') || eventType.includes('REFUND')) {
    return {
      icon: CreditCard,
      bgColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    };
  }
  if (category === 'DELIVERY' || eventType.includes('DELIVERY') || eventType.includes('SHIPMENT')) {
    return {
      icon: Truck,
      bgColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    };
  }
  if (category === 'FULFILLMENT' || eventType.includes('FULFILLMENT')) {
    return {
      icon: Package,
      bgColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    };
  }
  if (category === 'RETURN' || eventType.includes('RETURN')) {
    return {
      icon: RotateCcw,
      bgColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    };
  }
  if (category === 'NOTE' || eventType.includes('NOTE')) {
    return {
      icon: MessageSquare,
      bgColor: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    };
  }
  if (eventType.includes('CANCEL')) {
    return {
      icon: XCircle,
      bgColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    };
  }
  if (eventType.includes('CONFIRM')) {
    return {
      icon: CheckCircle2,
      bgColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    };
  }

  return {
    icon: ShoppingBag,
    bgColor: 'bg-muted text-foreground',
  };
}

const actorBadges: Record<string, { label: string; className: string }> = {
  CUSTOMER: {
    label: 'Customer',
    className: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300',
  },
  ADMIN: {
    label: 'Admin',
    className: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300',
  },
  SYSTEM: {
    label: 'System',
    className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300',
  },
  COURIER: {
    label: 'Courier',
    className: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  },
};

export function OrderTimelineCard({ timeline }: OrderTimelineCardProps) {
  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Unified Business Timeline">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Timeline & Audit</h2>
        </div>
        <span className="text-xs text-muted-foreground">{timeline.length} event{timeline.length === 1 ? '' : 's'}</span>
      </div>

      <div className="p-6">
        {timeline.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-muted-foreground">
            No events recorded for this order yet.
          </p>
        ) : (
          <div className="relative pl-6">
            {/* Stepper vertical line */}
            <div className="absolute bottom-3 left-2.5 top-3 w-px bg-border" aria-hidden="true" />

            <div className="space-y-6">
              {timeline.map((event) => {
                const visuals = getEventVisuals(event);
                const IconComponent = visuals.icon;
                const { relative, full } = formatTimelineDate(event.occurredAt);

                const actorInfo = event.actorType
                  ? actorBadges[event.actorType] ?? {
                      label: event.actorType,
                      className: 'bg-slate-100 text-slate-700',
                    }
                  : null;

                const displayTitle =
                  event.title ??
                  event.eventType.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

                return (
                  <div key={event.id} className="relative flex items-start gap-3">
                    {/* Icon node */}
                    <div
                      className={`absolute -left-6 mt-0.5 flex size-5 items-center justify-center rounded-full ring-4 ring-background ${visuals.bgColor}`}
                      aria-hidden="true"
                    >
                      <IconComponent className="size-3" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{displayTitle}</span>
                        <span className="text-xs text-muted-foreground" title={full}>
                          {relative}
                        </span>
                      </div>

                      {event.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {event.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {actorInfo && (
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${actorInfo.className}`}
                          >
                            {actorInfo.label}
                            {event.actorName ? `: ${event.actorName}` : ''}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{full}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
