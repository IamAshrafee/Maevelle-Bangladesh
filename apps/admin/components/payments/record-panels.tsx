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
  PendingCodCollectionPageDto,
  FinancialAccountDto,
  PaymentMethodDto,
} from '@maevelle/contracts';
import { EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { fetchApiData } from '@/lib/api';
import { paymentError } from '@/lib/payments/transport';
import { PaymentMoney, PaymentNotice, PaymentQueryState, PaymentField } from './payment-ui';
import { usePaymentQuery, usePaymentPermission } from './use-payment-query';
import { useAdminContext } from '../admin-capabilities';
import { PaymentsTable, RefundsTable } from './payment-record-tables';
import { CodCollectionQueue } from './payment-queue-tables';
import {
  CodCollectionDialog,
  FinancePostingDialog,
  RefundCompletionDialog,
  RefundDialog,
  type PaymentPostingTarget,
} from './payment-command-dialogs';
import { PaymentCommand } from './payment-command';

export function PaymentRecords({ kind }: { kind: 'payments' | 'refunds' }) {
  const context = useAdminContext();
  const view = usePaymentPermission(kind === 'payments' ? 'payments.view' : 'refunds.view');
  const canPostFinance = usePaymentPermission('finance.cash.record_manual');
  const params = useSearchParams();

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(params.get('q') ?? '');
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? 'ALL');
  const [method, setMethod] = useState(params.get('method') ?? 'ALL');
  const [posting, setPosting] = useState(params.get('posting') ?? 'ALL');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');

  // Command dialog targets
  const [refundTarget, setRefundTarget] = useState<PaymentDto | null>(null);
  const [postingTarget, setPostingTarget] = useState<PaymentPostingTarget | null>(null);
  const [completionTarget, setCompletionTarget] = useState<RefundDto | null>(null);
  const [busy, setBusy] = useState(false);

  const methods = usePaymentQuery<readonly PaymentMethodDto[]>(
    view && kind === 'payments' ? '/admin/payments/methods' : null,
  );

  const accounts = usePaymentQuery<readonly FinancialAccountDto[]>(
    canPostFinance ? '/admin/finance/accounts' : null,
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

  // Submit handlers for dialogs
  async function handleRefundSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!refundTarget || busy) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const key = crypto.randomUUID();
    try {
      await fetchApiData(`/admin/payments/${refundTarget.id}/refunds`, {
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
      setRefundTarget(null);
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
          kind === 'payments' ? (
            <PaymentsTable
              payments={q.data.items as PaymentDto[]}
              busy={busy}
              canPostFinance={canPostFinance}
              hasAccounts={Boolean(accounts.data?.length)}
              onPost={(payment) => setPostingTarget({ kind: 'payment', item: payment })}
              onRefund={(payment) => setRefundTarget(payment)}
            />
          ) : (
            <RefundsTable
              refunds={q.data.items as RefundDto[]}
              busy={busy}
              canPostFinance={canPostFinance}
              hasAccounts={Boolean(accounts.data?.length)}
              onComplete={(refund) => setCompletionTarget(refund)}
              onPost={(refund) => setPostingTarget({ kind: 'refund', item: refund })}
            />
          )
        ) : (
          <EmptyState
            title={kind === 'payments' ? 'No payments match this view' : 'No customer refunds match'}
            description={
              query || status !== 'ALL' || method !== 'ALL' || posting !== 'ALL' || from || to
                ? 'Try a different search query or clear the active filters to see all records.'
                : kind === 'payments'
                  ? 'All customer payments (verified bKash/Nagad receipts, card payments, and delivered COD collections) will appear here in the master ledger.'
                  : 'Customer refunds created for returned merchandise or cancelled orders will appear here for payout tracking and completion.'
            }
          />
        )}
      </PaymentQueryState>

      {/* Modal Dialogs */}
      {refundTarget && (
        <RefundDialog
          payment={refundTarget}
          busy={busy}
          onClose={() => setRefundTarget(null)}
          onSubmit={handleRefundSubmit}
        />
      )}

      {postingTarget && (
        <FinancePostingDialog
          target={postingTarget}
          accounts={accounts.data ?? []}
          busy={busy}
          onClose={() => setPostingTarget(null)}
          onSubmit={handlePostingSubmit}
        />
      )}

      {completionTarget && (
        <RefundCompletionDialog
          refund={completionTarget}
          busy={busy}
          onClose={() => setCompletionTarget(null)}
          onSubmit={handleCompletionSubmit}
        />
      )}
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
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Record Finance posting
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
  const allowed = usePaymentPermission('payments.verify');
  const [selected, select] = useState<PendingCodCollectionDto>();
  const [page, setPage] = useState(1);
  const q = usePaymentQuery<PendingCodCollectionPageDto>(
    allowed ? `/admin/payments/cod-collections/queue?page=${page}` : null,
  );

  useEffect(() => {
    if (q.data && !q.data.items.length && page > 1) setPage(page - 1);
  }, [q.data, page]);

  if (!allowed)
    return (
      <PaymentNotice>
        Actual COD collection recording requires payments verification permission.
      </PaymentNotice>
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Delivered cash on delivery parcels awaiting confirmed courier handoff.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={q.refresh}>
            Refresh collections
          </Button>
          <Button variant="outline" size="sm" render={<Link href="/finance/cod-settlements" />}>
            Courier settlements in Finance
          </Button>
        </div>
      </div>
      <PaymentQueryState query={q}>
        {q.data ? (
          <>
            <CodCollectionQueue collections={q.data.items} busy={false} onCollect={select} />
            {(page > 1 || q.data.hasNext) && (
              <nav
                aria-label="COD collection pages"
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
              >
                <span className="text-sm font-mono tabular-nums text-muted-foreground">
                  Page {q.data.page}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!q.data.hasNext}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </nav>
            )}
          </>
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
            defaultValue={selected.expectedAmount}
            pattern="[0-9]{1,16}(\.[0-9]{1,4})?"
          />
          <PaymentField
            label="Courier collection reference"
            name="externalReference"
            defaultValue={selected.trackingReference ?? ''}
            maxLength={128}
          />
          <PaymentField label="Collection note" name="note" type="textarea" required={false} />
        </PaymentCommand>
      ) : null}
    </div>
  );
}
