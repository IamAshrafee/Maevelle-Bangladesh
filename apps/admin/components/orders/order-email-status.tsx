'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  AlertTriangle,
  Send,
  RotateCw,
  Eye,
  ExternalLink,
  ShieldAlert,
  ChevronRight,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { EmailStatusBadge } from '@/components/email/email-status-badge';
import { EmailDetailDrawer } from '@/components/email/email-detail-drawer';
import { EmailPreviewFrame } from '@/components/email/email-preview-frame';
import {
  type OrderEmailEligibilityDto,
  type OrderEmailEventEligibilityDto,
  type EmailNotificationDetailDto,
  type EmailNotificationRowDto,
  type EmailPreviewResponse,
  fetchEmailApi,
  formatDateTime,
} from '@/components/email/email-types';

interface OrderEmailStatusProps {
  readonly orderId: string;
  readonly hasEmail: boolean;
}

export function OrderEmailStatus({ orderId }: OrderEmailStatusProps) {
  const [eligibility, setEligibility] = useState<OrderEmailEligibilityDto | null>(null);
  const [historyRows, setHistoryRows] = useState<readonly EmailNotificationRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Selected notification for drawer
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [notificationDetail, setNotificationDetail] = useState<EmailNotificationDetailDto | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Send confirmation modal
  const [sendTargetEvent, setSendTargetEvent] = useState<OrderEmailEventEligibilityDto | null>(null);
  const [sendReason, setSendReason] = useState('Manual send requested by operator');

  // Retry confirmation modal
  const [retryTargetRow, setRetryTargetRow] = useState<EmailNotificationRowDto | null>(null);
  const [retryReason, setRetryReason] = useState('Technical failure recovery attempt');

  // Resend confirmation modal
  const [resendTargetRow, setResendTargetRow] = useState<EmailNotificationRowDto | null>(null);
  const [resendReason, setResendReason] = useState('Customer requested duplicate copy');

  // Order-specific template preview modal
  const [previewEvent, setPreviewEvent] = useState<OrderEmailEventEligibilityDto | null>(null);
  const [previewData, setPreviewData] = useState<EmailPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async (isPolling = false) => {
    if (!isPolling) setRefreshing(true);
    setError('');
    try {
      const [eligibilityRes, historyRes] = await Promise.all([
        fetchEmailApi<{ data: OrderEmailEligibilityDto }>(
          `/admin/email/orders/${encodeURIComponent(orderId)}/eligibility`,
        ),
        fetchEmailApi<{ data: EmailNotificationRowDto[] }>(
          `/admin/email/operations?page=1&pageSize=50&sourceId=${encodeURIComponent(orderId)}`,
        ),
      ]);
      setEligibility(eligibilityRes.data);
      setHistoryRows(historyRes.data ?? []);
    } catch (cause) {
      if (!isPolling) {
        setError(cause instanceof Error ? cause.message : 'Failed to load order email state.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Determine if active polling is required (any notification in QUEUED, PROCESSING, or SENT)
  useEffect(() => {
    const hasPendingSends = historyRows.some((r) =>
      ['QUEUED', 'PROCESSING', 'SENT'].includes(r.status),
    );

    if (hasPendingSends) {
      pollTimerRef.current = setInterval(() => {
        void loadData(true);
      }, 4000);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [historyRows, loadData]);

  const openDetailDrawer = async (notificationId: string) => {
    setSelectedNotificationId(notificationId);
    try {
      const res = await fetchEmailApi<{ data: EmailNotificationDetailDto }>(
        `/admin/email/operations/${notificationId}`,
      );
      setNotificationDetail(res.data);
      setDetailDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notification details.');
    }
  };

  const openPreview = async (event: OrderEmailEventEligibilityDto) => {
    setPreviewEvent(event);
    setPreviewData(null);
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await fetchEmailApi<{ data: EmailPreviewResponse }>(
        `/admin/email/templates/${event.templateKey}/preview`,
        {
          method: 'POST',
          body: JSON.stringify({ orderId }),
        },
      );
      setPreviewData(res.data);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to render email preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleManualSend = async () => {
    if (!sendTargetEvent) return;
    setActing(true);
    setError('');
    setMessage('');
    try {
      await fetchEmailApi(`/admin/email/orders/${orderId}/send`, {
        method: 'POST',
        body: JSON.stringify({
          notificationType: sendTargetEvent.notificationType,
          idempotencyKey: crypto.randomUUID(),
          reason: sendReason,
        }),
      });
      // Important feedback per requirement: state "Queued", not "Sent successfully"
      setMessage(
        `Email queued for ${eligibility?.customerEmail ?? 'customer'}. Worker is delivering now.`,
      );
      setSendTargetEvent(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual email send failed.');
    } finally {
      setActing(false);
    }
  };

  const handleRetry = async () => {
    if (!retryTargetRow) return;
    setActing(true);
    setError('');
    setMessage('');
    try {
      await fetchEmailApi(`/admin/email/operations/${retryTargetRow.id}/retry`, {
        method: 'POST',
        body: JSON.stringify({ reason: retryReason }),
      });
      setMessage('Retry request scheduled for the email worker.');
      setRetryTargetRow(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry request failed.');
    } finally {
      setActing(false);
    }
  };

  const handleResend = async () => {
    if (!resendTargetRow) return;
    setActing(true);
    setError('');
    setMessage('');
    try {
      await fetchEmailApi(`/admin/email/operations/${resendTargetRow.id}/resend`, {
        method: 'POST',
        body: JSON.stringify({ reason: resendReason }),
      });
      setMessage(`New copy queued for ${resendTargetRow.intended_recipient ?? 'customer'}.`);
      setResendTargetRow(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resend request failed.');
    } finally {
      setActing(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-foreground">Customer Communications / Email</h2>
            {historyRows.some((r) => ['QUEUED', 'PROCESSING', 'SENT'].includes(r.status)) ? (
              <Badge variant="outline" className="animate-pulse border-blue-500/30 bg-blue-500/10 text-blue-700 text-xs dark:text-blue-300">
                <Clock className="mr-1 size-3 inline" /> Live Syncing
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            End-to-end delivery lifecycle, server eligibility checks, and operator actions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={refreshing}
            onClick={() => void loadData()}
          >
            <RefreshCw className={`mr-1 size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link
            href="/email"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Email Operations Console
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      <div className="space-y-4 px-6 py-4">
        {/* Banner: Global disabled */}
        {eligibility && !eligibility.globalEmailEnabled ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Transactional Email Sending Is Disabled Globally</p>
              <p className="mt-0.5">
                The global application configuration has paused automatic email dispatch. Emails will remain queued or skipped until enabled in environment settings.
              </p>
            </div>
          </div>
        ) : null}

        {/* Banner: No customer email on file */}
        {eligibility && !eligibility.customerEmail ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Customer Has No Email Address on File</p>
              <p className="mt-0.5">
                This order was placed without providing an email address (e.g. phone-only checkout). Transactional notifications are gracefully skipped without stalling order fulfillment or delivery workflows.
              </p>
            </div>
          </div>
        ) : null}

        {/* Banner: Recipient suppressed */}
        {eligibility?.isSuppressed ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Customer Email Is Suppressed ({eligibility.customerEmail})</p>
                <p className="mt-0.5">
                  Sending is blocked to protect domain reputation due to:{' '}
                  <span className="font-medium uppercase">{eligibility.suppressionReason?.replaceAll('_', ' ')}</span>.
                </p>
              </div>
            </div>
            <Link
              href="/email?tab=suppressions"
              className="shrink-0 text-xs font-semibold underline hover:no-underline"
            >
              View Suppression
            </Link>
          </div>
        ) : null}

        {/* Transient action feedback messages */}
        {message ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="size-4 shrink-0" />
            <p className="font-medium">{message}</p>
          </div>
        ) : null}
        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        ) : null}

        {/* Lifecycle Events Matrix */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Expected Order Communications
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Recipient:{' '}
              <span className="font-medium text-foreground">
                {eligibility?.customerEmail ?? 'None'}
              </span>
            </span>
          </div>

          {loading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-lg border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-background/50">
              {(eligibility?.events ?? []).map((event) => {
                const latest = event.latestNotification;
                const hasSent = latest && ['DELIVERED', 'SENT', 'QUEUED', 'PROCESSING'].includes(latest.status);
                const isFailed = latest && latest.status === 'FAILED';

                return (
                  <div
                    key={event.notificationType}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 transition-colors hover:bg-muted/20 text-xs"
                  >
                    {/* Event summary & status */}
                    <div className="space-y-1 min-w-0 max-w-xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground text-sm">
                          {event.label}
                        </span>
                        {latest ? (
                          <EmailStatusBadge status={latest.status} />
                        ) : (
                          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                            Not Triggered
                          </Badge>
                        )}
                        {!event.policy.enabled ? (
                          <Badge variant="secondary" className="text-[10px]">Policy Disabled</Badge>
                        ) : !event.policy.automaticEnabled ? (
                          <Badge variant="secondary" className="text-[10px] text-amber-700 bg-amber-500/10">Manual Only</Badge>
                        ) : null}
                      </div>

                      <p className="text-muted-foreground leading-relaxed">
                        {event.explanation}
                      </p>

                      {latest ? (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pt-0.5">
                          <span>
                            {latest.trigger_type === 'TEST' ? '🧪 Test send' : latest.trigger_type === 'RESEND' ? '🔁 Operator resend' : latest.trigger_type === 'MANUAL' ? '👤 Manual send' : '⚡ Automatic'}
                          </span>
                          <span>•</span>
                          <span>{formatDateTime(latest.created_at)}</span>
                          {latest.provider_message_id ? (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[10px] truncate max-w-[140px]">
                                {latest.provider_message_id}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-start md:self-center">
                      {/* Preview Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => void openPreview(event)}
                      >
                        <Eye className="mr-1 size-3" />
                        Preview
                      </Button>

                      {/* Manual Send Button */}
                      {event.canSendManually ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/5"
                          disabled={acting}
                          onClick={() => {
                            setSendTargetEvent(event);
                            setSendReason(`Manual send of ${event.label} from Order detail`);
                          }}
                        >
                          <Send className="mr-1 size-3" />
                          Send Email
                        </Button>
                      ) : null}

                      {/* Retry Button (only for technical failures) */}
                      {isFailed ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/5"
                          disabled={acting}
                          onClick={() => {
                            setRetryTargetRow(latest);
                            setRetryReason('Technical failure retry from Order detail');
                          }}
                        >
                          <RotateCw className="mr-1 size-3" />
                          Retry
                        </Button>
                      ) : null}

                      {/* Resend Button (for delivered/sent emails) */}
                      {hasSent && event.policy.manualAllowed && eligibility?.customerEmail && !eligibility.isSuppressed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          disabled={acting}
                          onClick={() => {
                            setResendTargetRow(latest);
                            setResendReason('Duplicate copy requested by customer');
                          }}
                        >
                          Resend Copy
                        </Button>
                      ) : null}

                      {/* View Notification Details in Drawer */}
                      {latest ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => void openDetailDrawer(latest.id)}
                        >
                          Timeline
                          <ChevronRight className="ml-1 size-3" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Complete Historical Dispatch Log (if multiple notifications exist) */}
        {historyRows.length > 0 ? (
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                All Dispatched Email Records ({historyRows.length})
              </h4>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {historyRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-medium text-foreground">{row.notification_type.replaceAll('_', ' ')}</span>
                    <EmailStatusBadge status={row.status} size="sm" />
                    <span className="text-muted-foreground text-[11px] truncate">
                      to {row.intended_recipient ?? 'no email'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(row.created_at)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void openDetailDrawer(row.id)}
                    >
                      Inspect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Manual Send Confirmation Modal */}
      <Dialog open={Boolean(sendTargetEvent)} onOpenChange={(open) => !open && setSendTargetEvent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send &ldquo;{sendTargetEvent?.label}&rdquo; Email?</DialogTitle>
            <DialogDescription>
              This will create an authentic customer notification and queue it for immediate delivery by the email worker.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipient</span>
                <span className="font-semibold text-foreground">{eligibility?.customerEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Template</span>
                <span className="font-mono text-foreground">{sendTargetEvent?.templateKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Ref</span>
                <span className="font-mono text-foreground">{eligibility?.orderNumber}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="sendReason" className="text-xs">Reason for Manual Send</Label>
              <Input
                id="sendReason"
                value={sendReason}
                onChange={(e) => setSendReason(e.target.value)}
                placeholder="e.g. Customer requested manual confirmation"
                className="text-xs h-8"
              />
              <p className="text-[11px] text-muted-foreground">
                This reason will be recorded in the audit trail alongside your operator ID.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={() => setSendTargetEvent(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={acting || !sendReason.trim()}
              onClick={() => void handleManualSend()}
            >
              {acting ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
              Confirm &amp; Queue Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retry Confirmation Modal */}
      <Dialog open={Boolean(retryTargetRow)} onOpenChange={(open) => !open && setRetryTargetRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Retry Technical Failure?</DialogTitle>
            <DialogDescription>
              This will clear the failure state and re-queue the existing notification record for the email worker to attempt delivery again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Notification ID</span>
                <span className="font-mono text-[10px]">{retryTargetRow?.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Failure Code</span>
                <span className="font-semibold text-destructive">{retryTargetRow?.failure_code ?? 'UNKNOWN'}</span>
              </div>
              {retryTargetRow?.failure_message ? (
                <div className="pt-1 text-[11px] text-muted-foreground border-t">
                  {retryTargetRow.failure_message}
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="retryReason" className="text-xs">Retry Rationale</Label>
              <Input
                id="retryReason"
                value={retryReason}
                onChange={(e) => setRetryReason(e.target.value)}
                placeholder="e.g. Transient network timeout resolved"
                className="text-xs h-8"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={() => setRetryTargetRow(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={acting || !retryReason.trim()}
              onClick={() => void handleRetry()}
            >
              {acting ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <RotateCw className="mr-1.5 size-3.5" />}
              Re-queue Delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Confirmation Modal */}
      <Dialog open={Boolean(resendTargetRow)} onOpenChange={(open) => !open && setResendTargetRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Another Copy to Customer?</DialogTitle>
            <DialogDescription>
              This will create a distinct new delivery notification linked to the original message, preserving complete history of all dispatches.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipient</span>
                <span className="font-medium text-foreground">{resendTargetRow?.intended_recipient}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Send</span>
                <span className="text-muted-foreground">{formatDateTime(resendTargetRow?.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Status</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{resendTargetRow?.status}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="resendReason" className="text-xs">Resend Reason</Label>
              <Input
                id="resendReason"
                value={resendReason}
                onChange={(e) => setResendReason(e.target.value)}
                placeholder="e.g. Customer requested a replacement receipt"
                className="text-xs h-8"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={() => setResendTargetRow(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={acting || !resendReason.trim()}
              onClick={() => void handleResend()}
            >
              {acting ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
              Dispatch New Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Template Preview Dialog */}
      <Dialog open={Boolean(previewEvent)} onOpenChange={(open) => !open && setPreviewEvent(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Order Email Preview: {previewEvent?.label}</DialogTitle>
              <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-800 border-amber-500/30">
                PREVIEW ONLY · NO EMAIL SENT
              </Badge>
            </div>
            <DialogDescription>
              Rendered in real-time with authentic data from Order #{eligibility?.orderNumber}.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="size-8 animate-spin text-primary mb-2" />
              <p className="text-sm">Rendering production email snapshot...</p>
            </div>
          ) : previewError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
              <p className="font-semibold">Rendering Failed</p>
              <p className="mt-1">{previewError}</p>
            </div>
          ) : previewData ? (
            <EmailPreviewFrame
              subject={previewData.subject}
              html={previewData.html}
              text={previewData.text}
              intendedRecipient={eligibility?.customerEmail}
              supportEmail="maevelleBangladesh@gmail.com"
              templateKey={previewData.templateKey}
              templateVersion={previewData.templateVersion}
              isSampleFixture={false}
            />
          ) : null}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewEvent(null)}>
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slide-out Notification Detail Drawer */}
      <EmailDetailDrawer
        notification={notificationDetail}
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        onActionCompleted={() => {
          setDetailDrawerOpen(false);
          void loadData();
        }}
      />
    </section>
  );
}
