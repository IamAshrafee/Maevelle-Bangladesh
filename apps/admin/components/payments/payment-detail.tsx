'use client';

import {
  ArrowLeft,
  ExternalLink,
  Landmark,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  UserRound,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { FinancialAccountDto, PaymentDetailDto, RefundDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalEmptyState, OperationalFeedback } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchApiData } from '@/lib/api';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';

import { FinancePostingDialog, RefundDialog } from './payment-command-dialogs';

export function PaymentDetail({ paymentId }: { readonly paymentId: string }) {
  const canPostFinance = useAdminCapability('finance.cash.record_manual');
  const canManageRefunds = useAdminCapability('refunds.manage');

  const [payment, setPayment] = useState<PaymentDetailDto>();
  const [accounts, setAccounts] = useState<readonly FinancialAccountDto[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; tone: 'success' | 'danger' } | null>(null);

  const [postingOpen, setPostingOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetchApiData<readonly FinancialAccountDto[]>('/admin/finance/accounts');
      setAccounts(res);
    } catch {
      // Ignore if accounts cannot be loaded
    }
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await fetchApiData<PaymentDetailDto>(`/admin/payments/${encodeURIComponent(paymentId)}`);
      setPayment(data);
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Payment could not be loaded.');
      setState('error');
    }
  }, [paymentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitPosting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payment) return;
    setBusy(true);
    setActionFeedback(null);
    try {
      const formData = new FormData(event.currentTarget);
      const accountId = formData.get('accountId');
      await fetchApiData(`/admin/finance/payments/${payment.id}/posting`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          accountId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setPostingOpen(false);
      setActionFeedback({
        message: 'Payment has been successfully posted to the treasury account ledger.',
        tone: 'success',
      });
      await load();
    } catch (err) {
      setActionFeedback({
        message: err instanceof Error ? err.message : 'Failed to post payment to account.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payment) return;
    const formData = new FormData(event.currentTarget);
    if (!window.confirm('Create this refund request? Completed refunds are immutable financial facts.')) {
      return;
    }
    setBusy(true);
    setActionFeedback(null);
    try {
      const created = await fetchApiData<RefundDto>(`/admin/payments/${payment.id}/refunds`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          amount: formData.get('amount'),
          reasonCode: formData.get('reasonCode'),
        }),
      });

      const externalReference = String(formData.get('externalReference') ?? '').trim();
      if (externalReference) {
        await fetchApiData<RefundDto>(`/admin/refunds/${created.id}/complete`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({ externalReference }),
        });
        setActionFeedback({
          message: `Refund ${created.refundNumber} completed with reference ${externalReference}.`,
          tone: 'success',
        });
      } else {
        setActionFeedback({
          message: `Refund ${created.refundNumber} requested. Complete it once disbursed.`,
          tone: 'success',
        });
      }
      setRefundOpen(false);
      await load();
    } catch (err) {
      setActionFeedback({
        message: err instanceof Error ? err.message : 'Failed to issue refund.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return (
      <main className="grid gap-4 px-4 py-6 sm:px-6 lg:px-8" aria-label="Loading payment">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </main>
    );
  }

  if (state === 'error' || !payment) {
    return (
      <main className="grid gap-4 px-4 py-10 text-sm sm:px-6 lg:px-8">
        <p className="text-destructive">
          <XCircle className="mr-2 inline size-4" />
          {message}
        </p>
        <Button render={<Link href="/payments" />} variant="outline">
          <ArrowLeft className="size-4" /> Back to payments
        </Button>
      </main>
    );
  }

  const canRefund = canManageRefunds && payment.status === 'CONFIRMED' && Number(payment.net) > 0;
  const needsPosting = !payment.financePosting && payment.status === 'CONFIRMED';

  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              href="/payments"
            >
              <ArrowLeft className="size-4" /> Payments
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{payment.paymentNumber}</h1>
              <StatusBadge status={payment.status} />
              <StatusBadge status={payment.method} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirmed {formatFinanceDate(payment.confirmedAt, true)} · reference{' '}
              {payment.externalReference}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {needsPosting && canPostFinance ? (
              <Button
                variant="outline"
                onClick={() => {
                  void loadAccounts();
                  setPostingOpen(true);
                }}
              >
                <Landmark className="size-4" /> Post to account
              </Button>
            ) : null}
            {canRefund ? (
              <Button variant="outline" onClick={() => setRefundOpen(true)}>
                <RotateCcw className="size-4" /> Issue refund
              </Button>
            ) : null}
            <Button render={<Link href={`/orders/${payment.orderId}`} />} variant="outline">
              Open order <ExternalLink className="size-4" />
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>
        </header>

        {actionFeedback ? (
          <OperationalFeedback tone={actionFeedback.tone}>
            {actionFeedback.message}
          </OperationalFeedback>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Summary label="Collected" value={formatMoney(payment.amount, payment.currency)} />
          <Summary label="Refunded" value={formatMoney(payment.refunded, payment.currency)} />
          <Summary label="Retained" value={formatMoney(payment.net, payment.currency)} />
          <Summary
            label="Order outstanding"
            value={formatMoney(payment.order.outstanding, payment.order.currency)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="size-4" /> Order and customer
              </CardTitle>
              <CardDescription>The commercial obligation this payment satisfies.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Detail label="Order">
                <Link
                  className="font-medium text-primary hover:underline"
                  href={`/orders/${payment.orderId}`}
                >
                  {payment.orderNumber}
                </Link>
              </Detail>
              <Detail label="Order total">
                {formatMoney(payment.order.total, payment.order.currency)}
              </Detail>
              <Detail label="Order status">
                <StatusBadge status={payment.order.status} />
              </Detail>
              <Detail label="Payment status">
                <StatusBadge status={payment.order.paymentStatus} />
              </Detail>
              <Detail label="Customer">
                {payment.customer.id ? (
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/customers/${payment.customer.id}`}
                  >
                    {payment.customer.name}
                  </Link>
                ) : (
                  payment.customer.name
                )}
              </Detail>
              <Detail label="Contact">
                <span>{payment.customer.phone}</span>
                {payment.customer.email ? (
                  <span className="block text-xs text-muted-foreground">
                    {payment.customer.email}
                  </span>
                ) : null}
              </Detail>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {payment.source.type === 'COD_COLLECTION' ? (
                  <PackageCheck className="size-4" />
                ) : (
                  <UserRound className="size-4" />
                )}
                Collection provenance
              </CardTitle>
              <CardDescription>How the confirmed money entered Maevelle.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Detail label="Source">
                {payment.source.type === 'COD_COLLECTION'
                  ? 'Delivered COD collection'
                  : 'Verified manual submission'}
              </Detail>
              <Detail label="Method">{humanizeFinanceCode(payment.method)}</Detail>
              {payment.source.type === 'COD_COLLECTION' ? (
                <>
                  <Detail label="Delivery">
                    <Link
                      className="font-medium text-primary hover:underline"
                      href="/deliveries"
                    >
                      {payment.source.deliveryNumber}
                    </Link>
                  </Detail>
                  <Detail label="Courier">{payment.source.carrierName ?? 'Manual courier'}</Detail>
                  <Detail label="Tracking reference">
                    {payment.source.trackingReference ?? 'Not recorded'}
                  </Detail>
                  <Detail label="Delivered">
                    {payment.source.deliveredAt
                      ? formatFinanceDate(payment.source.deliveredAt, true)
                      : 'Not recorded'}
                  </Detail>
                </>
              ) : (
                <Detail label="Submitted">
                  {formatFinanceDate(payment.source.submittedAt, true)}
                </Detail>
              )}
              <Detail label="Account destination">
                {payment.financePosting ? (
                  <Link
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    href={`/finance/accounts/${payment.financePosting.accountId}`}
                  >
                    <Landmark className="size-4" /> {payment.financePosting.accountName}
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-amber-700 dark:text-amber-400 font-medium">Awaiting account posting</span>
                    {canPostFinance ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          void loadAccounts();
                          setPostingOpen(true);
                        }}
                      >
                        Post now
                      </Button>
                    ) : null}
                  </div>
                )}
              </Detail>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Refund history</CardTitle>
            <CardDescription>
              Refunds remain separate, traceable financial events against this payment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payment.refunds.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Refund</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payment.refunds.map((refund) => (
                    <TableRow key={refund.id}>
                      <TableCell className="font-medium">{refund.refundNumber}</TableCell>
                      <TableCell>
                        <StatusBadge status={refund.status} />
                      </TableCell>
                      <TableCell>{humanizeFinanceCode(refund.reasonCode)}</TableCell>
                      <TableCell>{formatFinanceDate(refund.requestedAt)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(refund.amount, refund.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <OperationalEmptyState
                title="No refunds"
                description="This payment retains its full confirmed value."
              />
            )}
          </CardContent>
        </Card>

        {postingOpen && (
          <FinancePostingDialog
            target={{ kind: 'payment', item: payment }}
            accounts={accounts}
            busy={busy}
            onClose={() => setPostingOpen(false)}
            onSubmit={submitPosting}
          />
        )}

        {refundOpen && (
          <RefundDialog
            payment={payment}
            busy={busy}
            onClose={() => setRefundOpen(false)}
            onSubmit={submitRefund}
          />
        )}
      </div>
    </main>
  );
}

function Summary({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}
