'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  MessageSquareText,
  Phone,
  RefreshCw,
  ShieldBan,
} from 'lucide-react';
import type {
  SmsNotificationDetailDto,
  SmsNotificationRowDto,
  SmsSuppressionDto,
} from '@/components/sms/sms-types';
import {
  formatBangladeshPhone,
  formatSmsDate,
  isPendingSmsStatus,
  smsEventLabel,
} from '@/components/sms/sms-types';
import { fetchSmsApi } from '@/components/sms/sms-api';
import { SmsDetailSheet } from '@/components/sms/sms-detail-sheet';
import { SmsStatusBadge } from '@/components/sms/sms-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function CustomerSmsCommunications({
  customerId,
  primaryPhone,
}: {
  readonly customerId: string;
  readonly primaryPhone: string | null;
}) {
  const [notifications, setNotifications] = useState<readonly SmsNotificationRowDto[]>([]);
  const [suppression, setSuppression] = useState<SmsSuppressionDto | null>(null);
  const [detail, setDetail] = useState<SmsNotificationDetailDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activity, suppressions] = await Promise.all([
        fetchSmsApi<{ items: readonly SmsNotificationRowDto[] }>(
          `/admin/sms/operations?customerId=${encodeURIComponent(customerId)}&pageSize=20`,
        ),
        fetchSmsApi<readonly SmsSuppressionDto[]>('/admin/sms/suppressions'),
      ]);
      setNotifications(activity.items);
      const digits = primaryPhone?.replace(/\D/g, '').slice(-10);
      setSuppression(
        suppressions.find(
          (row) => row.active && digits && row.normalized_phone.replace(/\D/g, '').endsWith(digits),
        ) ?? null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Customer SMS communications could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, primaryPhone]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notifications.some((row) => isPendingSmsStatus(row.status))) return;
    const timer = setInterval(() => void load(), 7000);
    return () => clearInterval(timer);
  }, [load, notifications]);
  const inspect = async (id: string) => {
    try {
      setDetail(await fetchSmsApi<SmsNotificationDetailDto>(`/admin/sms/operations/${id}`));
      setDetailOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SMS detail could not be loaded.');
    }
  };
  const refreshDetail = useCallback(
    async (id: string) => {
      setDetail(await fetchSmsApi<SmsNotificationDetailDto>(`/admin/sms/operations/${id}`));
      await load();
    },
    [load],
  );
  return (
    <>
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquareText aria-hidden="true" className="size-4 text-primary" />
              <h2 className="text-lg font-medium">Customer Communications / SMS</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Transactional SMS history and current phone deliverability context
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>
              <RefreshCw
                aria-hidden="true"
                className={`mr-1 size-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/sms?tab=activity&search=${encodeURIComponent(primaryPhone ?? '')}`} />
              }
            >
              <ExternalLink aria-hidden="true" className="mr-1 size-3.5" />
              All SMS
            </Button>
          </div>
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-background">
                <Phone aria-hidden="true" className="size-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Primary Phone
                </p>
                <p className="font-medium">
                  {primaryPhone ? formatBangladeshPhone(primaryPhone) : 'No primary phone'}
                </p>
              </div>
            </div>
            {!primaryPhone ? (
              <Badge variant="outline">Missing</Badge>
            ) : suppression ? (
              <Badge variant="destructive">
                <ShieldBan aria-hidden="true" className="mr-1 size-3" />
                Suppressed
              </Badge>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-800">
                <CheckCircle2 aria-hidden="true" className="mr-1 size-3" />
                Usable
              </Badge>
            )}
          </div>
          {suppression ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <p className="font-medium text-destructive">Active SMS Suppression</p>
              <p className="mt-1 text-muted-foreground">
                {suppression.reason.replaceAll('_', ' ')} · added{' '}
                {formatSmsDate(suppression.created_at)}. Manage it from the SMS Suppressions area.
              </p>
            </div>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent Transactional SMS
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {notifications.length} records
              </span>
            </div>
            {notifications.length ? (
              <div className="divide-y rounded-lg border">
                {notifications.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    onClick={() => void inspect(row.id)}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {smsEventLabel(row.notification_type)} · {row.order_number ?? row.source_id}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.trigger_type} · {formatSmsDate(row.created_at)} ·{' '}
                        {formatBangladeshPhone(row.effective_recipient)}
                      </p>
                    </div>
                    <SmsStatusBadge status={row.status} compact />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No transactional SMS history for this customer.
              </div>
            )}
          </div>
        </div>
      </section>
      <SmsDetailSheet
        notification={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={refreshDetail}
      />
    </>
  );
}
