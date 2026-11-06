'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PaymentRecordControls } from './payment-record-controls';
import Link from 'next/link';
import type {
  PaginatedResultDto,
  PaymentDto,
  RefundDto,
  PendingCodCollectionDto,
  FinancialAccountDto,
  PaymentMethodDto,
} from '@maevelle/contracts';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { PaymentMoney, PaymentNotice, PaymentQueryState, PaymentField } from './payment-ui';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import { RefundOperations } from './refund-operations';
import { PaymentCommand } from './payment-command';
import { CodCollectionQueue } from './payment-queue-tables';
export function PaymentRecords({ kind }: { kind: 'payments' | 'refunds' }) {
  const view = usePaymentPermission(kind === 'payments' ? 'payments.view' : 'refunds.view');
  const params = useSearchParams();
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState(params.get('q') ?? ''),
    [query, setQuery] = useState(params.get('q') ?? ''),
    [status, setStatus] = useState(params.get('status') ?? 'ALL'),
    [method, setMethod] = useState(params.get('method') ?? 'ALL'),
    [posting, setPosting] = useState(params.get('posting') ?? 'ALL'),
    [from, setFrom] = useState(params.get('from') ?? ''),
    [to, setTo] = useState(params.get('to') ?? '');
  const methods = usePaymentQuery<readonly PaymentMethodDto[]>(
    view && kind === 'payments' ? '/admin/payments/methods' : null,
  );
  const search = new URLSearchParams({ page: String(page), pageSize: '25', q: query, posting });
  if (kind === 'refunds' && status !== 'ALL') search.set('status', status);
  if (kind === 'payments' && method !== 'ALL') search.set('method', method);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from))
    search.set('from', new Date(`${from}T00:00:00+06:00`).toISOString());
  if (/^\d{4}-\d{2}-\d{2}$/.test(to))
    search.set('to', new Date(`${to}T23:59:59.999+06:00`).toISOString());
  const q = usePaymentQuery<PaginatedResultDto<PaymentDto | RefundDto>>(
    view ? `/admin/${kind}?${search}` : null,
  );
  useEffect(() => {
    if (q.data && !q.data.items.length && page > 1)
      setPage(Math.max(1, q.data.pagination.totalPages));
  }, [q.data, page]);
  if (!view)
    return (
      <PaymentNotice>
        {kind === 'payments' ? 'Payment' : 'Refund'} viewing permission is required.
      </PaymentNotice>
    );
  return (
    <div className="grid gap-4">
      <PaymentRecordControls
        kind={kind}
        methods={methods.data ?? []}
        query={filter}
        method={method}
        refundStatus={status}
        posting={posting}
        from={from}
        to={to}
        loading={q.loading}
        pagination={q.data?.pagination ?? { page, pageSize: 25, totalItems: 0, totalPages: 1 }}
        onQueryChange={setFilter}
        onMethodChange={(value) => {
          setMethod(value);
          setPage(1);
        }}
        onRefundStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        onPostingChange={(value) => {
          setPosting(value);
          setPage(1);
        }}
        onFromChange={(value) => {
          setFrom(value);
          setPage(1);
        }}
        onToChange={(value) => {
          setTo(value);
          setPage(1);
        }}
        onApply={(e) => {
          e.preventDefault();
          setQuery(filter);
          setPage(1);
          q.refresh();
        }}
        onReset={() => {
          setFilter('');
          setQuery('');
          setStatus('ALL');
          setMethod('ALL');
          setPosting('ALL');
          setFrom('');
          setTo('');
          setPage(1);
        }}
        onPageChange={setPage}
      />
      <PaymentQueryState query={q}>
        {q.data?.items.length ? (
          q.data.items.map((row) => (
            <PagePanel key={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Link
                  href={`/payments/${kind === 'payments' ? row.id : (row as RefundDto).paymentId}`}
                  className="font-mono tabular-nums text-primary"
                >
                  {'refundNumber' in row ? row.refundNumber : row.paymentNumber}
                </Link>
                <Link
                  href={`/orders/${row.orderId}`}
                  className="font-mono tabular-nums text-primary"
                >
                  {row.orderNumber}
                </Link>
                <PaymentMoney value={row.amount} currency={row.currency} />
                <StatusBadge status={row.status} />
                <span className="text-sm">
                  {row.financePosting
                    ? 'Finance posting recorded'
                    : 'Finance source posting not recorded'}
                </span>
              </div>
              {'refundNumber' in row ? (
                <div className="mt-3">
                  <RefundOperations refund={row} onRefresh={q.refresh} />
                  {row.status === 'COMPLETED' && !row.financePosting ? (
                    <LegacyPosting
                      kind="refunds"
                      id={row.id}
                      currency={row.currency}
                      onRefresh={q.refresh}
                    />
                  ) : null}
                </div>
              ) : null}
            </PagePanel>
          ))
        ) : (
          <EmptyState title={`No matching ${kind}`} />
        )}
      </PaymentQueryState>
    </div>
  );
}
export function LegacyPosting({
  kind,
  id,
  currency,
  onRefresh,
}: {
  kind: 'payments' | 'refunds';
  id: string;
  currency: string;
  onRefresh: () => void;
}) {
  const allowed = usePaymentPermission('finance.cash.record_manual'),
    view = usePaymentPermission('finance.accounts.view'),
    [open, setOpen] = useState(false);
  const q = usePaymentQuery<readonly FinancialAccountDto[]>(
    open && view ? '/admin/finance/accounts' : null,
  );
  if (!allowed || !view) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Record missing legacy / COD Finance posting
      </Button>
      {open ? (
        <PaymentCommand
          title="Record missing Finance source posting"
          path={`/admin/finance/${kind}/${id}/posting`}
          consequence="Use only for an unposted legacy/COD record. Independently evidenced receipts and their completed refunds already post atomically. Duplicate posting is rejected."
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            onRefresh();
          }}
          build={(f) => ({ accountId: String(f.get('accountId')) })}
        >
          <PaymentField label="Authorized treasury account" name="accountId">
            <option value="">Select account</option>
            {q.data
              ?.filter((a) => a.status === 'ACTIVE' && a.currency_code === currency)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </PaymentField>
          {q.error ? <PaymentNotice>{q.error}</PaymentNotice> : null}
        </PaymentCommand>
      ) : null}
    </>
  );
}
export function CodOperations() {
  const allowed = usePaymentPermission('payments.verify'),
    [selected, select] = useState<PendingCodCollectionDto>();
  const q = usePaymentQuery<readonly PendingCodCollectionDto[]>(
    allowed ? '/admin/payments/cod-collections/pending' : null,
  );
  if (!allowed)
    return (
      <PaymentNotice>
        Actual COD collection recording requires payments verification permission.
      </PaymentNotice>
    );
  return (
    <div className="grid gap-4">
      <PaymentNotice>
        Delivery is not collection. Recorded cash may still be held by the courier. Merchant
        remittance and settlement are separate Finance facts.
      </PaymentNotice>
      <Link href="/finance/cod-settlements" className="text-primary">
        View courier custody, remittances and settlement
      </Link>
      <Button className="w-fit" variant="outline" onClick={q.refresh}>
        Refresh delivered COD
      </Button>
      <PaymentQueryState query={q}>
        {q.data ? (
          <CodCollectionQueue collections={q.data} busy={false} onCollect={select} />
        ) : null}
      </PaymentQueryState>
      {selected ? (
        <PaymentCommand
          title="Record actual courier COD collection"
          path="/admin/payments/cod-collections"
          consequence="Record only cash actually collected for this delivery. Collection does not establish merchant settlement."
          onClose={() => select(undefined)}
          onSuccess={() => {
            select(undefined);
            q.refresh();
          }}
          build={(f) => ({
            deliveryId: selected.deliveryId,
            amount: String(f.get('amount')),
            externalReference: String(f.get('externalReference')),
            note: String(f.get('note')),
          })}
        >
          <PaymentMoney
            label="Order outstanding"
            value={selected.outstandingAmount}
            currency={selected.currency}
          />
          <PaymentField
            label={`Actual collected amount (${selected.currency})`}
            name="amount"
            pattern="[0-9]{1,16}(\.[0-9]{1,4})?"
          />
          <PaymentField
            label="Courier collection reference"
            name="externalReference"
            maxLength={128}
          />
          <PaymentField label="Collection note" name="note" type="textarea" required={false} />
        </PaymentCommand>
      ) : null}
    </div>
  );
}
