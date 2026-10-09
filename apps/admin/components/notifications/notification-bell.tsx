'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  Truck,
  RotateCcw,
  Star,
  Boxes,
  ShieldAlert,
  ArrowRight,
  Circle,
} from 'lucide-react';
import type { NotificationInboxItemDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { fetchApiData, apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  NotificationPriorityBadge,
  NotificationStatusBadge,
} from './notification-status-badge';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

function getCategoryIcon(category: string, priority: string) {
  if (priority === 'CRITICAL') {
    return <ShieldAlert className="size-4 text-destructive" />;
  }
  switch (category) {
    case 'TRANSACTIONAL':
      return <ShoppingBag className="size-4 text-primary" />;
    case 'OPERATIONAL':
      return <Boxes className="size-4 text-amber-600 dark:text-amber-400" />;
    case 'SECURITY':
      return <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400" />;
    default:
      return <Bell className="size-4 text-muted-foreground" />;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [items, setItems] = useState<readonly NotificationInboxItemDto[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Responsive check for popover vs sheet
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Poll authoritative unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetchApiData<{ unreadCount: number }>('/admin/notifications/inbox/unread-count');
      if (typeof res?.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch {
      // Ignore background poll errors silently
    }
  }, []);

  // Poll notifications preview list
  const fetchInbox = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const query = new URLSearchParams({
        page: '1',
        pageSize: '15',
        ...(filter === 'unread' ? { unreadOnly: 'true' } : {}),
      });
      const res = await apiRequest<{
        data: readonly NotificationInboxItemDto[];
        unreadCount?: number;
      }>(`/admin/notifications/inbox?${query.toString()}`);
      if (res?.data) {
        setItems(res.data);
      }
      if (typeof res?.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
      }
    } catch {
      // Fallback
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [filter]);

  // Initial fetch + Periodic timer (every 35s when tab is visible)
  useEffect(() => {
    void fetchUnreadCount();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    }, 35_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchUnreadCount]);

  // When popover opens or filter changes, reload list
  useEffect(() => {
    if (open) {
      void fetchInbox(items.length === 0);
    }
  }, [open, filter, fetchInbox, items.length]);

  const handleMarkAsRead = async (id: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      await apiRequest(`/admin/notifications/${id}/read`, { method: 'POST' });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: 'READ', read_at: new Date().toISOString() } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
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
    } catch {
      // Ignore error
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (item: NotificationInboxItemDto) => {
    if (!item.read_at) {
      void handleMarkAsRead(item.id);
    }
    setOpen(false);
    if (item.action_path) {
      router.push(item.action_path);
    } else {
      router.push('/notifications?tab=inbox');
    }
  };

  const renderContent = () => (
    <div className="flex flex-col h-full max-h-[85vh] sm:max-h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
          {unreadCount > 0 ? (
            <Badge
              variant="default"
              className="bg-primary text-primary-foreground font-mono tabular-nums text-[11px] h-5 px-1.5"
            >
              {unreadCount}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={markingAll}
              onClick={handleMarkAllRead}
              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Mark all as read"
            >
              {markingAll ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : (
                <CheckCheck className="size-3.5 mr-1 text-primary" />
              )}
              Mark all read
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => void fetchInbox(true)}
            title="Refresh inbox"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 bg-muted/30 border-b border-border text-xs">
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={cn(
            'px-2.5 py-1 rounded font-medium transition-colors',
            filter === 'unread'
              ? 'bg-card text-foreground shadow-2xs border border-border'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn(
            'px-2.5 py-1 rounded font-medium transition-colors',
            filter === 'all'
              ? 'bg-card text-foreground shadow-2xs border border-border'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          All Notifications
        </button>
      </div>

      {/* Items Scroll Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary mb-2" />
            <p className="text-xs">Loading notifications…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <div className="p-3 rounded-full bg-muted/60 mb-2.5">
              <Bell className="size-5 text-muted-foreground/80" />
            </div>
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filter === 'unread'
                ? 'No unread notifications at the moment.'
                : 'No notification records found in your inbox.'}
            </p>
          </div>
        ) : (
          items.map((item) => {
            const isUnread = !item.read_at;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => void handleNotificationClick(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    void handleNotificationClick(item);
                  }
                }}
                className={cn(
                  'group flex items-start gap-3 p-3.5 text-left cursor-pointer transition-colors',
                  isUnread
                    ? 'bg-primary/5 hover:bg-primary/10'
                    : 'hover:bg-muted/50 bg-card',
                )}
              >
                {/* Category Icon */}
                <div className="p-2 rounded-lg bg-card border border-border shrink-0 mt-0.5 shadow-2xs">
                  {getCategoryIcon(item.category, item.priority)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground truncate">
                        {item.category}
                      </span>
                      {item.priority === 'HIGH' || item.priority === 'CRITICAL' ? (
                        <NotificationPriorityBadge priority={item.priority} />
                      ) : null}
                    </div>

                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>

                  <h4
                    className={cn(
                      'text-xs leading-snug line-clamp-1 mb-0.5',
                      isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                    )}
                  >
                    {item.rendered_subject || item.notification_type.replaceAll('_', ' ')}
                  </h4>

                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.rendered_body}
                  </p>

                  <div className="flex items-center justify-between gap-2 mt-2 pt-1">
                    {item.action_path ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary group-hover:underline">
                        Open details <ArrowRight className="size-3" />
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/70">
                        {item.source_domain.replaceAll('_', ' ')}
                      </span>
                    )}

                    {isUnread && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>

                {/* Unread indicator dot */}
                {isUnread && (
                  <div className="size-2 rounded-full bg-primary shrink-0 mt-2" title="Unread" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-border bg-card flex items-center justify-between">
        <Link
          href="/notifications?tab=inbox"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-primary hover:text-primary-hover flex items-center gap-1.5 transition-colors px-2 py-1 rounded"
        >
          View all in Notification Center <ArrowRight className="size-3.5" />
        </Link>
        <Link
          href="/notifications?tab=preferences"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
        >
          Preferences
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label={`Open notifications (${unreadCount} unread)`}
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground font-mono text-[10px] font-bold leading-none shadow-xs">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </SheetTrigger>
          <SheetContent side="bottom" className="p-0 max-h-[85vh] rounded-t-xl overflow-hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription>In-app alerts and notifications</SheetDescription>
            </SheetHeader>
            {renderContent()}
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label={`Open notifications (${unreadCount} unread)`}
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground font-mono text-[10px] font-bold leading-none shadow-xs">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[380px] p-0 shadow-lg border border-border rounded-lg overflow-hidden bg-card"
          >
            {renderContent()}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
