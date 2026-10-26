'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  GitMerge,
  MessageSquare,
  Package,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Tag,
  Undo2,
  UserCheck,
} from 'lucide-react';
import type { CustomerTimelineEventDto, CustomerTimelineEventTypeDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fetchApiData } from '@/lib/api';

interface CustomerTimelineSectionProps {
  readonly customerId: string;
}

export function CustomerTimelineSection({ customerId }: CustomerTimelineSectionProps) {
  const [events, setEvents] = useState<readonly CustomerTimelineEventDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<
    'ALL' | 'ORDERS' | 'RESTRICTIONS' | 'NOTES' | 'COMM'
  >('ALL');
  const [channel, setChannel] = useState('ALL');
  const [draftSearch, setDraftSearch] = useState('');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });

  const loadTimeline = useCallback(
    async (cursor: string | null, append = false) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: '25' });
        if (cursor) params.set('cursor', cursor);
        const eventTypes = TIMELINE_CATEGORIES[filterCategory];
        if (eventTypes.length) params.set('eventTypes', eventTypes.join(','));
        if (channel !== 'ALL') params.set('channel', channel);
        if (filters.search) params.set('search', filters.search);
        if (filters.from) params.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
        if (filters.to) params.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
        const res = await fetchApiData<{
          items: readonly CustomerTimelineEventDto[];
          totalCount: number;
          nextCursor: string | null;
        }>(`/admin/customers/${customerId}/timeline?${params.toString()}`);
        setEvents((prev) => (append ? [...prev, ...res.items] : res.items));
        setTotalCount(res.totalCount);
        setNextCursor(res.nextCursor);
      } catch {
        // Handled silently
      } finally {
        setLoading(false);
      }
    },
    [channel, customerId, filterCategory, filters],
  );

  useEffect(() => {
    setNextCursor(null);
    void loadTimeline(null, false);
  }, [loadTimeline]);

  function loadMore() {
    if (nextCursor) void loadTimeline(nextCursor, true);
  }

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
      case 'PAYMENT_CONFIRMED':
        return <CheckCircle className="size-4 text-success" aria-hidden="true" />;
      case 'FULFILLMENT_UPDATED':
      case 'DELIVERY_UPDATED':
        return <Package className="size-4 text-info" aria-hidden="true" />;
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
            Authoritative chronological activity unified across orders, deliveries, notes,
            restrictions, and communications.
          </p>
        </div>

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
          <Button
            size="sm"
            variant={filterCategory === 'COMM' ? 'default' : 'ghost'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setFilterCategory('COMM')}
          >
            Communications
          </Button>
        </div>
      </div>

      <div className="p-6">
        <form
          className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_10rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ search: draftSearch.trim(), from: draftFrom, to: draftTo });
          }}
        >
          <Input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search timeline"
            aria-label="Search timeline"
          />
          <NativeSelect
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            aria-label="Channel"
          >
            <NativeSelectOption value="ALL">All channels</NativeSelectOption>
            <NativeSelectOption value="FACEBOOK">Facebook</NativeSelectOption>
            <NativeSelectOption value="INSTAGRAM">Instagram</NativeSelectOption>
            <NativeSelectOption value="WEBSITE">Website</NativeSelectOption>
            <NativeSelectOption value="EMAIL">Email</NativeSelectOption>
            <NativeSelectOption value="SMS">SMS</NativeSelectOption>
          </NativeSelect>
          <Input
            type="date"
            value={draftFrom}
            onChange={(event) => setDraftFrom(event.target.value)}
            aria-label="From date"
          />
          <Input
            type="date"
            value={draftTo}
            onChange={(event) => setDraftTo(event.target.value)}
            aria-label="To date"
          />
          <Button type="submit" variant="outline">
            Apply filters
          </Button>
        </form>
        {events.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {loading ? 'Loading timeline events...' : 'No events match the selected category.'}
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
            {events.map((event) => {
              const meta = event.metadata as Record<string, unknown> | undefined;
              const returnOrderId = typeof meta?.orderId === 'string' ? meta.orderId : undefined;
              const hasOrderLink =
                event.referenceType === 'orders.order' && Boolean(event.referenceId);
              const hasReturnLink =
                event.referenceType === 'returns.return_case' && Boolean(returnOrderId);
              const hasRelatedOrderLink =
                ['fulfillment.fulfillment', 'delivery.delivery'].includes(
                  event.referenceType ?? '',
                ) && Boolean(returnOrderId);

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
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 font-mono uppercase"
                          >
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
                      {hasRelatedOrderLink && returnOrderId && (
                        <Link
                          href={`/orders/${returnOrderId}`}
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                        >
                          View Related Order <ExternalLink className="size-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {nextCursor && (
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

const TIMELINE_CATEGORIES: Record<
  'ALL' | 'ORDERS' | 'RESTRICTIONS' | 'NOTES' | 'COMM',
  readonly CustomerTimelineEventTypeDto[]
> = {
  ALL: [],
  ORDERS: [
    'ORDER_PLACED',
    'ORDER_CONFIRMED',
    'ORDER_DELIVERED',
    'ORDER_CANCELLED',
    'RETURN_REQUESTED',
    'RETURN_COMPLETED',
    'REFUND_COMPLETED',
    'PAYMENT_CONFIRMED',
    'FULFILLMENT_UPDATED',
    'DELIVERY_UPDATED',
    'REVIEW_SUBMITTED',
  ],
  RESTRICTIONS: ['RESTRICTION_APPLIED', 'RESTRICTION_LIFTED'],
  NOTES: [
    'NOTE_ADDED',
    'TAG_ASSIGNED',
    'CUSTOMER_CREATED',
    'CUSTOMER_UPDATED',
    'LIFECYCLE_CHANGED',
    'OWNER_CHANGED',
    'FOLLOW_UP_CREATED',
    'FOLLOW_UP_COMPLETED',
  ],
  COMM: ['COMMUNICATION_SENT', 'CONVERSATION_STARTED', 'IDENTITY_LINKED', 'IDENTITY_REVOKED'],
};
