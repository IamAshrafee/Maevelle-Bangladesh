'use client';

import { useState } from 'react';
import { Ban, CheckCircle2, RefreshCw, ShieldBan } from 'lucide-react';
import type { SmsSuppressionDto } from './sms-types';
import { formatBangladeshPhone, formatSmsDate } from './sms-types';
import { fetchSmsApi } from './sms-api';
import { useAdminCapability } from '@/components/admin-capabilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';

export function SmsSuppressionsTab({
  suppressions,
  onRefresh,
}: {
  readonly suppressions: readonly SmsSuppressionDto[];
  readonly onRefresh: () => Promise<void>;
}) {
  const canManage = useAdminCapability('notifications.sms.suppression.manage');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('Customer requested no transactional SMS');
  const [clearTarget, setClearTarget] = useState<SmsSuppressionDto>();
  const [clearReason, setClearReason] = useState(
    'Suppression cleared after authorized customer request',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mutate = async (target: string, active: boolean, auditReason: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fetchSmsApi('/admin/sms/suppressions', {
        method: 'POST',
        body: JSON.stringify({ phone: target, active, reason: auditReason }),
      });
      setMessage(active ? 'Recipient suppressed.' : 'Suppression cleared.');
      setPhone('');
      setClearTarget(undefined);
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Suppression update failed.');
    } finally {
      setBusy(false);
    }
  };
  const activeCount = suppressions.filter((row) => row.active).length;
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldBan aria-hidden="true" className="size-5" />
              Add Suppression
            </CardTitle>
            <CardDescription>
              Blocks future transactional SMS to a normalized Bangladesh mobile. Temporary provider
              errors do not automatically create a suppression.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sms-suppression-phone">Bangladesh Mobile</Label>
              <Input
                id="sms-suppression-phone"
                name="sms-suppression-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="01712-345678…"
                disabled={!canManage}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sms-suppression-reason">Audit Reason</Label>
              <Textarea
                id="sms-suppression-reason"
                name="sms-suppression-reason"
                autoComplete="off"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why should Maevelle block this recipient…"
                disabled={!canManage}
              />
            </div>
            <Button
              className="w-full"
              disabled={!canManage || !phone.trim() || reason.trim().length < 3 || busy}
              onClick={() => void mutate(phone, true, reason)}
            >
              {busy ? (
                <RefreshCw
                  aria-hidden="true"
                  className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Ban aria-hidden="true" className="mr-2 size-4" />
              )}
              Suppress Recipient
            </Button>
            {!canManage ? (
              <p className="text-xs text-muted-foreground">
                Your role can review suppressions but cannot change them.
              </p>
            ) : null}
            {message ? (
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Suppression Registry</CardTitle>
                <CardDescription>
                  Active and historical protection decisions with source and reason.
                </CardDescription>
              </div>
              <Badge variant={activeCount ? 'destructive' : 'outline'}>{activeCount} active</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {suppressions.length ? (
              <div className="divide-y">
                {suppressions.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{formatBangladeshPhone(row.normalized_phone)}</p>
                        <Badge variant={row.active ? 'destructive' : 'outline'}>
                          {row.active ? 'Suppressed' : 'Cleared'}
                        </Badge>
                      </div>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {row.reason.replaceAll('_', ' ')} · {row.source} · Added{' '}
                        {formatSmsDate(row.created_at)}
                      </p>
                      {row.cleared_at ? (
                        <p className="mt-1 text-xs text-emerald-700">
                          Cleared {formatSmsDate(row.cleared_at)} · {row.clear_reason}
                        </p>
                      ) : null}
                    </div>
                    {row.active && canManage ? (
                      <Button size="sm" variant="outline" onClick={() => setClearTarget(row)}>
                        <CheckCircle2 aria-hidden="true" className="mr-1.5 size-3.5" />
                        Clear Suppression
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <CheckCircle2 aria-hidden="true" className="mx-auto size-8 text-emerald-600" />
                <p className="mt-3 font-medium">No SMS Suppressions</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No customer phone is currently blocked from transactional SMS.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={Boolean(clearTarget)}
        onOpenChange={(open) => {
          if (!open) setClearTarget(undefined);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear SMS Suppression?</DialogTitle>
            <DialogDescription>
              Future eligible transactional SMS may be sent to{' '}
              {formatBangladeshPhone(clearTarget?.normalized_phone)}. Existing history remains
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sms-clear-reason">Audit Reason</Label>
            <Textarea
              id="sms-clear-reason"
              name="sms-clear-reason"
              autoComplete="off"
              value={clearReason}
              onChange={(event) => setClearReason(event.target.value)}
              placeholder="Why is this safe to clear…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearTarget(undefined)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || clearReason.trim().length < 3}
              onClick={() =>
                clearTarget && void mutate(clearTarget.normalized_phone, false, clearReason)
              }
            >
              Clear Suppression
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
