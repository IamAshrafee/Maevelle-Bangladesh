'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  GitMerge,
  Mail,
  MessageSquare,
  Package,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Tag,
  Undo2,
  User,
  UserCheck,
} from 'lucide-react';
import type { CustomerTimelineEventDto, CustomerTimelineEventTypeDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchApiData } from '@/lib/api';

interface CustomerTimelineSectionProps {
  readonly customerId: string;
}

export function CustomerTimelineSection({ customerId }: CustomerTimelineSectionProps) {
  const [events, setEvents] = useState<readonly CustomerTimelineEventDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'ORDERS' | 'RESTRICTIONS' | 'NOTES' | 'COMM'>('ALL');

  async function loadTimeline(pageNum: number, append = false) {
    setLoading(true);
    try {
      const res = await fetchApiData<{ items: readonly CustomerTimelineEventDto[]; totalCount: number }>(
        `/admin/customers/${customerId}/timeline?page=${pageNum}&pageSize=25`,
      );
      setEvents((prev) => (append ? [...prev, ...res.items] : res.items));
      setTotalCount(res.totalCount);
    } catch {
      // Handled silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    void loadTimeline(1, false);
  }, [customerId]);

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    void loadTimeline(nextPage, true);
  }

  const filteredEvents = events.filter((e) => {
    if (filterCategory === 'ALL') return true;
    if (filterCategory === 'ORDERS') {
      return [
        'ORDER_PLACED',
        'ORDER_CONFIRMED',
        'ORDER_DELIVERED',
        'ORDER_CANCELLED',
        'RETURN_REQUESTED',
        'RETURN_COMPLETED',
        'REFUND_COMPLETED',
      ].includes(e.eventType);
    }
    if (filterCategory === 'RESTRICTIONS') {
      return ['RESTRICTION_APPLIED', 'RESTRICTION_LIFTED'].includes(e.eventType);
    }
    if (filterCategory === 'NOTES') {
      return ['NOTE_ADDED', 'TAG_ASSIGNED', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED'].includes(e.eventType);
    }
    if (filterCategory === 'COMM') {
      return e.eventType === 'COMMUNICATION_SENT';
    }
    return true;
  });

  function getEventIcon(type: CustomerTimelineEventTypeDto) {
    switch (type) {
      case 'ORDER_PLACED':
      case 'ORDER_CONFIRMED':
        return <ShoppingBag className="size-4 text-primary" aria-hidden="true" />;
      case 'ORDER_DELIVERED':
        return <CheckCircle className="size-4 text-emerald-600" aria-hidden="true" />;
      case 'ORDER_CANCELLED':
        return <ShoppingBag className="size-4 text-rose-600" aria-hidden="true" />;
      case 'RETURN_REQUESTED':
      case 'RETURN_COMPLETED':
        return <RotateCcw className="size-4 text-amber-600" aria-hidden="true" />;
      case 'REFUND_COMPLETED':
        return <Undo2 className="size-4 text-purple-600" aria-hidden="true" />;
      case 'RESTRICTION_APPLIED':
        return <Ban className="size-4 text-rose-600" aria-hidden="true" />;
      case 'RESTRICTION_LIFTED':
        return <ShieldAlert className="size-4 text-emerald-600" aria-hidden="true" />;
      case 'NOTE_ADDED':
        return <FileText className="size-4 text-blue-600" aria-hidden="true" />;
      case 'TAG_ASSIGNED':
        return <Tag className="size-4 text-indigo-600" aria-hidden="true" />;
      case 'ACCOUNT_LINKED':
      case 'ACCOUNT_UNLINKED':
        return <UserCheck className="size-4 text-teal-600" aria-hidden="true" />;
      case 'CUSTOMER_MERGED':
        return <GitMerge className="size-4 text-amber-700" aria-hidden="true" />;
      case 'COMMUNICATION_SENT':
        return <MessageSquare className="size-4 text-sky-600" aria-hidden="true" />;
      default:
        return <Clock className="size-4 text-muted-foreground" aria-hidden="true" />;
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Unified Timeline">
      <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Customer Activity Timeline</h2>
          <p className="text-xs text-muted-foreground">
            Authoritative chronological activity unified across orders, deliveries, notes, restrictions, and communications.
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <Button
            size="sm"
            variant={filterCategory === 'ALL' ? 'default' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setFilterCategory('ALL')}
          >
            All ({events.length})
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'ORDERS' ? 'default' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setFilterCategory('ORDERS')}
          >
            Orders & Returns
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'RESTRICTIONS' ? 'default' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setFilterCategory('RESTRICTIONS')}
          >
            Restrictions
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'NOTES' ? 'default' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setFilterCategory('NOTES')}
          >
            Notes & Profile
          </Button>
        </div>
      </div>

      <div className="p-6">
        {filteredEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {loading ? 'Loading timeline events...' : 'No events match the selected category.'}
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
            {filteredEvents.map((event) => {
              const meta = event.metadata as Record<string, unknown> | undefined;
              const returnOrderId =
                typeof meta?.orderId === 'string' ? meta.orderId : undefined;
              const hasOrderLink =
                event.referenceType === 'orders.order' && Boolean(event.referenceId);
              const hasReturnLink =
                event.referenceType === 'returns.return_case' && Boolean(returnOrderId);

              return (
                <div key={event.id} className="relative flex items-start gap-3">
                  <div className="absolute -left-6 mt-1 flex size-5 items-center justify-center rounded-full bg-background border shadow-2xs">
                    {getEventIcon(event.eventType)}
                  </div>

                  <div className="flex-1 space-y-1 rounded-lg border bg-muted/20 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{event.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Intl.DateTimeFormat('en-BD', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(event.occurredAt))}
                      </span>
                    </div>

                    {event.description && (
                      <p className="text-muted-foreground">{event.description}</p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        {event.actorType && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono uppercase">
                            Actor: {event.actorType}
                          </Badge>
                        )}
                      </div>

                      {hasOrderLink && (
                        <Link
                          href={`/orders/${event.referenceId}`}
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                        >
                          View Order <ExternalLink className="size-2.5" />
                        </Link>
                      )}
                      {hasReturnLink && returnOrderId && (
                        <Link
                          href={`/orders/${returnOrderId}`}
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                        >
                          View Return Order <ExternalLink className="size-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load More Button */}
        {events.length < totalCount && (
          <div className="mt-6 flex justify-center border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={loadMore}
              className="text-xs"
            >
              {loading ? 'Loading...' : `Load Earlier Events (${events.length} of ${totalCount})`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
