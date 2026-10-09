'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  HelpCircle,
  Layers,
  Loader2,
  Mail,
  MessageSquare,
  Radio,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  ShieldAlert,
  Zap,
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

interface OperationalDiagnostics {
  readonly queued: number;
  readonly processing: number;
  readonly retry_wait: number;
  readonly unknown_outcome: number;
  readonly dead_letter_events: number;
  readonly unmatched_provider_events: number;
  readonly oldest_queued_at: string | null;
}

export function NotificationOperationsTab() {
  const [diagnostics, setDiagnostics] = useState<OperationalDiagnostics | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(true);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Failure queue state
  const [failures, setFailures] = useState<readonly NotificationHistoryRowDto[]>([]);
  const [loadingFailures, setLoadingFailures] = useState(true);
  const [failuresError, setFailuresError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL_ISSUES' | 'FAILED' | 'UNKNOWN_PROVIDER_OUTCOME' | 'RETRY_WAIT'>('ALL_ISSUES');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Inspection Drawer
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoadingDiagnostics(true);
    setDiagnosticsError(null);
    try {
      const res = await apiRequest<{ data: OperationalDiagnostics }>('/admin/notifications/diagnostics');
      setDiagnostics(res.data);
      setLastRefreshed(new Date());
    } catch (err) {
      setDiagnosticsError(err instanceof Error ? err.message : 'Failed to load diagnostics.');
    } finally {
      setLoadingDiagnostics(false);
    }
  }, []);

  const loadFailures = useCallback(async () => {
    setLoadingFailures(true);
    setFailuresError(null);
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(channelFilter !== 'ALL' ? { channel: channelFilter } : {}),
        ...(statusFilter !== 'ALL_ISSUES' ? { status: statusFilter } : {}),
      });

      const res = await apiRequest<{
        data: readonly NotificationHistoryRowDto[];
        pagination: { totalItems: number; totalPages: number };
      }>(`/admin/notifications/history?${query.toString()}`);

      // When "ALL_ISSUES" is selected, filter items locally if the backend status filter was not applied
      const relevant = statusFilter === 'ALL_ISSUES'
        ? res.data.filter((item) =>
            item.status === 'FAILED' ||
            item.status === 'UNKNOWN_PROVIDER_OUTCOME' ||
            item.status === 'RETRY_WAIT' ||
            item.status === 'UNDELIVERABLE' ||
            item.status === 'BOUNCED' ||
            item.status === 'COMPLAINED' ||
            item.status === 'REJECTED'
          )
        : res.data;

      setFailures(relevant);
      setTotalItems(res.pagination.totalItems);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setFailuresError(err instanceof Error ? err.message : 'Failed to load failures.');
    } finally {
      setLoadingFailures(false);
    }
  }, [channelFilter, page, pageSize, statusFilter]);

  const refreshAll = useCallback(() => {
    void loadDiagnostics();
    void loadFailures();
  }, [loadDiagnostics, loadFailures]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  useEffect(() => {
    void loadFailures();
  }, [loadFailures]);

  const filteredFailures = failures.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.notification_type.toLowerCase().includes(term) ||
      (item.customer_id && item.customer_id.toLowerCase().includes(term)) ||
      (item.membership_id && item.membership_id.toLowerCase().includes(term)) ||
      (item.provider && item.provider.toLowerCase().includes(term)) ||
      (item.source_id && item.source_id.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header / Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Operational Health & Failure Recovery
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time delivery orchestrator metrics, worker queues, dead-letter monitoring, and safe failure recovery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:inline tabular-nums font-mono">
            Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={loadingDiagnostics || loadingFailures}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', (loadingDiagnostics || loadingFailures) && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Queued */}
        <div className="rounded-lg border border-border bg-card p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Queued</span>
            <Clock className="size-4 text-sky-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
              {loadingDiagnostics ? '—' : diagnostics?.queued ?? 0}
            </span>
          </div>
          {diagnostics?.oldest_queued_at && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate" title={diagnostics.oldest_queued_at}>
              Oldest: {new Date(diagnostics.oldest_queued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Processing */}
        <div className="rounded-lg border border-border bg-card p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Processing</span>
            <Zap className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
              {loadingDiagnostics ? '—' : diagnostics?.processing ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Active worker lock</p>
        </div>

        {/* Retry Wait */}
        <div className="rounded-lg border border-border bg-card p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Retry Wait</span>
            <RotateCw className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
              {loadingDiagnostics ? '—' : diagnostics?.retry_wait ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Backoff delay active</p>
        </div>

        {/* Unknown Outcome */}
        <div className={cn(
          "rounded-lg border bg-card p-3 shadow-2xs",
          (diagnostics?.unknown_outcome ?? 0) > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Unknown Outcome</span>
            <HelpCircle className={cn("size-4", (diagnostics?.unknown_outcome ?? 0) > 0 ? "text-amber-500" : "text-muted-foreground")} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
              {loadingDiagnostics ? '—' : diagnostics?.unknown_outcome ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Needs verification</p>
        </div>

        {/* Dead Letter */}
        <div className={cn(
          "rounded-lg border bg-card p-3 shadow-2xs",
          (diagnostics?.dead_letter_events ?? 0) > 0 ? "border-destructive/40 bg-destructive/5" : "border-border"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Dead Letter</span>
            <Flame className={cn("size-4", (diagnostics?.dead_letter_events ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
              {loadingDiagnostics ? '—' : diagnostics?.dead_letter_events ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Exhausted outbox events</p>
        </div>

        {/* Unmatched Events */}
        <div className="rounded-lg border border-border bg-card p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Unmatched Webhooks</span>
            <ShieldAlert className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums font-mono">
              {loadingDiagnostics ? '—' : diagnostics?.unmatched_provider_events ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Orphaned callbacks</p>
        </div>
      </div>

      {/* Diagnostics Alert Callout if issues found */}
      {diagnostics && (diagnostics.unknown_outcome > 0 || diagnostics.dead_letter_events > 0) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Attention Required in Delivery Pipeline</p>
              <p className="leading-relaxed opacity-90">
                {diagnostics.unknown_outcome > 0 && (
                  <span>
                    <strong>{diagnostics.unknown_outcome} delivery</strong> has an uncertain outcome due to provider timeout or unconfirmed state. Resending without manual verification may trigger duplicate communications.
                  </span>
                )}
                {diagnostics.unknown_outcome > 0 && diagnostics.dead_letter_events > 0 && ' '}
                {diagnostics.dead_letter_events > 0 && (
                  <span>
                    <strong>{diagnostics.dead_letter_events} outbox event</strong> exhausted retry limits and moved to dead-letter storage.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Channel Infrastructure Status Bar */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Server className="size-4 text-primary" />
            Channel Adapters & Integration Health
          </h3>
          <Link href="/notifications?tab=channels" className="text-xs text-primary hover:underline flex items-center gap-1">
            Configure Channels
            <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Email Adapter */}
          <div className="rounded border border-border bg-background p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Mail className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Email (Resend)</p>
                <p className="text-[10px] text-muted-foreground">Transactional & Operational</p>
              </div>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] gap-1">
              <CheckCircle2 className="size-2.5" />
              Operational
            </Badge>
          </div>

          {/* SMS Adapter */}
          <div className="rounded border border-border bg-background p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <MessageSquare className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">SMS Gateway</p>
                <p className="text-[10px] text-muted-foreground">Bangladesh Mobile Operators</p>
              </div>
            </div>
            <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground text-[10px] gap-1">
              Mock / Standby
            </Badge>
          </div>

          {/* In-App Adapter */}
          <div className="rounded border border-border bg-background p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Radio className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">In-App Staff Inbox</p>
                <p className="text-[10px] text-muted-foreground">Database Outbox Stream</p>
              </div>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] gap-1">
              <CheckCircle2 className="size-2.5" />
              Operational
            </Badge>
          </div>
        </div>
      </div>

      {/* Failure & Recovery Workqueue */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-500" />
              Failure & Recovery Queue
            </h3>
            <p className="text-xs text-muted-foreground">
              Review delivery failures, timeout exceptions, and schedule manual re-queues.
            </p>
          </div>

          {/* Action explanation pill */}
          <div className="text-[11px] text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-md border border-border flex items-center gap-1.5">
            <HelpCircle className="size-3.5 text-muted-foreground shrink-0" />
            <span>Resend safely requeues through domain outbox with deduplication keys.</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Issue Selector */}
            <NativeSelect
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="h-8 text-xs w-[180px] bg-card"
            >
              <option value="ALL_ISSUES">All Pipeline Issues</option>
              <option value="FAILED">Terminal Failed</option>
              <option value="UNKNOWN_PROVIDER_OUTCOME">Unknown Outcome</option>
              <option value="RETRY_WAIT">Pending Retry Backoff</option>
            </NativeSelect>

            {/* Channel Selector */}
            <NativeSelect
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 text-xs w-[130px] bg-card"
            >
              <option value="ALL">All Channels</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="IN_APP">In-App</option>
            </NativeSelect>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-[260px]">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search recipient, event..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>
        </div>

        {/* Failures Table */}
        <div className="rounded-md border border-border bg-card overflow-hidden shadow-2xs">
          <Table density="compact">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[150px]">Time</TableHead>
                <TableHead className="w-[180px]">Notification Type</TableHead>
                <TableHead className="w-[100px]">Channel</TableHead>
                <TableHead className="w-[200px]">Recipient</TableHead>
                <TableHead className="w-[150px]">Status</TableHead>
                <TableHead className="w-[110px]">Provider</TableHead>
                <TableHead className="text-right w-[110px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingFailures ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin inline mr-2 text-primary" />
                    Loading pipeline recovery items...
                  </TableCell>
                </TableRow>
              ) : filteredFailures.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground space-y-1">
                      <CheckCircle2 className="size-8 text-emerald-500/80 stroke-1" />
                      <p className="text-xs font-medium text-foreground">Clean Operations Queue</p>
                      <p className="text-[11px]">No active delivery failures or unknown outcomes matching your filter.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredFailures.map((item) => (
                  <TableRow
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedNotificationId(item.id);
                      setDrawerOpen(true);
                    }}
                  >
                    <TableCell className="tabular-nums font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-xs text-foreground truncate" title={item.notification_type}>
                          {item.notification_type.replace(/_/g, ' ')}
                        </span>
                        {item.source_id && (
                          <span className="text-[10px] text-muted-foreground truncate font-mono">
                            Ref: {item.source_id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <NotificationChannelBadge channel={item.channel} />
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-mono truncate text-foreground">
                        {item.recipient_type === 'CUSTOMER'
                          ? (item.customer_id ? `Customer #${item.customer_id.slice(0, 8)}` : 'Customer')
                          : (item.membership_id ? `Staff Member #${item.membership_id.slice(0, 8)}` : 'Staff Member')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <NotificationStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.provider || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNotificationId(item.id);
                          setDrawerOpen(true);
                        }}
                      >
                        <RotateCw className="size-3" />
                        Recover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination bar if multiple pages */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {filteredFailures.length} of {totalItems} items
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="tabular-nums font-mono px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Inspection & Recovery Drawer */}
      <NotificationDeliveryDrawer
        notificationId={selectedNotificationId}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            // refresh failure queue after action
            void loadFailures();
            void loadDiagnostics();
          }
        }}
        onActionCompleted={() => {
          void loadFailures();
          void loadDiagnostics();
        }}
      />
    </div>
  );
}
