'use client';

import { useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import type {
  CashAdjustmentDto,
  CashSettlementDto,
  CashEligibilityDto,
  CashReadPageDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/page-shell';
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
import { formatFinanceDate } from '@/lib/finance/types';

/** Existing Order/payment contexts supply identity; staff never type a financial UUID. */
export function CashSettlementPanel({ orderId }: { orderId: string }) {
  const view = usePaymentPermission('payments.view');
  const correct = usePaymentPermission('payments.correct');
  const manage = usePaymentPermission('payments.cash_adjustments.manage');
  const [page, setPage] = useState(1);
  const [reverse, setReverse] = useState<CashAdjustmentDto>();

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
    <Card className="border-border bg-card shadow-2xs">
      <CardContent className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Customer Balance & Cash Adjustments
            </h3>
            <p className="text-xs text-muted-foreground">
              COD settlement reconciliation, authorized waivers, and balance tracking.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>

        <PaymentQueryState query={summary}>
          {summary.data && <SettlementFigures settlement={summary.data} />}
        </PaymentQueryState>

        <PaymentQueryState query={eligibility}>
          {eligibility.data && (
            <PaymentNotice tone="warning">
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

        <p className="text-xs text-muted-foreground leading-relaxed">
          Courier custody and remittance shortages are reconciled separately. A waiver is a non-cash
          operational memorandum, not a cash receipt. Refunds are limited to genuine refundable receipts.
        </p>

        <div className="pt-2 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3">Adjustment History</h4>
          <PaymentQueryState query={history}>
            {history.data?.items.length ? (
              <div className="grid gap-3">
                {history.data.items.map((a) => (
                  <div key={a.id} className="rounded-lg border bg-muted/20 p-3.5 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">Waiver Adjustment:</span>
                        <PaymentMoney value={a.amount} size="sm" />
                      </div>
                      <StatusBadge status={a.state} />
                    </div>

                    <div className="grid gap-1 text-muted-foreground">
                      <div>
                        Reason: <strong className="text-foreground">{a.reason}</strong>
                      </div>
                      <div>
                        Collection Evidence: <span className="font-mono">{a.collectionEvidenceReference}</span>
                      </div>
                      <div>
                        Policy Revision: <span className="font-mono">{a.policyRevision}</span>
                      </div>
                      <div className="font-mono tabular-nums text-[11px]">
                        Requested {formatFinanceDate(a.createdAt, true)} by {a.requestedBy}
                        {a.approvedBy && ` · Approved by ${a.approvedBy}`}
                      </div>
                    </div>

                    {a.reversalReason && (
                      <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                        Correction: {a.reversalReason} (Evidence: {a.reversalEvidenceReference})
                      </p>
                    )}

                    {correct && a.state === 'APPLIED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => setReverse(a)}
                      >
                        <RotateCcw className="size-3" aria-hidden="true" />
                        Correct adjustment
                      </Button>
                    )}
                  </div>
                ))}
              </div>
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
        </div>

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
            <PaymentField label="Correction reason" name="reason" maxLength={512} />
            <PaymentField
              label="Correction evidence reference"
              name="evidenceReference"
              maxLength={512}
            />
          </PaymentCommand>
        )}
      </CardContent>
    </Card>
  );
}

export function SettlementFigures({ settlement: s }: { settlement: CashSettlementDto }) {
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <span className="text-[11px] text-muted-foreground">Original Order</span>
          <PaymentMoney value={s.originalPayable} size="md" />
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <span className="text-[11px] text-muted-foreground">Actual Received</span>
          <PaymentMoney value={s.actualCollected} size="md" />
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <span className="text-[11px] text-muted-foreground">Authorized Waiver</span>
          <PaymentMoney value={s.authorizedWaiver} size="md" />
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <span className="text-[11px] text-muted-foreground">Customer Balance</span>
          <PaymentMoney
            value={s.outstanding}
            size="md"
            className={Number(s.outstanding) > 0 ? 'text-rose-600 dark:text-rose-400' : ''}
          />
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <span className="text-[11px] text-muted-foreground">Completed Refunds</span>
          <PaymentMoney value={s.refunded} size="md" />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Settlement Status:</span>
        <Badge variant="outline" className="font-semibold">
          {s.settlementStatus === 'SETTLED_WITH_ADJUSTMENT'
            ? 'Settled with adjustment'
            : s.settlementStatus === 'SETTLED_BY_RECEIPTS'
              ? 'Settled by receipts'
              : s.settlementStatus === 'CANCELLED'
                ? 'Order cancelled'
                : 'Open customer balance'}
        </Badge>
      </div>
    </div>
  );
}
