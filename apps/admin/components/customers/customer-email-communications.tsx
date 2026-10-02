'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmailStatusBadge } from '@/components/email/email-status-badge';
import { EmailDetailDrawer } from '@/components/email/email-detail-drawer';
import {
  type EmailNotificationRowDto,
  type EmailNotificationDetailDto,
  type EmailSuppressionDto,
  fetchEmailApi,
  formatDateTime,
} from '@/components/email/email-types';

interface CustomerEmailCommunicationsProps {
  readonly customerId: string;
  readonly primaryEmail: string | null;
}

export function CustomerEmailCommunications({
  customerId,
  primaryEmail,
}: CustomerEmailCommunicationsProps) {
  const [notifications, setNotifications] = useState<readonly EmailNotificationRowDto[]>([]);
  const [suppression, setSuppression] = useState<EmailSuppressionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Selected notification for drawer
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [notificationDetail, setNotificationDetail] = useState<EmailNotificationDetailDto | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      const normalizedEmail = primaryEmail?.trim().toLowerCase();
      const promises: [
        Promise<{ data?: EmailNotificationRowDto[] }>,
        Promise<{ data?: EmailSuppressionDto[] }> | null,
      ] = [
        fetchEmailApi<{ data: EmailNotificationRowDto[] }>(
          `/admin/email/operations?customerId=${encodeURIComponent(customerId)}&pageSize=20`,
        ),
        normalizedEmail
          ? fetchEmailApi<{ data: EmailSuppressionDto[] }>(`/admin/email/suppressions`)
          : null,
      ];

      const [notificationsRes, suppressionsRes] = await Promise.all([
        promises[0],
        promises[1] ? promises[1] : Promise.resolve({ data: [] as EmailSuppressionDto[] }),
      ]);

      setNotifications(notificationsRes.data ?? []);

      if (normalizedEmail && suppressionsRes?.data) {
        const found = suppressionsRes.data.find(
          (s) => s.normalized_email.toLowerCase() === normalizedEmail && s.active,
        );
        setSuppression(found ?? null);
      } else {
        setSuppression(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer communications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, primaryEmail]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openDetailDrawer = async (notificationId: string) => {
    setSelectedNotificationId(notificationId);
    try {
      const res = await fetchEmailApi<{ data: EmailNotificationDetailDto }>(
        `/admin/email/operations/${notificationId}`,
      );
      setNotificationDetail(res.data);
      setDetailDrawerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load email details.');
    }
  };

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            <h2 className="text-lg font-medium text-foreground">Customer Communications / Email</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Authoritative transactional delivery history and recipient delivery health
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
            href={
              primaryEmail
                ? `/email?tab=activity&recipient=${encodeURIComponent(primaryEmail)}`
                : '/email?tab=activity'
            }
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            All Activity
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      <div className="space-y-4 px-6 py-4">
        {/* Usability Indicator Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3.5 text-xs">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Primary Mailbox Deliverability
            </span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">
                {primaryEmail || 'No primary email configured'}
              </span>
              {!primaryEmail ? (
                <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
                  Missing
                </Badge>
              ) : suppression ? (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <ShieldAlert className="size-3" />
                  Suppressed ({suppression.reason.replaceAll('_', ' ')})
                </Badge>
              ) : (
                <Badge className="bg-emerald-600/10 text-emerald-800 border-emerald-500/30 dark:text-emerald-300">
                  <CheckCircle2 className="mr-1 size-3" />
                  Usable
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              {!primaryEmail
                ? 'Transactional emails are automatically skipped without interrupting order progress.'
                : suppression
                  ? `Sending blocked to protect sender reputation. Suppressed via ${suppression.source} on ${formatDateTime(suppression.created_at)}.`
                  : 'Eligible for all automated transactional receipts, dispatches, and manual notifications.'}
            </p>
          </div>

          {suppression ? (
            <Link
              href="/email?tab=suppressions"
              className="shrink-0 self-start sm:self-center"
            >
              <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/5">
                Manage Suppression
              </Button>
            </Link>
          ) : null}
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        ) : null}

        {/* Transactional Notifications History */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dispatched Transactional Messages ({notifications.length})
          </h3>

          {loading ? (
            <div className="space-y-2 py-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              <Mail className="mx-auto mb-1.5 size-6 text-muted-foreground/50" />
              <p className="font-medium text-foreground">No transactional emails recorded</p>
              <p className="mt-0.5">
                Emails sent for orders placed by this customer will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-background/50">
              {notifications.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/20 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {row.notification_type.replaceAll('_', ' ')}
                      </span>
                      <EmailStatusBadge status={row.status} size="sm" />
                      {row.trigger_type === 'TEST' ? (
                        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 border-purple-500/30">
                          Test
                        </Badge>
                      ) : row.trigger_type === 'MANUAL' ? (
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-500/30">
                          Manual
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>to {row.intended_recipient ?? 'No recipient'}</span>
                      <span>•</span>
                      <span>{formatDateTime(row.created_at)}</span>
                      {row.source_id ? (
                        <>
                          <span>•</span>
                          <Link
                            href={`/orders/${row.source_id}`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            <ShoppingBag className="size-3" />
                            View Order
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground shrink-0 self-start sm:self-center"
                    onClick={() => void openDetailDrawer(row.id)}
                  >
                    Timeline &amp; Detail
                    <ChevronRight className="ml-1 size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
