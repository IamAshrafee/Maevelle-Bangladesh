'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Boxes,
  ArrowRight,
  Info,
} from 'lucide-react';
import type { NotificationInboxItemDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  NotificationPriorityBadge,
  NotificationStatusBadge,
} from './notification-status-badge';
import { NotificationDeliveryDrawer } from './notification-delivery-drawer';

interface NotificationInboxTabProps {
  readonly onUnreadCountChanged?: () => void;
}

export function NotificationInboxTab({ onUnreadCountChanged }: NotificationInboxTabProps) {
  const [items, setItems] = useState<readonly NotificationInboxItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);

  // Drawer inspection
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(unreadOnly ? { unreadOnly: 'true' } : {}),
        ...(category !== 'ALL' ? { category } : {}),
      });

      const res = await apiRequest<{
        data: readonly NotificationInboxItemDto[];
        pagination: { totalItems: number; totalPages: number };
        unreadCount?: number;
      }>(`/admin/notifications/inbox?${query.toString()}`);

      setItems(res.data);
      setTotalItems(res.pagination.totalItems);
      setTotalPages(res.pagination.totalPages);
      if (typeof res.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox notifications.');
    } finally {
      setLoading(false);
    }
  }, [category, page, pageSize, unreadOnly]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const handleMarkOneRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await apiRequest(`/admin/notifications/${id}/read`, { method: 'POST' });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: 'READ', read_at: new Date().toISOString() } : item,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      onUnreadCountChanged?.();
    } catch {
      // Ignore error
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiRequest('/admin/notifications/inbox/read-all', { method: 'POST' });
      setItems((prev) =>
        prev.map((item) => ({ ...item, status: 'READ', read_at: new Date().toISOString() })),
      );
      setUnreadCount(0);
      onUnreadCountChanged?.();
    } catch {
      // Ignore error
    } finally {
      setMarkingAll(false);
    }
  };

  const inspect = (id: string) => {
    setSelectedNotificationId(id);
    setDrawerOpen(true);
  };

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.rendered_subject?.toLowerCase().includes(term) ||
        item.rendered_body.toLowerCase().includes(term) ||
        item.notification_type.toLowerCase().includes(term) ||
        item.source_domain.toLowerCase().includes(term) ||
        item.source_id.toLowerCase().includes(term),
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Unread Only Toggle */}
          <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => {
                setUnreadOnly(false);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                !unreadOnly ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              All Notifications
            </button>
            <button
              type="button"
              onClick={() => {
                setUnreadOnly(true);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                unreadOnly ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>

          {/* Category Filter */}
          <div className="w-40">
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
              <option value="MARKETING">Marketing</option>
              <option value="SYSTEM">System</option>
            </NativeSelect>
          </div>
        </div>

        {/* Right Actions: Search + Mark All Read */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search notifications…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={markingAll}
              onClick={handleMarkAllRead}
              className="h-8 text-xs text-muted-foreground hover:text-foreground shrink-0 border-border"
            >
              {markingAll ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : (
                <CheckCheck className="size-3.5 text-primary mr-1" />
              )}
              Mark all read
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => void loadInbox()}
            className="size-8 text-muted-foreground hover:text-foreground shrink-0"
            title="Refresh inbox"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Main List */}
      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-lg border border-border bg-card text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary mb-2" />
          <p className="text-xs">Loading notifications…</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive space-y-2">
          <p className="font-semibold">Failed to load inbox</p>
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={() => void loadInbox()} className="h-7 text-xs">
            Retry
          </Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-lg border border-border bg-card text-center text-muted-foreground">
          <div className="p-3 rounded-full bg-muted/60 mb-3">
            <Bell className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No notifications found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {search
              ? 'No notifications matched your search query. Try clearing the search.'
              : unreadOnly
                ? 'You have zero unread notifications. Great job keeping up!'
                : 'No notification records currently exist in your personal staff inbox.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const isUnread = !item.read_at;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => inspect(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    inspect(item.id);
                  }
                }}
                className={cn(
                  'group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border transition-colors cursor-pointer shadow-2xs',
                  isUnread
                    ? 'border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10'
                    : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                {/* Left content */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2.5 rounded-lg bg-card border border-border shrink-0 mt-0.5 shadow-2xs">
                    {item.priority === 'CRITICAL' ? (
                      <ShieldAlert className="size-4 text-destructive" />
                    ) : item.category === 'TRANSACTIONAL' ? (
                      <ShoppingBag className="size-4 text-primary" />
                    ) : item.category === 'OPERATIONAL' ? (
                      <Boxes className="size-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Bell className="size-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                        {item.category}
                      </span>
                      {item.priority === 'HIGH' || item.priority === 'CRITICAL' ? (
                        <NotificationPriorityBadge priority={item.priority} />
                      ) : null}
                      <span className="text-muted-foreground/60 text-xs">·</span>
                      <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>

                    <h4
                      className={cn(
                        'text-sm leading-snug',
                        isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                      )}
                    >
                      {item.rendered_subject || item.notification_type.replaceAll('_', ' ')}
                    </h4>

                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.rendered_body}
                    </p>

                    <div className="pt-1 flex items-center gap-3 text-xs">
                      {item.action_path && (
                        <Link
                          href={item.action_path}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          Open related entity <ArrowRight className="size-3" />
                        </Link>
                      )}
                      <span className="text-[11px] text-muted-foreground/60">
                        Domain: {item.source_domain.replaceAll('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                  <div className="flex items-center gap-2">
                    {isUnread ? (
                      <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                        Unread
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">
                        Read
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isUnread && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleMarkOneRead(item.id, e)}
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                      >
                        Mark read
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        inspect(item.id);
                      }}
                      className="h-7 text-xs px-2.5 border-border"
                    >
                      Details
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card text-xs shadow-2xs">
          <span className="text-muted-foreground font-mono tabular-nums">
            Showing page {page} of {totalPages} ({totalItems} notifications)
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
        onRefreshRequested={() => void loadInbox()}
      />
    </div>
  );
}
