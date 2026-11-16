'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, ShieldAlert, XCircle } from 'lucide-react';
import type {
  PaymentPageDto,
  PaymentClaimRowDto,
  PaymentClaimWorkspaceDto,
  FinancialAccountDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';
import { formatFinanceDate } from '@/lib/finance/types';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
  CopyButton,
  PaymentField,
  PaymentMoney,
  PaymentNotice,
  PaymentPager,
  PaymentQueryState,
} from './payment-ui';
import { PaymentCommand } from './payment-command';
import { ReceiptWorkspace } from './receipt-workspace';

export function ClaimReviewQueue() {
  const allowed = usePaymentPermission('payments.review');
  const canView = usePaymentPermission('payments.view');
  const [page, setPage] = useState(1);
  const [selected, select] = useState<string>();

  const q = usePaymentQuery<PaymentPageDto<PaymentClaimRowDto>>(
    allowed ? `/admin/payments/claims?page=${page}` : null,
  );

  useEffect(() => {
    if (q.data && page > 1 && !q.data.items.length)
      setPage(Math.max(1, Math.ceil(q.data.pagination.totalItems / 25)));
  }, [q.data, page]);

  if (!allowed)
    return <PaymentNotice>Payment review permission is required for this queue.</PaymentNotice>;

  if (selected)
    return (
      <ClaimWorkspace
        id={selected}
        onBack={() => {
          select(undefined);
          q.refresh();
        }}
      />
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Pending manual claims</h3>
          {q.data && (
            <p className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {q.data.pagination.totalItems}
              </span>{' '}
              claims submitted by customers awaiting independent verification
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={q.refresh}>
          Refresh queue
        </Button>
      </div>

      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <>
            {/* Mobile Card List (< 768px) */}
            <div className="grid gap-3 md:hidden">
              {q.data.items.map((c) => (
                <Card key={c.id} className="overflow-hidden border-border bg-card shadow-2xs">
                  <CardContent className="grid gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Order:</span>
                          <Link
                            href={`/orders/${c.orderId}`}
                            className="font-mono text-sm font-bold text-primary hover:underline"
                          >
                            {c.orderNumber}
                          </Link>
                        </div>
                        <Badge variant="outline" className="text-[11px]">
                          {c.methodName}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <span className="block text-[11px] text-muted-foreground">Obligation</span>
                        <PaymentMoney value={c.expectedAmount} currency={c.currency} size="sm" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-muted/30 p-2.5 text-xs">
                      <div>
                        <span className="block text-muted-foreground">Reference Claimed</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
                            {c.customerReference}
                          </code>
                          <CopyButton value={c.customerReference} label="Customer Reference" />
                        </div>
                      </div>
                      <StatusBadge status={c.overdue ? 'OVERDUE' : c.reviewState} />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono tabular-nums">
                      <span>Submitted:</span>
                      <time dateTime={c.submittedAt}>
                        {formatFinanceDate(c.submittedAt, true)} ({Math.floor(Number(c.ageSeconds) / 60)}m ago)
                      </time>
                    </div>

                    {c.reviewExpiresAt ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono tabular-nums">
                        <Clock className="size-3 shrink-0" />
                        <span>Deadline: {formatFinanceDate(c.reviewExpiresAt, true)}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">
                        Legacy claim: deadline requires approved operating policy.
                      </span>
                    )}

                    <Button
                      size="sm"
                      className="w-full h-9 text-xs font-semibold"
                      disabled={!canView}
                      onClick={() => select(c.id)}
                    >
                      Open Review Workspace
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop Table (>= 768px) */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table stickyHeader density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Order</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Customer reference</TableHead>
                      <TableHead className="text-right">Obligation</TableHead>
                      <TableHead>Review state</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Review deadline</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data.items.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/orders/${c.orderId}`}
                            className="font-mono font-semibold text-primary hover:underline"
                          >
                            {c.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal text-xs">
                            {c.methodName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-semibold text-foreground">
                              {c.customerReference}
                            </code>
                            <CopyButton value={c.customerReference} label="Customer Reference" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <PaymentMoney value={c.expectedAmount} currency={c.currency} size="sm" />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.overdue ? 'OVERDUE' : c.reviewState} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                          <time dateTime={c.submittedAt}>
                            {formatFinanceDate(c.submittedAt, true)}
                          </time>
                          <span className="block text-[11px] text-muted-foreground">
                            {Math.floor(Number(c.ageSeconds) / 60)}m ago
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono tabular-nums">
                          {c.reviewExpiresAt ? (
                            <span className={c.overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                              {formatFinanceDate(c.reviewExpiresAt, true)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400">
                              No deadline
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 px-3 text-xs font-semibold"
                            disabled={!canView}
                            onClick={() => select(c.id)}
                          >
                            Open review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <EmptyState
            title="No wallet claims found"
            description={
              status === 'PENDING'
                ? 'When a customer submits a bKash or Nagad transaction reference at checkout, it appears here for verification against statements.'
                : `No wallet claims found with status "${status}". Try selecting "All status" or checking pending claims.`
            }
          />
        )}
        {q.data ? (
          <PaymentPager page={page} total={q.data.pagination.totalItems} onPage={setPage} />
        ) : null}
      </PaymentQueryState>
    </div>
  );
}

function ClaimWorkspace({ id, onBack }: { id: string; onBack: () => void }) {
  const q = usePaymentQuery<PaymentClaimWorkspaceDto>(`/admin/payments/attempts/${id}/workspace`);
  const canVerify = usePaymentPermission('payments.verify');
  const canReview = usePaymentPermission('payments.review');
  const canAccounts = usePaymentPermission('finance.accounts.view');

  const accounts = usePaymentQuery<readonly FinancialAccountDto[]>(
    canVerify && canAccounts && q.data?.status === 'PENDING_VERIFICATION'
      ? '/admin/finance/accounts'
      : null,
  );

  const [action, setAction] = useState<'verify' | 'reject' | 'review'>();
  const [result, setResult] = useState<string>();
  const c = q.data;

  const receivingAccounts =
    accounts.data?.filter(
      (account) =>
        account.status === 'ACTIVE' &&
        account.currency_code === 'BDT' &&
        (c?.receivingFinancialAccountId
          ? account.id === c.receivingFinancialAccountId
          : !c?.destinationRevision),
    ) ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
          Back to verification queue
        </Button>
      </div>

      <PaymentQueryState query={q}>
        {c ? (
          <>
            {/* Header / Summary Card */}
            <Card className="border-border bg-card shadow-2xs">
              <CardContent className="grid gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Independent Manual Payment Review
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-foreground">Order:</span>
                      <Link
                        href={`/orders/${c.orderId}`}
                        className="font-mono text-lg font-bold text-primary hover:underline"
                      >
                        {c.orderNumber}
                      </Link>
                      <CopyButton value={c.orderNumber} label="Order Number" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {c.methodName}
                    </Badge>
                    <StatusBadge status={c.status} />
                  </div>
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <span className="text-xs text-muted-foreground">Order Obligation</span>
                    <PaymentMoney value={c.expectedAmount} currency={c.currency} size="lg" />
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <span className="text-xs text-muted-foreground">Already Verified & Allocated</span>
                    <PaymentMoney value={c.collected} currency={c.currency} size="lg" />
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <span className="text-xs text-muted-foreground">Outstanding Balance</span>
                    <PaymentMoney value={c.outstanding} currency={c.currency} size="lg" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Comparison Cards: Customer testimony vs Official Destination */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="grid gap-2.5 p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Customer Testimony (Unverified)
                    </h3>
                    <Badge variant="outline" className="text-[11px] text-amber-600 dark:text-amber-400">
                      Unverified
                    </Badge>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">Submitted Transaction ID</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <code className="rounded bg-muted px-2 py-1 font-mono text-sm font-bold text-foreground break-all">
                        {c.customerReference}
                      </code>
                      <CopyButton value={c.customerReference} label="Customer Reference" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Customer selected <strong>{c.methodName}</strong>. A customer-provided reference
                    does not establish funds received until checked independently against provider records.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-2xs">
                <CardContent className="grid gap-2.5 p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Authorized Receiving Destination
                    </h3>
                    <Badge variant="outline" className="text-[11px]">
                      {c.destinationRevision ? `Rev ${c.destinationRevision}` : 'Legacy'}
                    </Badge>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">Receiving Account Number</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {c.receivingNumber ?? 'Historical destination unavailable'}
                      </span>
                      {c.receivingNumber && (
                        <CopyButton value={c.receivingNumber} label="Receiving Number" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {c.instructions ?? 'No authoritative instruction recorded.'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Action Bar */}
            {c.status === 'PENDING_VERIFICATION' && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Operator Actions</h4>
                    <p className="text-xs text-muted-foreground">
                      Verify actual credited money in bank/wallet statement, or reject mismatch.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canReview && (
                      <Button variant="outline" size="sm" onClick={() => setAction('review')}>
                        Update review state
                      </Button>
                    )}
                    {canVerify && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setAction('reject')}
                        >
                          <XCircle className="size-3.5" aria-hidden="true" />
                          Reject claim
                        </Button>
                        <Button
                          size="sm"
                          disabled={
                            !receivingAccounts.length || !c.receivingNumber || c.currency !== 'BDT'
                          }
                          onClick={() => setAction('verify')}
                        >
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          Verify & Record Receipt
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {c.currency !== 'BDT' && (
                  <PaymentNotice tone="warning" className="mt-3">
                    Manual independent receipt verification supports BDT only. Preserve this claim
                    for authorized reconciliation.
                  </PaymentNotice>
                )}

                {canVerify && !canAccounts && (
                  <PaymentNotice tone="warning" className="mt-3">
                    Finance account viewing is required to select the receiving ledger account. Ask
                    an authorized operator to complete verification.
                  </PaymentNotice>
                )}

                {accounts.error && (
                  <PaymentNotice tone="warning" className="mt-3">
                    {accounts.error}{' '}
                    <Button variant="outline" size="sm" onClick={accounts.refresh}>
                      Retry accounts
                    </Button>
                  </PaymentNotice>
                )}

                {accounts.data && !receivingAccounts.length && (
                  <PaymentNotice tone="warning" className="mt-3">
                    The receiving wallet is unavailable in Finance. Ask Finance to check the
                    account before verifying this payment.
                  </PaymentNotice>
                )}
              </div>
            )}

            {/* Receipt Result */}
            {(result || c.paymentId) && (
              <ReceiptWorkspace paymentId={result ?? c.paymentId!} />
            )}

            {/* Modal Dialog for Action */}
            {action && (
              <PaymentCommand
                key={action}
                title={
                  action === 'verify'
                    ? 'Confirm independently received funds'
                    : action === 'reject'
                      ? 'Reject claim'
                      : 'Update claim review'
                }
                path={`/admin/payments/attempts/${id}/${action}`}
                context={
                  action === 'verify' ? (
                    <PaymentNotice>
                      <p className="break-all">
                        Customer-submitted Transaction ID:{' '}
                        <strong className="font-mono">{c.customerReference}</strong>
                      </p>
                      <p className="font-mono tabular-nums">
                        Original receiving number: <strong>{c.receivingNumber}</strong>
                      </p>
                      <PaymentMoney
                        value={c.outstanding}
                        currency={c.currency}
                        label="Last recorded Order outstanding"
                      />
                    </PaymentNotice>
                  ) : undefined
                }
                onClose={() => setAction(undefined)}
                onSuccess={(data) => {
                  if (action === 'verify') setResult((data as { id: string }).id);
                  setAction(undefined);
                  q.refresh();
                }}
                consequence={
                  action === 'verify'
                    ? 'Record only actual credited money after checking the approved account history or statement. Partial and excess receipts are preserved. Finance posts atomically.'
                    : 'Review and rejection do not change money received or extend the payment deadline.'
                }
                build={(f) =>
                  action === 'verify'
                    ? {
                        confirmedAmount: String(f.get('confirmedAmount')),
                        evidence: {
                          transactionId: String(f.get('transactionId')),
                          receivingNumber: String(f.get('receivingNumber')),
                          currency: 'BDT',
                          valueTime: new Date(`${f.get('valueTime')}:00+06:00`).toISOString(),
                          source: String(f.get('source')),
                          evidenceReference: String(f.get('evidenceReference')),
                          financialAccountId: String(f.get('financialAccountId')),
                        },
                      }
                    : action === 'reject'
                      ? { reasonCode: String(f.get('reasonCode')), note: String(f.get('note')) }
                      : { state: String(f.get('state')), note: String(f.get('note')) }
                }
              >
                {action === 'verify' ? (
                  <>
                    <PaymentField
                      label="Actual credited amount (BDT)"
                      name="confirmedAmount"
                      defaultValue={c.expectedAmount}
                      pattern="[0-9]{1,16}(\.[0-9]{1,4})?"
                    />
                    <PaymentField
                      label="Independently checked Transaction ID"
                      name="transactionId"
                      defaultValue={c.customerReference}
                      maxLength={128}
                    />
                    <PaymentField
                      label="Independently checked receiving number"
                      name="receivingNumber"
                      defaultValue={c.receivingNumber ?? ''}
                      pattern="01[3-9][0-9]{8}"
                    />
                    <PaymentField
                      label="Transaction time (Bangladesh, UTC+06:00)"
                      name="valueTime"
                      type="datetime-local"
                    />
                    <PaymentField label="Independent verification source" name="source">
                      <option value="">Select source</option>
                      <option value="ACCOUNT_HISTORY">Receiving account history</option>
                      <option value="PROVIDER_STATEMENT">Provider statement</option>
                    </PaymentField>
                    <PaymentField
                      label="Private statement or account-history reference"
                      name="evidenceReference"
                      maxLength={512}
                    />
                    <PaymentField
                      label="Finance receiving account"
                      name="financialAccountId"
                      defaultValue={c.receivingFinancialAccountId ?? ''}
                    >
                      <option value="">Select independently checked account</option>
                      {receivingAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </PaymentField>
                  </>
                ) : (
                  <>
                    {action === 'review' ? (
                      <PaymentField label="Review decision" name="state">
                        <option value="UNDER_REVIEW">Under review</option>
                        <option value="CORRECTION_REQUESTED">
                          Request corrected transaction details
                        </option>
                        <option value="ESCALATED">Escalate mismatch</option>
                      </PaymentField>
                    ) : (
                      <PaymentField label="Rejection reason" name="reasonCode">
                        <option value="NOT_FOUND_IN_WALLET">Not found in receiving account</option>
                        <option value="DESTINATION_MISMATCH">Destination mismatch</option>
                        <option value="REFERENCE_MISMATCH">Transaction reference mismatch</option>
                      </PaymentField>
                    )}
                    <PaymentField label="Review note" name="note" type="textarea" />
                  </>
                )}
              </PaymentCommand>
            )}
          </>
        ) : null}
      </PaymentQueryState>
    </div>
  );
}
