'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { NotificationHistoryRowDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  NotificationChannelBadge,
  NotificationPriorityBadge,
  NotificationStatusBadge,
} from './notification-status-badge';
import { NotificationDeliveryDrawer } from './notification-delivery-drawer';

interface NotificationHistoryTabProps {
  readonly initialChannel?: string | undefined;
  readonly initialStatus?: string | undefined;
  readonly initialSourceId?: string | undefined;
}

export function NotificationHistoryTab({
  initialChannel,
  initialStatus,
  initialSourceId,
}: NotificationHistoryTabProps) {
  const [items, setItems] = useState<readonly NotificationHistoryRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [channel, setChannel] = useState<string>(initialChannel || 'ALL');
  const [status, setStatus] = useState<string>(initialStatus || 'ALL');
  const [category, setCategory] = useState<string>('ALL');
  const [sourceId, setSourceId] = useState<string>(initialSourceId || '');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Drawer inspection
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(channel !== 'ALL' ? { channel } : {}),
        ...(status !== 'ALL' ? { status } : {}),
        ...(category !== 'ALL' ? { category } : {}),
        ...(sourceId.trim() ? { sourceId: sourceId.trim() } : {}),
      });

      const res = await apiRequest<{
        data: readonly NotificationHistoryRowDto[];
        pagination: { totalItems: number; totalPages: number };
      }>(`/admin/notifications/history?${query.toString()}`);

      setItems(res.data);
      setTotalItems(res.pagination.totalItems);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery history.');
    } finally {
      setLoading(false);
    }
  }, [category, channel, page, pageSize, sourceId, status]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const inspect = (id: string) => {
    setSelectedNotificationId(id);
    setDrawerOpen(true);
  };

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.notification_type.toLowerCase().includes(term) ||
        item.source_domain.toLowerCase().includes(term) ||
        item.source_id.toLowerCase().includes(term) ||
        item.provider?.toLowerCase().includes(term) ||
        item.id.toLowerCase().includes(term),
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Channel selector */}
          <div className="w-32">
            <NativeSelect
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value);
                setPage(1);
              }}
              className="h-8 text-xs bg-card"
            >
              <option value="ALL">All Channels</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="IN_APP">In-App</option>
            </NativeSelect>
          </div>

          {/* Status selector */}
          <div className="w-44">
            <NativeSelect
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 text-xs bg-card"
            >
              <option value="ALL">All Statuses</option>
              <option value="DELIVERED">Delivered</option>
              <option value="SENT">Sent / Provider Accepted</option>
              <option value="QUEUED">Queued</option>
              <option value="PROCESSING">Processing</option>
              <option value="RETRY_WAIT">Retry Scheduled</option>
              <option value="UNKNOWN_PROVIDER_OUTCOME">Outcome Unknown</option>
              <option value="FAILED">Failed</option>
              <option value="SUPPRESSED">Suppressed</option>
              <option value="CANCELLED">Cancelled</option>
            </NativeSelect>
          </div>

          {/* Category selector */}
          <div className="w-36">
            <NativeSelect
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="h-8 text-xs bg-card"
            >
              <option value="ALL">All Categories</option>
              <option value="TRANSACTIONAL">Transactional</option>
              <option value="OPERATIONAL">Operational</option>
              <option value="SECURITY">Security</option>
              <option value="SYSTEM">System</option>
            </NativeSelect>
          </div>
        </div>

        {/* Right Search & Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Filter by event, provider, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => void loadHistory()}
            className="size-8 text-muted-foreground hover:text-foreground shrink-0"
            title="Refresh logs"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-2xs">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary mb-2" />
            <p className="text-xs">Loading delivery records…</p>
          </div>
        ) : error ? (
          <div className="p-6 text-xs text-destructive space-y-2">
            <p className="font-semibold">Unable to load delivery history</p>
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={() => void loadHistory()} className="h-7 text-xs">
              Retry
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground">
            <div className="p-3 rounded-full bg-muted/60 mb-2">
              <Activity className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">No delivery records found</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Try adjusting your channel, status, or search filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border bg-muted/30 text-xs">
                  <TableHead className="w-36 font-semibold">Timestamp</TableHead>
                  <TableHead className="font-semibold">Event & Category</TableHead>
                  <TableHead className="w-24 font-semibold">Channel</TableHead>
                  <TableHead className="w-32 font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Related Aggregate</TableHead>
                  <TableHead className="w-24 font-semibold">Provider</TableHead>
                  <TableHead className="w-20 text-right font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y divide-border">
                {filteredItems.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => inspect(row.id)}
                  >
                    {/* Timestamp */}
                    <TableCell className="font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>

                    {/* Event & Category */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">
                          {row.notification_type.replaceAll('_', ' ')}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="capitalize">{row.category.toLowerCase()}</span>
                          {row.priority === 'HIGH' || row.priority === 'CRITICAL' ? (
                            <>
                              <span>·</span>
                              <NotificationPriorityBadge priority={row.priority} />
                            </>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    {/* Channel */}
                    <TableCell>
                      <NotificationChannelBadge channel={row.channel} />
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <NotificationStatusBadge status={row.status} />
                    </TableCell>

                    {/* Related Domain & ID */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5 font-mono text-[11px] tabular-nums">
                        <span className="text-muted-foreground font-sans text-[10px] capitalize">
                          {row.source_domain.replaceAll('_', ' ')}
                        </span>
                        <span className="text-foreground truncate max-w-[140px]" title={row.source_id}>
                          {row.source_id.slice(0, 8)}…{row.source_id.slice(-4)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Provider */}
                    <TableCell className="text-muted-foreground">
                      {row.provider || '—'}
                    </TableCell>

                    {/* Inspect button */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => inspect(row.id)}
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-xs shadow-2xs">
          <span className="text-muted-foreground font-mono tabular-nums">
            Showing page {page} of {totalPages} ({totalItems} total delivery records)
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 text-xs border-border"
            >
              <ChevronLeft className="size-3.5 mr-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2.5 text-xs border-border"
            >
              Next <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Inspection Drawer */}
      <NotificationDeliveryDrawer
        notificationId={selectedNotificationId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onRefreshRequested={() => void loadHistory()}
      />
    </div>
  );
}
