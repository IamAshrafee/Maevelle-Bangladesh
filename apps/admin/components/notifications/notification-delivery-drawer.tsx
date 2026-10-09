'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  Info,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCw,
  Send,
  ShieldAlert,
  User,
  X,
  XCircle,
} from 'lucide-react';
import type { NotificationDetailDto, NotificationAttemptDto, NotificationTimelineEventDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData, apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  NotificationChannelBadge,
  NotificationPriorityBadge,
  NotificationStatusBadge,
} from './notification-status-badge';

interface NotificationDeliveryDrawerProps {
  readonly notificationId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRefreshRequested?: () => void;
  readonly onActionCompleted?: () => void;
}

export function NotificationDeliveryDrawer({
  notificationId,
  open,
  onOpenChange,
  onRefreshRequested,
}: NotificationDeliveryDrawerProps) {
  const [detail, setDetail] = useState<NotificationDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Dialog actions state
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [retryReason, setRetryReason] = useState('Operational recovery after provider failure.');
  const [retrying, setRetrying] = useState(false);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [scheduleReason, setScheduleReason] = useState('Scheduled operational delivery.');
  const [scheduling, setScheduling] = useState(false);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Cancelled by administrator.');
  const [cancelling, setCancelling] = useState(false);

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApiData<NotificationDetailDto>(`/admin/notifications/history/${id}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notification details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && notificationId) {
      void loadDetail(notificationId);
      setActionSuccess(null);
    } else {
      setDetail(null);
    }
  }, [open, notificationId, loadDetail]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = async () => {
    if (!notificationId) return;
    setRetrying(true);
    try {
      await apiRequest(`/admin/notifications/history/${notificationId}/retry`, {
        method: 'POST',
        body: JSON.stringify({ reason: retryReason }),
      });
      setActionSuccess('Delivery requeued successfully.');
      setRetryDialogOpen(false);
      void loadDetail(notificationId);
      onRefreshRequested?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetrying(false);
    }
  };

  const handleSchedule = async () => {
    if (!notificationId || !scheduledFor) return;
    setScheduling(true);
    try {
      await apiRequest(`/admin/notifications/deliveries/${notificationId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          scheduledFor: new Date(scheduledFor).toISOString(),
          reason: scheduleReason,
        }),
      });
      setActionSuccess('Notification rescheduled successfully.');
      setScheduleDialogOpen(false);
      void loadDetail(notificationId);
      onRefreshRequested?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scheduling failed.');
    } finally {
      setScheduling(false);
    }
  };

  const handleCancel = async () => {
    if (!detail?.intent_id) return;
    setCancelling(true);
    try {
      await apiRequest(`/admin/notifications/intents/${detail.intent_id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });
      setActionSuccess('Notification intent cancelled.');
      setCancelDialogOpen(false);
      if (notificationId) void loadDetail(notificationId);
      onRefreshRequested?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancellation failed.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col h-full bg-card">
          <SheetHeader className="p-4 sm:p-5 border-b border-border bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                  Notification Delivery
                </span>
                {detail && <NotificationStatusBadge status={detail.status} />}
              </div>
            </div>

            <SheetTitle className="text-base font-semibold text-foreground pt-1">
              {detail
                ? detail.rendered_subject || detail.notification_type.replaceAll('_', ' ')
                : 'Delivery Details'}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {detail ? `Domain: ${detail.source_domain.replaceAll('_', ' ')}` : 'Loading information…'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary mb-2" />
                <p className="text-xs">Loading delivery details…</p>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-2">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="size-4" /> Unable to load details
                </p>
                <p>{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => notificationId && void loadDetail(notificationId)}
                  className="h-7 text-xs"
                >
                  Try again
                </Button>
              </div>
            ) : detail ? (
              <>
                {actionSuccess && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 p-3 text-xs flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{actionSuccess}</span>
                  </div>
                )}

                {/* Unknown Outcome Warning */}
                {detail.status === 'UNKNOWN_PROVIDER_OUTCOME' && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 p-4 text-xs space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      Delivery Outcome Unknown
                    </div>
                    <p className="leading-relaxed">
                      The upstream delivery provider acknowledged or timed out on this request, but
                      final delivery status could not be verified. Blindly resending may produce
                      duplicate external communications or duplicate billing.
                    </p>
                  </div>
                )}

                {/* Primary Metadata Panel */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-2xs">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Dispatch Summary
                  </h4>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Notification ID</span>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums mt-0.5">
                        <span className="truncate">{detail.id}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(detail.id)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Copy ID"
                        >
                          <Copy className="size-3" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Channel</span>
                      <div className="mt-0.5">
                        <NotificationChannelBadge channel={detail.channel} />
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Event Type</span>
                      <span className="font-medium text-foreground block truncate mt-0.5">
                        {detail.notification_type.replaceAll('_', ' ')}
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Category & Priority</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {detail.category.toLowerCase()}
                        </Badge>
                        <NotificationPriorityBadge priority={detail.priority} />
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Recipient</span>
                      <span className="font-medium text-foreground block truncate mt-0.5">
                        {detail.customer_name ||
                          detail.membership_user_name ||
                          detail.intended_recipient ||
                          'Internal recipient'}
                      </span>
                      {(detail.customer_email || detail.customer_phone || detail.membership_user_email) && (
                        <span className="text-muted-foreground block text-[11px] truncate">
                          {detail.customer_email || detail.customer_phone || detail.membership_user_email}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px]">Trigger Type</span>
                      <span className="font-medium text-foreground block mt-0.5 capitalize">
                        {detail.trigger_type.toLowerCase()}
                      </span>
                    </div>

                    {detail.provider && (
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Provider</span>
                        <span className="font-medium text-foreground block mt-0.5">
                          {detail.provider}
                        </span>
                      </div>
                    )}

                    {detail.provider_message_id && (
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Provider Message ID</span>
                        <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums mt-0.5">
                          <span className="truncate">{detail.provider_message_id}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(detail.provider_message_id!)}
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <Copy className="size-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {detail.source_id && (
                      <div className="col-span-2 pt-1 border-t border-border/60 flex items-center justify-between">
                        <span className="text-muted-foreground text-[11px]">
                          Related: {detail.source_domain.replaceAll('_', ' ')}
                        </span>
                        {detail.action_path ? (
                          <Link
                            href={detail.action_path}
                            className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-medium"
                          >
                            View related entity <ExternalLink className="size-3" />
                          </Link>
                        ) : (
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {detail.source_id}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Timestamps Panel */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-xs shadow-2xs">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Lifecycle Timestamps
                  </h4>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Created At</span>
                      {new Date(detail.created_at).toLocaleString()}
                    </div>
                    {detail.scheduled_for && (
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Scheduled For</span>
                        {new Date(detail.scheduled_for).toLocaleString()}
                      </div>
                    )}
                    {detail.sent_at && (
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Sent At</span>
                        {new Date(detail.sent_at).toLocaleString()}
                      </div>
                    )}
                    {detail.delivered_at && (
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Delivered At</span>
                        {new Date(detail.delivered_at).toLocaleString()}
                      </div>
                    )}
                    {detail.read_at && (
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Read At</span>
                        {new Date(detail.read_at).toLocaleString()}
                      </div>
                    )}
                    {detail.cancelled_at && (
                      <div className="col-span-2 text-rose-600 dark:text-rose-400">
                        <span className="text-muted-foreground block text-[10px]">Cancelled At</span>
                        {new Date(detail.cancelled_at).toLocaleString()}
                        {detail.cancellation_reason && (
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            Reason: {detail.cancellation_reason}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Message Content Preview */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-2xs">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Rendered Message Content
                  </h4>
                  {detail.rendered_subject && (
                    <div className="p-2.5 rounded bg-muted/40 border border-border text-xs font-medium text-foreground">
                      <span className="text-muted-foreground text-[10px] block mb-0.5 uppercase">Subject</span>
                      {detail.rendered_subject}
                    </div>
                  )}
                  <div className="p-3 rounded bg-muted/20 border border-border text-xs text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">
                    {detail.rendered_body || <span className="text-muted-foreground italic">No body payload</span>}
                  </div>
                </div>

                {/* Delivery Attempts */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Delivery Attempts ({detail.attempts.length})
                    </h4>
                  </div>

                  {detail.attempts.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No attempts logged yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.attempts.map((attempt) => (
                        <div
                          key={attempt.attemptNumber}
                          className="rounded-md border border-border/80 bg-muted/20 p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">
                              Attempt #{attempt.attemptNumber} via {attempt.provider}
                            </span>
                            <NotificationStatusBadge status={attempt.status} />
                          </div>

                          {attempt.startedAt && (
                            <div className="text-[11px] font-mono tabular-nums text-muted-foreground">
                              Started: {new Date(attempt.startedAt).toLocaleString()}
                              {attempt.completedAt && ` · Finished: ${new Date(attempt.completedAt).toLocaleTimeString()}`}
                            </div>
                          )}

                          {attempt.errorCode && (
                            <div className="text-[11px] text-destructive bg-destructive/10 p-1.5 rounded font-mono mt-1">
                              Error: {attempt.errorCode.replaceAll('_', ' ')}
                            </div>
                          )}

                          {attempt.nextRetryAt && (
                            <div className="text-[11px] text-orange-600 dark:text-orange-400 font-mono mt-1">
                              Next Retry Scheduled: {new Date(attempt.nextRetryAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Delivery Timeline Events */}
                {detail.timeline.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-2xs">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Lifecycle Events Timeline
                    </h4>

                    <ol className="relative border-l border-border ml-2 space-y-3">
                      {detail.timeline.map((event) => (
                        <li key={event.id} className="ml-4">
                          <div className="absolute -left-1.5 mt-1 size-3 rounded-full border border-border bg-primary" />
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-foreground">
                              {event.event_type.replaceAll('_', ' ')}
                            </span>
                            <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                              {new Date(event.event_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">Source: {event.source}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Action Bar Footer */}
          {detail && (
            <div className="p-3 sm:p-4 border-t border-border bg-card flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {detail.canRetry && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setRetryDialogOpen(true)}
                    className="h-8 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-medium"
                  >
                    <RotateCw className="size-3.5 mr-1" /> Retry Delivery
                  </Button>
                )}

                {detail.canSchedule && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setScheduledFor(new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 16));
                      setScheduleDialogOpen(true);
                    }}
                    className="h-8 text-xs border-border"
                  >
                    <Calendar className="size-3.5 mr-1" /> Schedule
                  </Button>
                )}

                {detail.canCancel && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCancelDialogOpen(true)}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    <Ban className="size-3.5 mr-1" /> Cancel Intent
                  </Button>
                )}
              </div>

              {detail.action_path && (
                <Link href={detail.action_path}>
                  <Button size="sm" variant="secondary" className="h-8 text-xs gap-1">
                    Open related entity <ArrowRight className="size-3" />
                  </Button>
                </Link>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Retry Confirmation Dialog */}
      <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Confirm Delivery Retry</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Requeue this notification for execution via the authoritative delivery worker.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {detail?.status === 'UNKNOWN_PROVIDER_OUTCOME' && (
              <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
                Warning: Previous outcome was unknown. Retrying may deliver a duplicate message.
              </div>
            )}

            <div>
              <Label htmlFor="retryReason" className="text-xs">
                Operational Reason
              </Label>
              <Input
                id="retryReason"
                value={retryReason}
                onChange={(e) => setRetryReason(e.target.value)}
                placeholder="Reason for triggering manual retry..."
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={() => setRetryDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={retrying || !retryReason.trim()}
              onClick={handleRetry}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {retrying ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Confirm Retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Schedule Delivery</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Defer notification dispatch to a specific future time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label htmlFor="scheduledFor" className="text-xs">
                Deliver at (Local Time)
              </Label>
              <Input
                id="scheduledFor"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="scheduleReason" className="text-xs">
                Reason
              </Label>
              <Input
                id="scheduleReason"
                value={scheduleReason}
                onChange={(e) => setScheduleReason(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={scheduling}
              onClick={() => setScheduleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={scheduling || !scheduledFor}
              onClick={handleSchedule}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {scheduling ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Set Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive">Cancel Notification Intent</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Cancelling the notification intent will prevent pending deliveries from being dispatched.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label htmlFor="cancelReason" className="text-xs">
                Reason for Cancellation
              </Label>
              <Input
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason..."
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={() => setCancelDialogOpen(false)}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelling || !cancelReason.trim()}
              onClick={handleCancel}
            >
              {cancelling ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
