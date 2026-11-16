'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Landmark,
  Mail,
  Phone,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Truck,
  User,
} from 'lucide-react';
import type { FinancialAccountDto, PaymentDetailDto, RefundDto } from '@maevelle/contracts';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { toast } from '@/components/ui/toast';
import { fetchApiData } from '@/lib/api';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';
import { paymentError } from '@/lib/payments/transport';
import { useAdminContext } from '../admin-capabilities';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
  CopyButton,
  PaymentMoney,
  PaymentNotice,
  PaymentQueryState,
  paymentLabel,
} from './payment-ui';
import { ReceiptReconciliation } from './receipt-workspace';
import { CashSettlementPanel } from './cash-settlement-panel';
import { PaymentGuide } from './payment-guide';
import {
  FinancePostingDialog,
  RefundCompletionDialog,
  RefundDialog,
  type PaymentPostingTarget,
} from './payment-command-dialogs';

export function PaymentDetail({ paymentId }: { readonly paymentId: string }) {
  const context = useAdminContext();
  const allowed = usePaymentPermission('payments.view');
  const canRefund = usePaymentPermission('refunds.manage');
  const canPostFinance = usePaymentPermission('finance.cash.record_manual');

  const [refundOpen, setRefundOpen] = useState(false);
  const [postingTarget, setPostingTarget] = useState<PaymentPostingTarget | null>(null);
  const [completionTarget, setCompletionTarget] = useState<RefundDto | null>(null);
  const [busy, setBusy] = useState(false);

  const q = usePaymentQuery<PaymentDetailDto>(
    allowed ? `/admin/payments/${encodeURIComponent(paymentId)}` : null,
  );

  const accounts = usePaymentQuery<readonly FinancialAccountDto[]>(
    canPostFinance ? '/admin/finance/accounts' : null,
  );

  if (!allowed)
    return (
      <AdminPage>
        <PaymentNotice tone="warning">Payment viewing permission is required.</PaymentNotice>
      </AdminPage>
    );

  const p = q.data;

  // Handlers for modal actions
  async function handleRefundSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!p || busy) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const key = crypto.randomUUID();
    try {
      await fetchApiData(`/admin/payments/${p.id}/refunds`, {
        method: 'POST',
        headers: {
          'idempotency-key': key,
          'x-organization-id': context.organizationId,
        },
        body: JSON.stringify({
          amount: String(form.get('amount')),
          reasonCode: String(form.get('reasonCode')),
          reasonText: String(form.get('reasonText') ?? ''),
        }),
      });
      toast.add({ title: 'Refund request created', type: 'success' });
      setRefundOpen(false);
      q.refresh();
    } catch (err) {
      toast.add({ title: paymentError(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handlePostingSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postingTarget || busy) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const key = crypto.randomUUID();
    const isPayment = postingTarget.kind === 'payment';
    const id = postingTarget.item.id;
    const path = isPayment
      ? `/admin/finance/payments/${id}/posting`
      : `/admin/finance/refunds/${id}/posting`;
    try {
      await fetchApiData(path, {
        method: 'POST',
        headers: {
          'idempotency-key': key,
          'x-organization-id': context.organizationId,
        },
        body: JSON.stringify({
          accountId: String(form.get('accountId')),
          idempotencyKey: key,
        }),
      });
      toast.add({ title: 'Financial treasury posting recorded', type: 'success' });
      setPostingTarget(null);
      q.refresh();
    } catch (err) {
      toast.add({ title: paymentError(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleCompletionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completionTarget || busy) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const key = crypto.randomUUID();
    try {
      await fetchApiData(`/admin/refunds/${completionTarget.id}/complete`, {
        method: 'POST',
        headers: {
          'idempotency-key': key,
          'x-organization-id': context.organizationId,
        },
        body: JSON.stringify({
          externalReference: String(form.get('externalReference')),
        }),
      });
      toast.add({ title: 'Refund marked complete', type: 'success' });
      setCompletionTarget(null);
      q.refresh();
    } catch (err) {
      toast.add({ title: paymentError(err), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage>
      <PageHeader
        breadcrumbs={[
          { label: 'Customer payments', href: '/payments?tab=payments' },
          { label: p ? p.paymentNumber : 'Payment details', current: true },
        ]}
        eyebrow="Payment Record"
        title={p ? p.paymentNumber : 'Payment details'}
        badge={
          p ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-semibold text-xs">
                {humanizeFinanceCode(p.method)}
              </Badge>
              <StatusBadge status={p.status} />
            </div>
          ) : null
        }
        description="Comprehensive audit of funds received, order balance, treasury ledger posting, and customer refund history."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {p && canRefund && p.status === 'CONFIRMED' && Number(p.net) > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRefundOpen(true)}>
                <RotateCcw className="size-3.5" />
                Request Refund
              </Button>
            )}
            {p && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                render={<Link href={`/orders/${p.orderId}`} />}
              >
                View Order
                <ExternalLink className="size-3.5" />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={q.refresh}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <PaymentGuide
              title="Payment Record Audit"
              description="Complete transaction audit trail of money collected for an order, including independent receipt verification, Finance treasury postings, and customer return refunds."
              steps={[
                'Audit Gross Received vs. Net Retained funds after completed customer refunds.',
                'Inspect the verified receipt evidence, external provider TxID, and verification timestamp.',
                'Verify that the transaction has posted to the appropriate authorized Treasury account in Finance.',
                'Use the Request Refund action to disburse funds back to the customer for returned merchandise.',
              ]}
              tips={[
                'Receipt-backed manual payments (bKash/Nagad) post atomically to Finance upon operator verification.',
                'Refunds cannot exceed the net retained balance on the original payment.',
              ]}
              relatedLinks={[
                ...(p?.orderId ? [{ label: 'View Linked Order', href: `/orders/${p.orderId}` }] : []),
                { label: 'Treasury Accounts', href: '/finance/accounts' },
                { label: 'Courier COD Settlements', href: '/finance/cod-settlements' },
              ]}
            />
          </div>
        }
      />

      <PaymentQueryState query={q}>
        {p ? (
          <div className="grid gap-6">
            {/* 4-Metric KPI Strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="p-4 space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Originally Received
                  </span>
                  <PaymentMoney value={p.amount} currency={p.currency} size="xl" />
                  <span className="block text-[11px] text-muted-foreground font-mono tabular-nums">
                    Gross collected funds
                  </span>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="p-4 space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Net Retained Funds
                  </span>
                  <PaymentMoney
                    value={p.net}
                    currency={p.currency}
                    size="xl"
                    className="text-emerald-600 dark:text-emerald-400 font-bold"
                  />
                  <span className="block text-[11px] text-muted-foreground font-mono tabular-nums">
                    Collected less refunds
                  </span>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="p-4 space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Completed Refunds
                  </span>
                  <PaymentMoney
                    value={p.refunded}
                    currency={p.currency}
                    size="xl"
                    className={Number(p.refunded) > 0 ? 'text-destructive font-bold' : ''}
                  />
                  <span className="block text-[11px] text-muted-foreground font-mono tabular-nums">
                    {p.refunds.length} refund requests
                  </span>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="p-4 space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Order Balance Due
                  </span>
                  <PaymentMoney
                    value={p.order.outstanding}
                    currency={p.currency}
                    size="xl"
                    className={
                      Number(p.order.outstanding) > 0
                        ? 'text-rose-600 dark:text-rose-400 font-bold'
                        : 'text-emerald-600 dark:text-emerald-400 font-bold'
                    }
                  />
                  <span className="block text-[11px] text-muted-foreground font-mono tabular-nums">
                    Total: {formatMoney(p.order.total, p.order.currency)}
                  </span>
                </CardContent>
              </Card>
            </div>

            {/* Main Details Grid: 2 Columns */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Card 1: Payment & Customer Provenance */}
              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="grid gap-4 p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70 pb-2.5">
                    Transaction & Order Information
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div>
                      <span className="block text-xs text-muted-foreground">Payment Number</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono font-bold text-foreground">{p.paymentNumber}</span>
                        <CopyButton value={p.paymentNumber} label="Payment Number" />
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs text-muted-foreground">Originating Order</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Link
                          href={`/orders/${p.orderId}`}
                          className="font-mono font-bold text-primary hover:underline"
                        >
                          {p.orderNumber}
                        </Link>
                        <CopyButton value={p.orderNumber} label="Order Number" />
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs text-muted-foreground">Transaction Reference</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {p.externalReference ? (
                          <>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
                              {p.externalReference}
                            </code>
                            <CopyButton value={p.externalReference} label="Reference" />
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">None recorded</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs text-muted-foreground">Confirmed Timestamp</span>
                      <span className="block font-mono text-xs text-foreground mt-0.5 tabular-nums">
                        {formatFinanceDate(p.confirmedAt, true)}
                      </span>
                    </div>
                  </div>

                  {/* Customer Information */}
                  {p.customer && (
                    <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2 mt-1">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <User className="size-3.5 text-muted-foreground" />
                        <span>Customer: {p.customer.name}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                        {p.customer.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="size-3" />
                            <a
                              href={`tel:${p.customer.phone}`}
                              className="font-mono text-foreground hover:text-primary hover:underline"
                            >
                              {p.customer.phone}
                            </a>
                            <CopyButton value={p.customer.phone} label="Phone" />
                          </div>
                        )}
                        {p.customer.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="size-3" />
                            <a
                              href={`mailto:${p.customer.email}`}
                              className="text-foreground hover:text-primary hover:underline truncate"
                            >
                              {p.customer.email}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Collection Source Details */}
                  {p.source && (
                    <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1.5">
                      <span className="font-semibold text-foreground">
                        {p.source.type === 'COD_COLLECTION'
                          ? 'Courier Delivery Collection'
                          : 'Manual Claim Submission'}
                      </span>
                      {p.source.type === 'COD_COLLECTION' ? (
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                          <div>
                            Delivery:{' '}
                            <strong className="text-foreground font-mono">{p.source.deliveryNumber}</strong>
                          </div>
                          <div>
                            Courier:{' '}
                            <strong className="text-foreground">{p.source.carrierName ?? 'Manual'}</strong>
                          </div>
                          {p.source.trackingReference && (
                            <div className="col-span-2 flex items-center gap-1.5">
                              <span>Tracking:</span>
                              <code className="font-mono text-foreground">{p.source.trackingReference}</code>
                              <CopyButton value={p.source.trackingReference} label="Tracking" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          Submission ID: <code className="font-mono text-foreground">{p.source.id}</code>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 2: Financial Ledger & Treasury Posting */}
              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="grid gap-4 p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70 pb-2.5">
                    Treasury & Financial Ledger Status
                  </h3>

                  {p.financePosting ? (
                    <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20 p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Landmark className="size-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                            Posted to Treasury Account
                          </span>
                        </div>
                        <StatusBadge status="POSTED" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                        <div>
                          Account:{' '}
                          <strong className="text-foreground">{p.financePosting.accountName}</strong>
                        </div>
                        <div>
                          Transaction:{' '}
                          <code className="font-mono text-foreground">
                            {p.financePosting.transactionNumber}
                          </code>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        This inflow is balanced in the authoritative general ledger. Do not post again.
                      </p>
                    </div>
                  ) : p.method === 'COD' ? (
                    <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20 p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Truck className="size-4 text-amber-600 dark:text-amber-400" />
                          <span className="font-semibold text-amber-900 dark:text-amber-300">
                            Courier Holding (COD)
                          </span>
                        </div>
                        <StatusBadge status="PENDING" />
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        Cash collected by courier upon delivery. Track courier batch remittances in{' '}
                        <Link href="/finance/cod-settlements" className="font-medium text-primary hover:underline">
                          Finance COD settlements →
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          Not Posted to Financial Ledger
                        </span>
                        <StatusBadge status="NOT_POSTED" />
                      </div>
                      <p className="text-muted-foreground">
                        This legacy or manual record has not been posted into an active treasury cash/bank account.
                      </p>
                      {canPostFinance && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs font-semibold"
                          disabled={!accounts.data?.length}
                          onClick={() => setPostingTarget({ kind: 'payment', item: p })}
                        >
                          <Landmark className="size-3.5" />
                          Record Treasury Posting
                        </Button>
                      )}
                    </div>
                  )}

                </CardContent>
              </Card>
            </div>

            {/* Reconciliation / COD Settlement Section */}
            {p.method === 'COD' ? (
              <CashSettlementPanel orderId={p.orderId} />
            ) : (
              <ReceiptReconciliation payment={p} refresh={q.refresh} showRefundAction />
            )}

            {/* Refund History Table */}
            <Card className="border-border bg-card shadow-2xs">
              <CardContent className="grid gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Refund Obligations</h3>
                    <p className="text-xs text-muted-foreground">
                      Customer refund requests and payout tracking for this payment.
                    </p>
                  </div>
                  {canRefund && p.status === 'CONFIRMED' && Number(p.net) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => setRefundOpen(true)}
                    >
                      <RotateCcw className="size-3.5" />
                      Request Refund
                    </Button>
                  )}
                </div>

                {p.refunds.length > 0 ? (
                  <>
                    {/* Mobile Cards (< 768px) */}
                    <div className="grid gap-3 md:hidden">
                      {p.refunds.map((refund) => (
                        <div
                          key={refund.id}
                          className="rounded-lg border bg-muted/20 p-3.5 text-xs space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="font-mono font-bold text-foreground">
                                {refund.refundNumber}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {humanizeFinanceCode(refund.reasonCode)}
                              </span>
                            </div>
                            <StatusBadge status={refund.status} />
                          </div>

                          <div className="flex items-baseline justify-between rounded-md bg-rose-50/50 dark:bg-rose-950/20 px-2.5 py-1.5 border border-rose-200/60 dark:border-rose-900/40">
                            <span className="text-[11px] text-muted-foreground">Refund amount:</span>
                            <span className="font-mono text-xs font-bold tabular-nums text-destructive">
                              -{formatMoney(refund.amount, refund.currency)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Requested:</span>
                            <time dateTime={refund.requestedAt}>
                              {formatFinanceDate(refund.requestedAt, true)}
                            </time>
                          </div>

                          {['REQUESTED', 'PROCESSING'].includes(refund.status) && (
                            <Button
                              size="sm"
                              className="w-full h-8 text-xs font-semibold gap-1.5"
                              disabled={busy}
                              onClick={() => setCompletionTarget(refund)}
                            >
                              <CheckCircle2 className="size-3.5" />
                              Complete Refund Payout
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table (>= 768px) */}
                    <div className="hidden md:block">
                      <Table density="compact">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[140px]">Refund</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Funding account</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.refunds.map((refund) => (
                            <TableRow key={refund.id}>
                              <TableCell>
                                <div className="flex items-center gap-1 font-mono font-semibold text-foreground text-xs">
                                  <span>{refund.refundNumber}</span>
                                  <CopyButton value={refund.refundNumber} label="Refund Number" />
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold tabular-nums text-destructive">
                                -{formatMoney(refund.amount, refund.currency)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={refund.status} />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {humanizeFinanceCode(refund.reasonCode)}
                              </TableCell>
                              <TableCell>
                                {refund.externalReference ? (
                                  <div className="flex items-center gap-1">
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                                      {refund.externalReference}
                                    </code>
                                    <CopyButton value={refund.externalReference} label="Reference" />
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Pending</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {refund.financePosting ? (
                                  <span className="font-medium text-foreground">
                                    {refund.financePosting.accountName}
                                  </span>
                                ) : (
                                  <span>—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                                <time dateTime={refund.requestedAt}>
                                  {formatFinanceDate(refund.requestedAt)}
                                </time>
                              </TableCell>
                              <TableCell className="text-right">
                                {['REQUESTED', 'PROCESSING'].includes(refund.status) ? (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-8 gap-1.5 text-xs font-semibold"
                                    disabled={busy}
                                    onClick={() => setCompletionTarget(refund)}
                                  >
                                    <CheckCircle2 className="size-3.5" />
                                    Complete
                                  </Button>
                                ) : refund.status === 'COMPLETED' &&
                                  !refund.financePosting &&
                                  canPostFinance ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1.5 text-xs font-medium"
                                    disabled={busy || !accounts.data?.length}
                                    onClick={() =>
                                      setPostingTarget({ kind: 'refund', item: refund })
                                    }
                                  >
                                    <Landmark className="size-3.5" />
                                    Record account
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No refund obligations or payouts recorded for this payment.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Refund Dialog */}
            {refundOpen && (
              <RefundDialog
                payment={p}
                busy={busy}
                onClose={() => setRefundOpen(false)}
                onSubmit={handleRefundSubmit}
              />
            )}

            {/* Posting Dialog */}
            {postingTarget && (
              <FinancePostingDialog
                target={postingTarget}
                accounts={accounts.data ?? []}
                busy={busy}
                onClose={() => setPostingTarget(null)}
                onSubmit={handlePostingSubmit}
              />
            )}

            {/* Completion Dialog */}
            {completionTarget && (
              <RefundCompletionDialog
                refund={completionTarget}
                busy={busy}
                onClose={() => setCompletionTarget(null)}
                onSubmit={handleCompletionSubmit}
              />
            )}
          </div>
        ) : null}
      </PaymentQueryState>
    </AdminPage>
  );
}
