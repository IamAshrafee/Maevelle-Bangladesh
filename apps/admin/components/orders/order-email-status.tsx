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
  intended_recipient: string | null;
  created_at: string;
};

export function OrderEmailStatus({ orderId, hasEmail }: { orderId: string; hasEmail: boolean }) {
  const [rows, setRows] = useState<readonly EmailRow[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/email/operations?page=1&pageSize=50&sourceId=${encodeURIComponent(orderId)}`, { credentials: 'include' });
    const payload = (await response.json()) as { data?: EmailRow[]; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? 'Email status could not be loaded.');
    setRows(payload.data ?? []);
  }, [orderId]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Email status could not be loaded.')); }, [load]);
  const queue = async (notificationType: string) => {
    const response = await fetch(`/api/admin/email/orders/${orderId}/send`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notificationType, idempotencyKey: crypto.randomUUID(), reason: 'Manual send from Order detail' }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
      setError(payload?.error?.message ?? 'Email could not be queued.');
      return;
    }
    setError('');
    await load();
  };
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-4"><div><h2 className="text-lg font-medium">Order emails</h2><p className="text-xs text-muted-foreground">Automatic and manual transactional delivery</p></div><Link href="/email" className="text-sm text-primary hover:underline">Open email operations</Link></div>
      <div className="space-y-3 px-6 py-4">
        {!hasEmail ? <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">This order has no email address. Email events will be recorded as skipped instead of retried.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"><div><p className="font-medium">{row.notification_type.replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{row.intended_recipient ?? row.skip_reason ?? 'No recipient'} · {new Date(row.created_at).toLocaleString()}</p></div><StatusBadge status={row.status} /></div>)}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No email event has been recorded for this order yet.</p> : null}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!hasEmail} onClick={() => void queue('ORDER_CONFIRMED')}>Send confirmation</Button><Button size="sm" variant="outline" disabled={!hasEmail} onClick={() => void queue('ORDER_CANCELLED')}>Send cancellation</Button></div>
      </div>
    </section>
  );
}
