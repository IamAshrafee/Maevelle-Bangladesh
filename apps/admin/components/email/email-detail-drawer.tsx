'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  X,
  Copy,
  Check,
  AlertTriangle,
  RotateCw,
  Send,
  ExternalLink,
  ShieldAlert,
  Clock,
  User,
  Hash,
  Server,
  Mail,
  Info,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailStatusBadge } from './email-status-badge';
import { EmailPreviewFrame } from './email-preview-frame';
import {
  type EmailNotificationDetailDto,
  formatDateTime,
  fetchEmailApi,
  eventDisplayLabels,
} from './email-types';

interface EmailDetailDrawerProps {
  readonly notification: EmailNotificationDetailDto | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onActionCompleted: () => void;
}

export function EmailDetailDrawer({
  notification,
  open,
  onOpenChange,
  onActionCompleted,
}: EmailDetailDrawerProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [retryReason, setRetryReason] = useState('Operator retry after technical recovery');
  const [resendReason, setResendReason] = useState('Customer requested another copy');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showSnapshot, setShowSnapshot] = useState(false);

  if (!notification) return null;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore
    }
  };

  const executeRetry = async () => {
    setSubmitting(true);
    setActionError('');
    try {
      await fetchEmailApi(`/admin/email/operations/${notification.id}/retry`, {
        method: 'POST',
        body: JSON.stringify({ reason: retryReason.trim() }),
      });
      setRetryDialogOpen(false);
      onActionCompleted();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const executeResend = async () => {
    setSubmitting(true);
    setActionError('');
    try {
      await fetchEmailApi(`/admin/email/operations/${notification.id}/resend`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          reason: resendReason.trim(),
        }),
      });
      setResendDialogOpen(false);
      onActionCompleted();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Resend failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const isRedirected =
    notification.effective_recipient &&
    notification.intended_recipient &&
    notification.effective_recipient.toLowerCase() !== notification.intended_recipient.toLowerCase();

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col">
          {/* Header */}
          <div className="sticky top-0 z-10 border-b bg-card px-6 py-4 shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <EmailStatusBadge status={notification.status} />
                  <Badge variant="outline" className="text-xs font-mono">
                    {notification.trigger_type}
                  </Badge>
                  {notification.template_version ? (
                    <Badge variant="secondary" className="text-xs">
                      v{notification.template_version}
                    </Badge>
                  ) : null}
                </div>
                <SheetTitle className="text-lg font-semibold leading-snug">
                  {notification.rendered_subject || eventDisplayLabels[notification.notification_type] || notification.notification_type}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="font-mono">ID: {notification.id.slice(0, 13)}…</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(notification.id, 'id')}
                    className="hover:text-foreground inline-flex items-center"
                    title="Copy full Notification ID"
                  >
                    {copiedField === 'id' ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 space-y-6 p-6">
            {/* Action Error if any */}
            {actionError ? (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {actionError}
              </div>
            ) : null}

            {/* Recipient Suppression Warning */}
            {notification.recipientSuppressed ? (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold">Recipient Currently Suppressed</p>
                  <p className="mt-0.5 text-muted-foreground">
                    This email address is currently blocked in suppressions. Future automatic deliveries to this recipient will be prevented.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Development Overrides Notice */}
            {isRedirected ? (
              <div className="flex items-start gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-xs text-blue-900 dark:text-blue-200">
                <Info className="size-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <p className="font-semibold">Development Override Redirect Active</p>
                  <p className="mt-0.5">
                    Intended customer: <span className="font-mono font-medium">{notification.intended_recipient}</span>
                    <br />
                    Delivered to allow-listed test recipient: <span className="font-mono font-medium">{notification.effective_recipient}</span>
                  </p>
                </div>
              </div>
            ) : null}

            {/* Failure Analysis (if applicable) */}
            {notification.status === 'FAILED' || notification.status === 'BOUNCED' ? (
              <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs space-y-2">
                <div className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Delivery Technical Issue</span>
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Failure code:</span>
                    <p className="font-mono font-semibold">{notification.failure_code || 'PROVIDER_DELIVERY_ERROR'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Action recommendation:</span>
                    <p className="font-medium text-foreground">
                      {notification.status === 'BOUNCED'
                        ? 'Mailbox invalid. Check customer contact.'
                        : 'Temporary error. Safe to retry delivery.'}
                    </p>
                  </div>
                </div>
                {notification.failure_message ? (
                  <div className="pt-2 border-t border-destructive/20">
                    <span className="text-muted-foreground">Error message:</span>
                    <p className="mt-0.5 font-mono text-[11px] text-foreground bg-background/60 p-2 rounded">
                      {notification.failure_message}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Quick Actions Panel */}
            <div className="flex flex-wrap items-center gap-2">
              {notification.availableActions.canRetry ? (
                <Button size="sm" onClick={() => setRetryDialogOpen(true)}>
                  <RotateCw className="mr-1.5 size-3.5" /> Retry Technical Send
                </Button>
              ) : null}
              {notification.availableActions.canResend ? (
                <Button size="sm" variant="outline" onClick={() => setResendDialogOpen(true)}>
                  <Send className="mr-1.5 size-3.5" /> Send Another Copy
                </Button>
              ) : null}
              {notification.rendered_html ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowSnapshot(!showSnapshot)}
                >
                  {showSnapshot ? 'Hide Rendered Snapshot' : 'View Historical Snapshot'}
                </Button>
              ) : null}
              {notification.source_domain === 'orders.order' && notification.source_id ? (
                <Link
                  href={`/orders/${notification.source_id}`}
                  className="inline-flex items-center justify-center rounded-lg h-7 px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="mr-1.5 size-3.5" /> View Order
                </Link>
              ) : null}
              {notification.customer_id ? (
                <Link
                  href={`/customers/${notification.customer_id}`}
                  className="inline-flex items-center justify-center rounded-lg h-7 px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <User className="mr-1.5 size-3.5" /> View Customer
                </Link>
              ) : null}
            </div>

            {/* Snapshot Preview Dropdown */}
            {showSnapshot && notification.rendered_html ? (
              <div className="pt-2">
                <EmailPreviewFrame
                  subject={notification.rendered_subject || 'Email Preview'}
                  html={notification.rendered_html}
                  text={notification.rendered_body}
                  from="Maevelle <orders@maevelle.com>"
                  replyTo="maevelleBangladesh@gmail.com"
                  recipient={notification.effective_recipient || notification.intended_recipient}
                  showBanner={false}
                />
              </div>
            ) : null}

            {/* Summary Metadata Grid */}
            <section className="rounded-xl border bg-card p-4 text-xs shadow-2xs">
              <h3 className="mb-3 font-semibold text-sm text-foreground flex items-center gap-2">
                <Mail className="size-4 text-primary" /> Delivery Metadata
              </h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Intended Recipient</dt>
                  <dd className="font-medium font-mono text-foreground">{notification.intended_recipient || 'None'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Effective Delivery Recipient</dt>
                  <dd className="font-medium font-mono text-foreground">{notification.effective_recipient || 'None'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Template Key</dt>
                  <dd className="font-medium text-foreground">
                    {notification.template_key || '—'} {notification.template_version ? `(v${notification.template_version})` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Event Type</dt>
                  <dd className="font-medium text-foreground">{eventDisplayLabels[notification.notification_type] || notification.notification_type}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Delivery Provider</dt>
                  <dd className="font-medium capitalize text-foreground">{notification.provider || 'local'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provider Message ID</dt>
                  <dd className="font-mono text-foreground flex items-center gap-1">
                    {notification.provider_message_id ? (
                      <>
                        <span className="truncate max-w-[160px]">{notification.provider_message_id}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(notification.provider_message_id!, 'provider_id')}
                          className="hover:text-foreground"
                          title="Copy Provider Message ID"
                        >
                          {copiedField === 'provider_id' ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                        </button>
                      </>
                    ) : (
                      'Not assigned yet'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created At</dt>
                  <dd className="font-medium text-foreground">{formatDateTime(notification.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Delivered / Updated At</dt>
                  <dd className="font-medium text-foreground">{formatDateTime(notification.delivered_at || notification.created_at)}</dd>
                </div>
              </dl>
            </section>

            {/* Delivery Timeline */}
            <section className="rounded-xl border bg-card p-4 text-xs shadow-2xs">
              <h3 className="mb-3 font-semibold text-sm text-foreground flex items-center gap-2">
                <Clock className="size-4 text-primary" /> Delivery Lifecycle Timeline
              </h3>
              <ol className="relative border-l border-muted pl-4 space-y-4">
                {notification.timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <EmailStatusBadge status={event.event_type} showTooltip={false} />
                      <span className="text-[11px] text-muted-foreground">{formatDateTime(event.event_at)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Source: <strong className="text-foreground">{event.source}</strong></span>
                      {event.provider_event_id ? (
                        <span>· Webhook ID: <code className="font-mono">{event.provider_event_id.slice(0, 12)}…</code></span>
                      ) : null}
                    </div>
                  </li>
                ))}
                {notification.timeline.length === 0 ? (
                  <li className="text-muted-foreground">No chronological events logged yet.</li>
                ) : null}
              </ol>
            </section>

            {/* Attempts History */}
            <section className="rounded-xl border bg-card p-4 text-xs shadow-2xs">
              <h3 className="mb-3 font-semibold text-sm text-foreground flex items-center gap-2">
                <Server className="size-4 text-primary" /> Delivery Attempt Log
              </h3>
              <div className="space-y-2">
                {notification.attempts.map((attempt) => (
                  <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5">
                    <div>
                      <p className="font-medium text-foreground">
                        Attempt #{attempt.attempt_number} · <span className="capitalize">{attempt.provider}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Started: {formatDateTime(attempt.started_at)}
                        {attempt.completed_at ? ` · Completed: ${formatDateTime(attempt.completed_at)}` : ''}
                      </p>
                      {attempt.error_code ? (
                        <p className="mt-1 font-mono text-[11px] text-destructive">
                          Error: {attempt.error_code}
                        </p>
                      ) : null}
                    </div>
                    <EmailStatusBadge status={attempt.status} showTooltip={false} />
                  </div>
                ))}
                {notification.attempts.length === 0 ? (
                  <p className="text-muted-foreground">No attempt attempts have been logged by the worker yet.</p>
                ) : null}
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Retry Confirmation Dialog */}
      <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retry Technical Send</DialogTitle>
            <DialogDescription>
              This will re-queue the exact same notification in the worker after a technical timeout or network error. It does not create a duplicate customer notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <p><strong>Recipient:</strong> {notification.effective_recipient || notification.intended_recipient}</p>
              <p><strong>Last Error:</strong> {notification.failure_code || 'PROVIDER_NETWORK_ERROR'}</p>
              <p><strong>Attempts So Far:</strong> {notification.attempts.length}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry-reason">Operator Reason</Label>
              <Input
                id="retry-reason"
                value={retryReason}
                onChange={(e) => setRetryReason(e.target.value)}
                placeholder="Why is this send being retried?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetryDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={executeRetry} disabled={submitting || !retryReason.trim()}>
              {submitting ? 'Queuing…' : 'Schedule Retry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Confirmation Dialog */}
      <Dialog open={resendDialogOpen} onOpenChange={setResendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Another Copy (Resend)</DialogTitle>
            <DialogDescription>
              This intentionally creates a <strong>new, audited delivery copy</strong> to the customer linked back to this parent notification. Use this when a customer requests a fresh receipt or tracking update.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <p><strong>Recipient:</strong> {notification.intended_recipient}</p>
              <p><strong>Template:</strong> {notification.template_key} v{notification.template_version || 1}</p>
              <p><strong>Original Send:</strong> {formatDateTime(notification.created_at)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resend-reason">Audited Reason</Label>
              <Input
                id="resend-reason"
                value={resendReason}
                onChange={(e) => setResendReason(e.target.value)}
                placeholder="e.g. Customer requested another copy via WhatsApp support"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResendDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={executeResend} disabled={submitting || !resendReason.trim()}>
              {submitting ? 'Creating Copy…' : 'Send New Copy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
