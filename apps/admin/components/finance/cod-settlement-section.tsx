import { Banknote, CircleDollarSign, ReceiptText } from 'lucide-react';
import Link from 'next/link';

import type {
  FinanceCodSettlementDto,
  OutstandingCodSettlementPaymentDto,
  PaginatedResultDto,
} from '@maevelle/contracts';

import { OperationalEmptyState } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import { formatFinanceDate, formatMoney } from '@/lib/finance/types';

export function CodSettlementSection({
  outstanding,
  settlements,
  onPageChange,
}: {
  readonly outstanding: readonly OutstandingCodSettlementPaymentDto[];
  readonly settlements: PaginatedResultDto<FinanceCodSettlementDto>;
  readonly onPageChange: (page: number) => void;
}) {
  const totalOutstanding = outstanding.reduce(
    (total, payment) => total + Number(payment.outstandingAmount),
    0,
  );
  const ready = outstanding.filter((payment) => payment.canSettle);
  const waitingForPosting = outstanding.length - ready.length;
  const currency = outstanding[0]?.currency ?? settlements.items[0]?.currency ?? 'BDT';
  const pages = Math.max(1, settlements.pagination.totalPages);

  return (
    <div className="grid gap-6">
      <Stats aria-label="Courier settlement summary">
        <StatsCard>
          <StatsTitle>Courier-held COD</StatsTitle>
          <StatsValue>{formatMoney(totalOutstanding, currency)}</StatsValue>
          <StatsDescription>Collected from customers but not fully remitted</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Ready to settle</StatsTitle>
          <StatsValue>{ready.length}</StatsValue>
          <StatsDescription>Posted to a courier holding account</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Needs account posting</StatsTitle>
          <StatsValue>{waitingForPosting}</StatsValue>
          <StatsDescription>
            Collection exists but its holding account is not recorded
          </StatsDescription>
        </StatsCard>
      </Stats>

      <section className="grid gap-3" aria-labelledby="cod-outstanding-heading">
        <div>
          <h2 id="cod-outstanding-heading" className="text-lg font-semibold">
            Outstanding courier-held cash
          </h2>
          <p className="text-sm text-muted-foreground">
            Customer collection is already complete. This queue tracks the separate
            courier-to-Maevelle remittance.
          </p>
        </div>
        {outstanding.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {outstanding.map((payment) => (
              <Card key={payment.paymentId}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-start justify-between gap-2 text-base">
                    <span>{payment.carrierName}</span>
                    <StatusBadge status={payment.canSettle ? 'READY' : 'NEEDS_POSTING'} />
                  </CardTitle>
                  <CardDescription>
                    {payment.deliveryNumber}
                    {payment.trackingReference ? ` · ${payment.trackingReference}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <span>
                      <small className="block text-muted-foreground">Outstanding</small>
                      <strong>{formatMoney(payment.outstandingAmount, payment.currency)}</strong>
                    </span>
                    <span>
                      <small className="block text-muted-foreground">Already settled</small>
                      <strong>{formatMoney(payment.settledAmount, payment.currency)}</strong>
                    </span>
                    <span>
                      <small className="block text-muted-foreground">Collected</small>
                      <strong>{formatFinanceDate(payment.collectedAt)}</strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                    <span>
                      {payment.orderNumber} · {payment.sourceAccountName ?? 'No holding account'}
                    </span>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/payments/${payment.paymentId}`}
                    >
                      {payment.canSettle ? 'View Payment' : 'Post Payment'}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <OperationalEmptyState
            title="No courier-held COD is outstanding"
            description="Recorded COD collections will appear here until their full amount has been allocated to courier remittances."
          />
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="cod-history-heading">
        <div>
          <h2 id="cod-history-heading" className="text-lg font-semibold">
            Settlement history
          </h2>
          <p className="text-sm text-muted-foreground">
            Remittance references, deductions, account movement, and Payment allocations are
            immutable.
          </p>
        </div>
        {settlements.items.length ? (
          <div className="grid gap-3">
            {settlements.items.map((settlement) => (
              <Card key={settlement.id}>
                <CardContent className="grid gap-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="flex min-w-0 items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Banknote className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate">
                          {settlement.settlementNumber} · {settlement.carrierName}
                        </strong>
                        <span className="block text-xs text-muted-foreground">
                          {settlement.remittanceReference} ·{' '}
                          {formatFinanceDate(settlement.settledAt, true)}
                        </span>
                      </span>
                    </span>
                    <strong className="text-lg">
                      {formatMoney(settlement.netAmount, settlement.currency)} received
                    </strong>
                  </div>
                  <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">
                    <span>
                      <small className="block text-muted-foreground">Gross allocated</small>
                      <strong>{formatMoney(settlement.grossAmount, settlement.currency)}</strong>
                    </span>
                    <span>
                      <small className="block text-muted-foreground">Courier deduction</small>
                      <strong>
                        {formatMoney(settlement.deductionAmount, settlement.currency)}
                      </strong>
                    </span>
                    <span>
                      <small className="block text-muted-foreground">Account movement</small>
                      <strong>
                        {settlement.sourceAccountName} → {settlement.destinationAccountName}
                      </strong>
                    </span>
                  </div>
                  {settlement.deductionNote ? (
                    <p className="text-sm text-muted-foreground">
                      <ReceiptText className="mr-1 inline size-4" aria-hidden="true" />
                      {settlement.deductionNote}
                    </p>
                  ) : null}
                  <details className="rounded-lg border px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-medium">
                      {settlement.allocations.length} Payment allocation
                      {settlement.allocations.length === 1 ? '' : 's'}
                    </summary>
                    <div className="mt-3 grid gap-2 border-t pt-3">
                      {settlement.allocations.map((allocation) => (
                        <div
                          key={allocation.paymentId}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <Link
                            className="text-primary hover:underline"
                            href={`/payments/${allocation.paymentId}`}
                          >
                            {allocation.paymentNumber} · {allocation.orderNumber}
                          </Link>
                          <strong>{formatMoney(allocation.amount, settlement.currency)}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Page {settlements.pagination.page} of {pages} · {settlements.pagination.totalItems}{' '}
                settlements
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={settlements.pagination.page <= 1}
                  onClick={() => onPageChange(settlements.pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={settlements.pagination.page >= pages}
                  onClick={() => onPageChange(settlements.pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <CircleDollarSign className="size-5" aria-hidden="true" /> No courier remittances have
              been recorded yet.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
