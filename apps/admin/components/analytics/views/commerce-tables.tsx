import type { CommerceMeasurementReportDto, CommerceFactName } from '@maevelle/contracts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PagePanel, PageSection, EmptyState } from '@/components/ui/page-shell';
import { StatusBadge } from '@/components/status-badge';
import { paymentMoney, paymentLabel } from '@/lib/payments/transport';

const labels: Record<CommerceFactName, { label: string; meaning: string }> = {
  ORDER_COMMITTED: {
    label: 'Orders committed',
    meaning:
      'Committed Orders, including unpaid Orders. Amount is original payable where recorded.',
  },
  PAYMENT_CLAIM_SUBMITTED: {
    label: 'Payment claims submitted',
    meaning: 'Unverified claims. No confirmed money.',
  },
  CLAIM_REJECTED: {
    label: 'Claims rejected',
    meaning: 'Claim review outcome, not a reversal of confirmed cash.',
  },
  CLAIM_CORRECTION_REQUESTED: {
    label: 'Claim corrections requested',
    meaning: 'First request for corrected claim information.',
  },
  PAYMENT_VERIFIED: {
    label: 'Payments independently verified',
    meaning: 'Actual receipt amount; allocation is shown separately.',
  },
  OBLIGATION_SATISFIED: {
    label: 'Obligations first satisfied',
    meaning: 'First satisfaction at the event-time obligation amount. Not recognized revenue.',
  },
  COD_COLLECTED: {
    label: 'COD collected',
    meaning: 'Actual delivery collection. Courier custody is not merchant settlement.',
  },
  ORDER_CANCELLED: {
    label: 'Orders cancelled',
    meaning: 'Original payable where recorded. Cancellation is not a completed refund.',
  },
  REFUND_COMPLETED: {
    label: 'Refunds completed',
    meaning: 'Actual completed partial or full refunds.',
  },
  PAYMENT_REVERSED: {
    label: 'Payments reversed',
    meaning: 'Separate reversal history; verified receipt history remains.',
  },
};
const count = (value: string) => BigInt(value).toLocaleString('en-BD');
const numeric = 'text-right font-mono tabular-nums';
export function CommerceTables({ data }: { data: CommerceMeasurementReportDto }) {
  return (
    <>
      <PageSection
        title="Authoritative commerce facts"
        description="Each row measures a different business fact. Do not add these amounts together as revenue."
      >
        {!data.facts.length ? (
          <EmptyState
            title="No commerce facts in this selection"
            description="This can reflect disabled purchasing, no classified traffic, incomplete coverage or an empty period. It is not a zero conversion rate."
          />
        ) : (
          <Table density="compact">
            <caption className="sr-only">
              Commerce counts and exact amounts grouped by fact and currency
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>Business fact</TableHead>
                <TableHead className={numeric}>Count</TableHead>
                <TableHead className={numeric}>Amount</TableHead>
                <TableHead className={numeric}>Allocated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.facts.map((row) => (
                <TableRow key={`${row.name}:${row.currency}`}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <p className="font-medium">
                      {labels[row.name]?.label ?? paymentLabel(row.name)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {labels[row.name]?.meaning}
                    </p>
                  </TableCell>
                  <TableCell className={numeric}>{count(row.count)}</TableCell>
                  <TableCell className={numeric}>
                    {row.amount !== null && row.currency
                      ? paymentMoney(row.amount, row.currency)
                      : 'Not recorded'}
                  </TableCell>
                  <TableCell className={numeric}>
                    {row.allocated !== null && row.currency
                      ? paymentMoney(row.allocated, row.currency)
                      : 'Not applicable'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <PagePanel className="space-y-3">
          <h3 className="font-semibold">Accepted Checkout steps</h3>
          <p className="text-sm text-muted-foreground">
            Accepted revisions, not unique customers or abandonment.
          </p>
          {data.acceptedSteps.length ? (
            <dl className="space-y-2">
              {data.acceptedSteps.map((row) => (
                <div key={row.action} className="flex justify-between gap-3">
                  <dt className="min-w-0 break-words text-sm">
                    {paymentLabel(row.action.replace('checkout.draft.', ''))}
                  </dt>
                  <dd className="font-mono tabular-nums">{count(row.count)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No accepted steps recorded.</p>
          )}
          <h4 className="font-medium">Checkout entry sources</h4>
          <dl className="space-y-2">
            {data.entries.map((row) => (
              <div key={row.source} className="flex justify-between gap-3">
                <dt>
                  {row.source === 'BUY_NOW'
                    ? 'Buy Now'
                    : row.source === 'CART'
                      ? 'Shopping bag'
                      : 'Unknown source'}
                </dt>
                <dd className="font-mono tabular-nums">{count(row.count)}</dd>
              </div>
            ))}
          </dl>
        </PagePanel>
        <PagePanel className="space-y-3">
          <h3 className="font-semibold">Processing health</h3>
          <p className="text-sm text-muted-foreground">
            Consumer status across this organization; independent of the selected business cohort.
          </p>
          {data.health.length ? (
            <ul className="space-y-3">
              {data.health.map((row) => (
                <li key={row.status} className="flex flex-wrap items-center justify-between gap-3">
                  <StatusBadge status={row.status} />
                  <span className="font-mono tabular-nums">{count(row.count)}</span>
                  <span className="w-full text-xs text-muted-foreground">
                    Oldest source:{' '}
                    <span className="font-mono tabular-nums">
                      {row.oldestAt
                        ? new Date(row.oldestAt).toLocaleString('en-BD', { timeZone: 'UTC' })
                        : 'Not recorded'}{' '}
                      UTC
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No consumer receipts recorded.</p>
          )}
        </PagePanel>
      </div>
      <PageSection
        title="Checkout request outcomes"
        description="Retries count as requests here. A policy block is not customer abandonment. Durations are sums and maxima, not p95 or p99."
      >
        {data.operations.length ? (
          <Table density="compact">
            <caption className="sr-only">Request outcome and duration aggregates</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Operation / outcome</TableHead>
                <TableHead className={numeric}>Requests</TableHead>
                <TableHead className={numeric}>Total ms</TableHead>
                <TableHead className={numeric}>Maximum ms</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.operations.map((row) => (
                <TableRow key={`${row.operation}:${row.outcome}`}>
                  <TableCell className="whitespace-normal">
                    {paymentLabel(row.operation)}
                    <p className="text-xs text-muted-foreground">{paymentLabel(row.outcome)}</p>
                  </TableCell>
                  <TableCell className={numeric}>{count(row.count)}</TableCell>
                  <TableCell className={numeric}>{count(row.duration_ms)}</TableCell>
                  <TableCell className={numeric}>{count(row.max_duration_ms)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No request outcomes recorded"
            description="No operational counts are available for this selection."
          />
        )}
      </PageSection>
    </>
  );
}
