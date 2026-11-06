'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type {
  PaymentPageDto,
  PaymentClaimRowDto,
  PaymentClaimWorkspaceDto,
  FinancialAccountDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
  PaymentField,
  PaymentMoney,
  PaymentNotice,
  PaymentPager,
  PaymentQueryState,
} from './payment-ui';
import { PaymentCommand } from './payment-command';
import { ReceiptWorkspace } from './receipt-workspace';

export function ClaimReviewQueue() {
  const allowed = usePaymentPermission('payments.review'),
    canView = usePaymentPermission('payments.view');
  const [page, setPage] = useState(1),
    [selected, select] = useState<string>();
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
      <div className="flex justify-between gap-3">
        <h2 className="text-lg font-semibold">Payments awaiting independent review</h2>
        <Button variant="outline" onClick={q.refresh}>
          Refresh queue
        </Button>
      </div>
      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          <div className="grid gap-3">
            {q.data.items.map((c) => (
              <PagePanel key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <Link
                      href={`/orders/${c.orderId}`}
                      className="font-mono tabular-nums text-primary"
                    >
                      {c.orderNumber}
                    </Link>
                    <span className="text-sm">
                      {c.methodName} · {c.customerReference}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums">
                      Submitted{' '}
                      {new Date(c.submittedAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}{' '}
                      · {Math.floor(Number(c.ageSeconds) / 60)} minutes ago
                    </span>
                  </div>
                  <PaymentMoney
                    value={c.expectedAmount}
                    currency={c.currency}
                    label="Order obligation"
                  />
                  <StatusBadge status={c.overdue ? 'OVERDUE' : c.reviewState} />
                  <Button disabled={!canView} onClick={() => select(c.id)}>
                    Open review
                  </Button>
                </div>
                {c.reviewExpiresAt ? (
                  <p className="mt-2 text-xs font-mono tabular-nums">
                    Review deadline{' '}
                    {new Date(c.reviewExpiresAt).toLocaleString('en-BD', {
                      timeZone: 'Asia/Dhaka',
                    })}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-warning">
                    Legacy claim: review deadline requires an approved operating policy.
                  </p>
                )}
              </PagePanel>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No unresolved claims"
            description="Submitted references appear here until verified or rejected."
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
  const canVerify = usePaymentPermission('payments.verify'),
    canReview = usePaymentPermission('payments.review'),
    canAccounts = usePaymentPermission('finance.accounts.view');
  const accounts = usePaymentQuery<readonly FinancialAccountDto[]>(
    canAccounts ? '/admin/finance/accounts' : null,
  );
  const [action, setAction] = useState<'verify' | 'reject' | 'review'>(),
    [result, setResult] = useState<string>();
  const c = q.data;
  return (
    <div className="grid gap-4">
      <Button variant="outline" className="w-fit" onClick={onBack}>
        Back to verification queue
      </Button>
      <PaymentQueryState query={q}>
        {c ? (
          <>
            <PagePanel>
              <h2 className="text-lg font-semibold">Independent payment review</h2>
              <Link href={`/orders/${c.orderId}`} className="text-primary font-mono tabular-nums">
                {c.orderNumber}
              </Link>
              <div className="my-4 grid gap-4 sm:grid-cols-3">
                <PaymentMoney
                  value={c.expectedAmount}
                  currency={c.currency}
                  label="Order obligation"
                />
                <PaymentMoney
                  value={c.collected}
                  currency={c.currency}
                  label="Already verified and allocated"
                />
                <PaymentMoney value={c.outstanding} currency={c.currency} label="Outstanding" />
              </div>
              <StatusBadge status={c.status} />
            </PagePanel>
            <div className="grid gap-4 lg:grid-cols-2">
              <PagePanel>
                <h3 className="font-semibold">Customer testimony — unverified</h3>
                <p className="break-all font-mono tabular-nums mt-2">{c.customerReference}</p>
                <p className="text-sm text-muted-foreground">
                  {c.methodName}. A reference alone never establishes funds received.
                </p>
              </PagePanel>
              <PagePanel>
                <h3 className="font-semibold">Original Order instructions</h3>
                <p className="font-mono tabular-nums mt-2">
                  {c.receivingNumber ?? 'Historical destination unavailable'}
                </p>
                <p className="text-sm">
                  {c.instructions ?? 'No authoritative instruction recorded.'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.destinationRevision
                    ? `Destination revision ${c.destinationRevision}`
                    : 'Legacy destination provenance; independently reconcile before approval.'}
                </p>
              </PagePanel>
            </div>
            {result || c.paymentId ? <ReceiptWorkspace paymentId={result ?? c.paymentId!} /> : null}
            {c.status === 'PENDING_VERIFICATION' ? (
              <div className="flex flex-wrap gap-2">
                {canReview ? (
                  <Button variant="outline" onClick={() => setAction('review')}>
                    Update review
                  </Button>
                ) : null}
                {canVerify ? (
                  <>
                    <Button variant="outline" onClick={() => setAction('reject')}>
                      Reject incorrect claim
                    </Button>
                    <Button
                      disabled={
                        !canAccounts || !accounts.data || !c.receivingNumber || c.currency !== 'BDT'
                      }
                      onClick={() => setAction('verify')}
                    >
                      Record independently checked receipt
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
            {c.currency !== 'BDT' ? (
              <PaymentNotice>
                Manual independent receipt verification supports BDT only. Preserve this historical
                claim for authorized reconciliation.
              </PaymentNotice>
            ) : null}
            {canVerify && !canAccounts ? (
              <PaymentNotice>
                Finance account viewing is required to select the receiving ledger account. Ask an
                authorized operator to complete verification.
              </PaymentNotice>
            ) : null}
            {accounts.error ? (
              <PaymentNotice>
                {accounts.error}
                <Button variant="outline" onClick={accounts.refresh}>
                  Retry accounts
                </Button>
              </PaymentNotice>
            ) : null}
            {action ? (
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
                        Customer-submitted Transaction ID: {c.customerReference}
                      </p>
                      <p className="font-mono tabular-nums">
                        Original receiving number: {c.receivingNumber}
                      </p>
                      <PaymentMoney
                        value={c.outstanding}
                        currency={c.currency}
                        label="Last recorded Order outstanding"
                      />
                      <p>
                        Compare these with independently checked evidence below. Receipt allocation
                        and any remaining outstanding or excess liability are determined by the
                        server at confirmation and shown in the saved receipt.
                      </p>
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
                    ? 'Record only actual credited money after checking the approved account history or statement. Partial and excess receipts are preserved. Finance posts atomically; do not post again.'
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
                      pattern="[0-9]{1,16}(\.[0-9]{1,4})?"
                    />
                    <PaymentField
                      label="Independently checked Transaction ID"
                      name="transactionId"
                      maxLength={128}
                    />
                    <PaymentField
                      label="Independently checked receiving number"
                      name="receivingNumber"
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
                    <PaymentField label="Finance receiving account" name="financialAccountId">
                      <option value="">Select independently checked account</option>
                      {accounts.data
                        ?.filter((a) => a.status === 'ACTIVE' && a.currency_code === 'BDT')
                        .map((a) => (
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
            ) : null}
          </>
        ) : null}
      </PaymentQueryState>
    </div>
  );
}
