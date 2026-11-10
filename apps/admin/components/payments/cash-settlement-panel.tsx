'use client';
import { useState } from 'react';
import type {
  CashAdjustmentDto,
  CashSettlementDto,
  CashEligibilityDto,
  CashReadPageDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import {
  PaymentMoney,
  PaymentNotice,
  PaymentQueryState,
  PaymentPager,
  PaymentField,
} from './payment-ui';
import { PaymentCommand } from './payment-command';

/** Existing Order/payment contexts supply identity; staff never type a financial UUID. */
export function CashSettlementPanel({ orderId }: { orderId: string }) {
  const view = usePaymentPermission('payments.view'),
    correct = usePaymentPermission('payments.correct'),
    manage = usePaymentPermission('payments.cash_adjustments.manage');
  const [page, setPage] = useState(1),
    [reverse, setReverse] = useState<CashAdjustmentDto>();
  const base = `/admin/payments/orders/${encodeURIComponent(orderId)}`;
  const summary = usePaymentQuery<CashSettlementDto>(view ? `${base}/cash-settlement` : null);
  const history = usePaymentQuery<CashReadPageDto<CashAdjustmentDto>>(
    view ? `${base}/cash-adjustments?page=${page}&pageSize=20` : null,
  );
  const eligibility = usePaymentQuery<CashEligibilityDto>(view ? `${base}/cash-eligibility` : null);
  if (!view) return <PaymentNotice>Payment viewing permission is required.</PaymentNotice>;
  const refresh = () => {
    summary.refresh();
    history.refresh();
    eligibility.refresh();
  };
  return (
    <PagePanel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Customer balance and cash adjustments</h2>
        <Button variant="outline" onClick={refresh}>
          Refresh balance
        </Button>
      </div>
      <PaymentQueryState query={summary}>
        {summary.data && <SettlementFigures settlement={summary.data} />}
      </PaymentQueryState>
      <PaymentQueryState query={eligibility}>
        {eligibility.data && (
          <PaymentNotice>
            New adjustments unavailable:{' '}
            {eligibility.data.reasons
              .map(
                (r) =>
                  ({
                    POLICY_BLOCKED: 'financial activation needs approval',
                    NOT_COD: 'this is not a COD Order',
                    CANCELLED: 'Order cancelled',
                    NO_OUTSTANDING: 'no remaining customer balance',
                    REQUEST_PENDING: 'independent review pending',
                  })[r],
              )
              .join('; ')}
            . A policy approval does not activate collection.
          </PaymentNotice>
        )}
      </PaymentQueryState>
      {manage && (
        <div className="my-3">
          <Button disabled>Settle small cash difference</Button>
          <p className="mt-2 text-sm text-muted-foreground">
            Unavailable until the server confirms approved operational eligibility.
          </p>
        </div>
      )}
      <p className="my-3 text-sm text-muted-foreground">
        Courier custody and remittance shortages are reconciled separately. A waiver is a non-cash
        operational memorandum, not a cash receipt or recognized expense. Refunds are limited to
        genuine refundable receipts.
      </p>
      <h3 className="font-semibold">Adjustment history</h3>
      <PaymentQueryState query={history}>
        {history.data?.items.length ? (
          <ol className="grid gap-3">
            {history.data.items.map((a) => (
              <li key={a.id} className="min-w-0 rounded-lg border border-border p-3">
                <div className="flex flex-wrap justify-between gap-3">
                  <PaymentMoney value={a.amount} label="Adjustment" />
                  <StatusBadge status={a.state} />
                </div>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div>
                    <dt>Reason</dt>
                    <dd className="break-words">{a.reason}</dd>
                  </div>
                  <div>
                    <dt>Collection evidence</dt>
                    <dd className="break-words">{a.collectionEvidenceReference}</dd>
                  </div>
                  <div>
                    <dt>Policy revision</dt>
                    <dd className="break-words">{a.policyRevision}</dd>
                  </div>
                  <div>
                    <dt>Requested</dt>
                    <dd className="font-mono tabular-nums">
                      {new Date(a.createdAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Requested by {a.requestedBy}; approved by{' '}
                  {a.approvedBy ?? 'awaiting independent review'}. Non-cash Finance reference:{' '}
                  {a.financeTransactionId ?? 'not applied'}.
                </p>
                {a.reversalReason && (
                  <p className="mt-2 break-words text-sm">
                    Correction: {a.reversalReason}. Evidence: {a.reversalEvidenceReference}
                  </p>
                )}
                {correct && a.state === 'APPLIED' && (
                  <Button className="mt-3" variant="outline" onClick={() => setReverse(a)}>
                    Correct adjustment
                  </Button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="No cash adjustments"
            description="Received cash and the original Order remain separate records."
          />
        )}
        {history.data && (
          <PaymentPager page={page} pageSize={20} total={history.data.total} onPage={setPage} />
        )}
      </PaymentQueryState>
      {reverse && correct && (
        <PaymentCommand
          title="Reverse cash adjustment"
          path={`/admin/payments/cash-shortfalls/${reverse.id}/reverse`}
          consequence="Appends a correction, preserves original cash and Order value, and may reopen the customer balance."
          context={<PaymentMoney value={reverse.amount} label="Adjustment being reversed" />}
          build={(f) => ({
            reason: String(f.get('reason')),
            evidenceReference: String(f.get('evidenceReference')),
          })}
          onClose={() => setReverse(undefined)}
          onSuccess={() => {
            setReverse(undefined);
            refresh();
          }}
        >
          <PaymentField name="reason" label="Correction reason" maxLength={512} />
          <PaymentField
            name="evidenceReference"
            label="Correction evidence reference"
            maxLength={512}
          />
        </PaymentCommand>
      )}
    </PagePanel>
  );
}
export function SettlementFigures({ settlement: s }: { settlement: CashSettlementDto }) {
  return (
    <div className="my-4 space-y-3" aria-live="polite">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ['Original Order', s.originalPayable],
          ['Actual funds received', s.actualCollected],
          ['Authorized cash adjustment', s.authorizedWaiver],
          ['Customer balance', s.outstanding],
          ['Completed refunds', s.refunded],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>
              <PaymentMoney value={value!} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="font-semibold">
        {s.settlementStatus === 'SETTLED_WITH_ADJUSTMENT'
          ? 'Settled with adjustment'
          : s.settlementStatus === 'SETTLED_BY_RECEIPTS'
            ? 'Settled by receipts'
            : s.settlementStatus === 'CANCELLED'
              ? 'Order cancelled'
              : 'Open customer balance'}
      </p>
    </div>
  );
}
