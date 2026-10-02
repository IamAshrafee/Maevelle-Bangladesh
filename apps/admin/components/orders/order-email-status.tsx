'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';

type EmailRow = {
  id: string;
  notification_type: string;
  status: string;
  skip_reason: string | null;
  failure_code: string | null;
  failure_message: string | null;
  intended_recipient: string | null;
  effective_recipient: string | null;
  created_at: string;
};

export function OrderEmailStatus({ orderId, hasEmail }: { orderId: string; hasEmail: boolean }) {
  const [rows, setRows] = useState<readonly EmailRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/email/operations?page=1&pageSize=50&sourceId=${encodeURIComponent(orderId)}`,
      { credentials: 'include' },
    );
    const payload = (await response.json()) as { data?: EmailRow[]; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? 'Email status could not be loaded.');
    setRows(payload.data ?? []);
  }, [orderId]);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Email status could not be loaded.'),
    );
  }, [load]);

  const queue = async (notificationType: string) => {
    setActing(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/email/orders/${orderId}/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          notificationType,
          idempotencyKey: crypto.randomUUID(),
          reason: 'Manual send from Order detail',
        }),
      });
      const payload = (await response.json().catch(() => undefined)) as
        | { error?: { message?: string } }
        | undefined;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Email could not be queued.');
      }
      setMessage(`${notificationType.replaceAll('_', ' ')} email queued ✓`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed.');
    } finally {
      setActing(false);
    }
  };

  const retry = async (notificationId: string) => {
    setActing(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/email/operations/${notificationId}/retry`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Retry from Order detail' }),
      });
      const payload = (await response.json().catch(() => undefined)) as
        | { error?: { message?: string } }
        | undefined;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Retry could not be scheduled.');
      }
      setMessage('Retry queued successfully ✓');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed.');
    } finally {
      setActing(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Customer Communications / Emails</h2>
          <p className="text-xs text-muted-foreground">Transactional delivery lifecycle and manual actions</p>
        </div>
        <Link href="/email" className="text-sm font-medium text-primary hover:underline">
          Open Email Operations
        </Link>
      </div>
      <div className="space-y-3 px-6 py-4">
        {!hasEmail ? (
          <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
            Customer has no email address. Transactional emails are skipped without blocking order progress.
          </p>
        ) : null}
        {message ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-sm text-emerald-800 dark:text-emerald-300">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3.5 text-sm"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{row.notification_type.replaceAll('_', ' ')}</p>
                <StatusBadge status={row.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {row.intended_recipient ?? row.skip_reason ?? 'No recipient'} ·{' '}
                {new Date(row.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              {row.status === 'PENDING_MANUAL' ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Automatic email disabled by policy.
                </p>
              ) : null}
              {row.status === 'FAILED' && row.failure_code ? (
                <p className="text-xs text-destructive">
                  Failure: {row.failure_code}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {row.status === 'FAILED' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting}
                  onClick={() => void retry(row.id)}
                >
                  Retry technical failure
                </Button>
              ) : null}
              {row.status === 'PENDING_MANUAL' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting || !hasEmail}
                  onClick={() => void queue(row.notification_type)}
                >
                  Send now
                </Button>
              ) : null}
            </div>
          </div>
        ))}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No customer email event has been recorded for this order yet.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasEmail || acting}
            onClick={() => void queue('ORDER_CONFIRMED')}
          >
            Send confirmation email
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!hasEmail || acting}
            onClick={() => void queue('ORDER_CANCELLED')}
          >
            Send cancellation email
          </Button>
        </div>
      </div>
    </section>
  );
}
