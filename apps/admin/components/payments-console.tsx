'use client';

import { ArrowRight, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';

import type {
  ApiEnvelope,
  FinancialAccountDto,
  PaginatedResultDto,
  PaginationDto,
  PaymentAttemptDto,
  PaymentDto,
  PaymentMethodDto,
  PendingCodCollectionDto,
  RefundDto,
} from '@maevelle/contracts';

import { useAdminCapability } from './admin-capabilities';
import { OperationalFeedback, OperationalPageHeader } from './operational-worklist';
import {
  CodCollectionDialog,
  FinancePostingDialog,
  type PaymentPostingTarget,
  RefundCompletionDialog,
  RefundDialog,
  VerificationDialog,
  type VerificationDecision,
} from './payments/payment-command-dialogs';
import { PaymentMethodSettings } from './payments/payment-method-settings';
import { PaymentRecordControls } from './payments/payment-record-controls';
import { PaymentsTable, RefundsTable } from './payments/payment-record-tables';
import { CodCollectionQueue, VerificationQueue } from './payments/payment-queue-tables';

type PaymentTab = 'verification' | 'cod' | 'payments' | 'refunds' | 'methods';

const EMPTY_PAGINATION: PaginationDto = {
  page: 1,
  pageSize: 25,
  totalItems: 0,
  totalPages: 1,
};

function localDayBoundary(value: string, endOfDay = false): string {
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString();
}

async function errorText(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  return typeof payload.error === 'string'
    ? payload.error
    : (payload.error?.message ?? 'The payment operation was rejected.');
}

async function fetchEnvelope<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) throw new Error(await errorText(response));
  return ((await response.json()) as ApiEnvelope<T>).data;
}

export function PaymentsConsole() {
  const canViewAccounts = useAdminCapability('finance.accounts.view');
  const canPostFinance = useAdminCapability('finance.cash.record_manual');
  const [methods, setMethods] = useState<readonly PaymentMethodDto[]>([]);
  const [pending, setPending] = useState<readonly PaymentAttemptDto[]>([]);
  const [pendingCod, setPendingCod] = useState<readonly PendingCodCollectionDto[]>([]);
  const [payments, setPayments] = useState<readonly PaymentDto[]>([]);
  const [refunds, setRefunds] = useState<readonly RefundDto[]>([]);
  const [paymentPagination, setPaymentPagination] = useState<PaginationDto>(EMPTY_PAGINATION);
  const [refundPagination, setRefundPagination] = useState<PaginationDto>(EMPTY_PAGINATION);
  const [accounts, setAccounts] = useState<readonly FinancialAccountDto[]>([]);
  const [tab, setTab] = useState<PaymentTab>('verification');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('ALL');
  const [refundStatus, setRefundStatus] = useState('ALL');
  const [posting, setPosting] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentPage, setPaymentPage] = useState(1);
  const [refundPage, setRefundPage] = useState(1);
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<VerificationDecision>();
  const [codCollection, setCodCollection] = useState<PendingCodCollectionDto>();
  const [refundPayment, setRefundPayment] = useState<PaymentDto>();
  const [refundToComplete, setRefundToComplete] = useState<RefundDto>();
  const [postingTarget, setPostingTarget] = useState<PaymentPostingTarget>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const paymentParameters = new URLSearchParams({
        page: String(paymentPage),
        pageSize: '25',
        posting,
      });
      const refundParameters = new URLSearchParams({
        page: String(refundPage),
        pageSize: '25',
        posting,
      });
      if (appliedQuery) {
        paymentParameters.set('q', appliedQuery);
        refundParameters.set('q', appliedQuery);
      }
      if (paymentMethod !== 'ALL') paymentParameters.set('method', paymentMethod);
      if (refundStatus !== 'ALL') refundParameters.set('status', refundStatus);
      if (dateFrom) {
        const from = localDayBoundary(dateFrom);
        paymentParameters.set('from', from);
        refundParameters.set('from', from);
      }
      if (dateTo) {
        const to = localDayBoundary(dateTo, true);
        paymentParameters.set('to', to);
        refundParameters.set('to', to);
      }
      const [methodResult, pendingResult, codResult, paymentResult, refundResult, accountResult] =
        await Promise.all([
          fetchEnvelope<readonly PaymentMethodDto[]>('/api/admin/payments/methods'),
          fetchEnvelope<readonly PaymentAttemptDto[]>('/api/admin/payments/pending'),
          fetchEnvelope<readonly PendingCodCollectionDto[]>(
            '/api/admin/payments/cod-collections/pending',
          ),
          fetchEnvelope<PaginatedResultDto<PaymentDto>>(
            `/api/admin/payments?${paymentParameters.toString()}`,
          ),
          fetchEnvelope<PaginatedResultDto<RefundDto>>(
            `/api/admin/refunds?${refundParameters.toString()}`,
          ),
          canViewAccounts
            ? fetchEnvelope<readonly FinancialAccountDto[]>('/api/admin/finance/accounts')
            : Promise.resolve([]),
        ]);
      setMethods(methodResult);
      setPending(pendingResult);
      setPendingCod(codResult);
      setPayments(paymentResult.items);
      setPaymentPagination(paymentResult.pagination);
      setRefunds(refundResult.items);
      setRefundPagination(refundResult.pagination);
      setAccounts(accountResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load payment operations.');
      setMessageTone('danger');
    } finally {
      setLoading(false);
    }
  }, [
    appliedQuery,
    canViewAccounts,
    dateFrom,
    dateTo,
    paymentMethod,
    paymentPage,
    posting,
    refundPage,
    refundStatus,
  ]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requested = parameters.get('q');
    const requestedTab = parameters.get('tab');
    if (
      requestedTab === 'verification' ||
      requestedTab === 'cod' ||
      requestedTab === 'payments' ||
      requestedTab === 'refunds' ||
      requestedTab === 'methods'
    )
      setTab(requestedTab);
    if (requested) {
      setQuery(requested);
      setAppliedQuery(requested);
      if (!requestedTab) setTab('payments');
    }
    const requestedMethod = parameters.get('method');
    if (requestedMethod && ['COD', 'BKASH_MANUAL', 'NAGAD_MANUAL'].includes(requestedMethod))
      setPaymentMethod(requestedMethod);
    const requestedStatus = parameters.get('status');
    if (
      requestedStatus &&
      [
        'REQUESTED',
        'PROCESSING',
        'UNKNOWN_EXTERNAL_OUTCOME',
        'COMPLETED',
        'FAILED',
        'CANCELLED_BEFORE_PROCESSING',
      ].includes(requestedStatus)
    )
      setRefundStatus(requestedStatus);
    const requestedPosting = parameters.get('posting');
    if (requestedPosting === 'POSTED' || requestedPosting === 'UNPOSTED')
      setPosting(requestedPosting);
    setDateFrom(parameters.get('from') ?? '');
    setDateTo(parameters.get('to') ?? '');
    const requestedPage = Number(parameters.get('page'));
    if (Number.isInteger(requestedPage) && requestedPage > 1) {
      if (requestedTab === 'refunds') setRefundPage(requestedPage);
      else setPaymentPage(requestedPage);
    }
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) void load();
  }, [initialized, load]);

  useEffect(() => {
    if (!initialized) return;
    const parameters = new URLSearchParams();
    parameters.set('tab', tab);
    const recordTab = tab === 'payments' || tab === 'refunds';
    const urlQuery = recordTab ? appliedQuery : query.trim();
    if (urlQuery) parameters.set('q', urlQuery);
    if (tab === 'payments' && paymentMethod !== 'ALL') parameters.set('method', paymentMethod);
    if (tab === 'refunds' && refundStatus !== 'ALL') parameters.set('status', refundStatus);
    if (recordTab && posting !== 'ALL') parameters.set('posting', posting);
    if (recordTab && dateFrom) parameters.set('from', dateFrom);
    if (recordTab && dateTo) parameters.set('to', dateTo);
    const page = tab === 'refunds' ? refundPage : paymentPage;
    if (recordTab && page > 1) parameters.set('page', String(page));
    window.history.replaceState(null, '', `${window.location.pathname}?${parameters.toString()}`);
  }, [
    appliedQuery,
    dateFrom,
    dateTo,
    initialized,
    paymentMethod,
    paymentPage,
    posting,
    query,
    refundPage,
    refundStatus,
    tab,
  ]);

  const search = query.trim().toLocaleLowerCase();
  const visibleAttempts = useMemo(
    () =>
      pending.filter((item) =>
        [item.orderNumber, item.methodName, item.customerReference, item.status]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search),
      ),
    [pending, search],
  );
  const visibleCod = useMemo(
    () =>
      pendingCod.filter((item) =>
        [item.deliveryNumber, item.orderNumber, item.carrierName, item.trackingReference]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search),
      ),
    [pendingCod, search],
  );
  const visiblePayments = payments;
  const visibleRefunds = refunds;

  async function saveMethod(method: PaymentMethodDto, form: HTMLFormElement) {
    setBusy(true);
    setMessage('');
    const values = new FormData(form);
    const response = await fetch(`/api/admin/payments/methods/${method.code}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: values.get('name'),
        status: values.get('status'),
        displayOrder: Number(values.get('displayOrder')),
        paymentWindowMinutes:
          method.code === 'COD' ? null : Number(values.get('paymentWindowMinutes')),
        instructions: {
          accountNumber: values.get('accountNumber') || undefined,
          text: values.get('instructions') || undefined,
        },
      }),
    });
    if (!response.ok) {
      setMessage(await errorText(response));
      setMessageTone('danger');
    } else {
      setMessage(`${method.code} configuration saved.`);
      setMessageTone('success');
      await load();
    }
    setBusy(false);
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const isVerify = verification.mode === 'verify';
    const response = await fetch(
      `/api/admin/payments/attempts/${verification.attempt.id}/${isVerify ? 'verify' : 'reject'}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(isVerify ? { 'idempotency-key': crypto.randomUUID() } : {}),
        },
        body: JSON.stringify(
          isVerify
            ? { confirmedAmount: data.get('confirmedAmount') }
            : { reasonCode: data.get('reasonCode') },
        ),
      },
    );
    if (!response.ok) {
      setMessage(await errorText(response));
      setMessageTone('danger');
    } else {
      setMessage(
        isVerify
          ? `Payment for ${verification.attempt.orderNumber} verified.`
          : `Submission for ${verification.attempt.orderNumber} rejected.`,
      );
      setMessageTone('success');
      setVerification(undefined);
      await load();
    }
    setBusy(false);
  }

  async function submitCodCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!codCollection) return;
    const values = new FormData(event.currentTarget);
    if (
      !window.confirm(
        `Confirm that ${values.get('amount')} ${codCollection.currency} was collected for ${codCollection.deliveryNumber}?`,
      )
    )
      return;
    setBusy(true);
    const response = await fetch('/api/admin/payments/cod-collections', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        deliveryId: codCollection.deliveryId,
        amount: values.get('amount'),
        externalReference: values.get('externalReference'),
        note: values.get('note') || undefined,
      }),
    });
    if (!response.ok) {
      setMessage(await errorText(response));
      setMessageTone('danger');
    } else {
      setMessage(
        `COD collection for ${codCollection.deliveryNumber} recorded. Post it to the holding account next.`,
      );
      setMessageTone('success');
      setCodCollection(undefined);
      setTab('payments');
      await load();
    }
    setBusy(false);
  }

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!refundPayment) return;
    const data = new FormData(event.currentTarget);
    if (
      !window.confirm(
        'Create this refund request? Completed refunds are immutable financial facts.',
      )
    )
      return;
    setBusy(true);
    const created = await fetch(`/api/admin/payments/${refundPayment.id}/refunds`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ amount: data.get('amount'), reasonCode: data.get('reasonCode') }),
    });
    if (!created.ok) {
      setMessage(await errorText(created));
      setMessageTone('danger');
      setBusy(false);
      return;
    }
    const refund = ((await created.json()) as ApiEnvelope<RefundDto>).data;
    const externalReference = String(data.get('externalReference') ?? '').trim();
    if (externalReference) {
      const completed = await fetch(`/api/admin/refunds/${refund.id}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ externalReference }),
      });
      if (!completed.ok) {
        setMessage(
          `Refund ${refund.refundNumber} was requested but completion failed: ${await errorText(completed)}`,
        );
        setMessageTone('warning');
        setBusy(false);
        await load();
        return;
      }
    }
    setMessage(
      externalReference
        ? `Refund ${refund.refundNumber} completed.`
        : `Refund ${refund.refundNumber} is awaiting its external transaction reference.`,
    );
    setMessageTone(externalReference ? 'success' : 'warning');
    setRefundPayment(undefined);
    await load();
    setBusy(false);
  }

  async function submitPosting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postingTarget) return;
    setBusy(true);
    const values = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/admin/finance/${postingTarget.kind === 'payment' ? 'payments' : 'refunds'}/${postingTarget.item.id}/posting`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: values.get('accountId'),
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    if (!response.ok) {
      setMessage(await errorText(response));
      setMessageTone('danger');
    } else {
      setMessage(
        `${postingTarget.kind === 'payment' ? 'Payment received into' : 'Refund paid from'} the selected account.`,
      );
      setMessageTone('success');
      setPostingTarget(undefined);
      await load();
    }
    setBusy(false);
  }

  async function submitRefundCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!refundToComplete) return;
    setBusy(true);
    const values = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/refunds/${refundToComplete.id}/complete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ externalReference: values.get('externalReference') }),
    });
    if (!response.ok) {
      setMessage(await errorText(response));
      setMessageTone('danger');
    } else {
      setMessage(
        `Refund ${refundToComplete.refundNumber} completed. Record the account payout next.`,
      );
      setMessageTone('success');
      setRefundToComplete(undefined);
      await load();
    }
    setBusy(false);
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Payments & finance"
          title="Payment operations"
          description="Verify money received, trace it to orders, issue refunds, and connect each completed movement to the account that holds it."
          actions={
            <Link className="button" href="/finance">
              Finance overview <ArrowRight aria-hidden="true" />
            </Link>
          }
        />
        <Stats aria-label="Payment summary">
          <StatsCard>
            <StatsTitle>Needs payment action</StatsTitle>
            <StatsValue>{pending.length + pendingCod.length}</StatsValue>
            <StatsDescription>Manual reviews and delivered COD collections</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Collected payments</StatsTitle>
            <StatsValue>{paymentPagination.totalItems}</StatsValue>
            <StatsDescription>Authoritative payment records</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Refunds</StatsTitle>
            <StatsValue>{refundPagination.totalItems}</StatsValue>
            <StatsDescription>Requested and completed</StatsDescription>
          </StatsCard>
        </Stats>
        {message ? <OperationalFeedback tone={messageTone}>{message}</OperationalFeedback> : null}
        <nav className="workspace-tabs" aria-label="Payment operations">
          {(
            [
              ['verification', 'Verification queue', pending.length],
              ['cod', 'COD collections', pendingCod.length],
              ['payments', 'Collected payments', paymentPagination.totalItems],
              ['refunds', 'Refunds', refundPagination.totalItems],
              ['methods', 'Payment methods', methods.length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label} <span>{count}</span>
            </button>
          ))}
        </nav>
        {tab === 'verification' || tab === 'cod' ? (
          <label className="table-search standalone-search">
            <CreditCard aria-hidden="true" />
            <span className="sr-only">Search payment operations</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order, payment, reference, or reason"
            />
          </label>
        ) : null}
        {tab === 'payments' || tab === 'refunds' ? (
          <PaymentRecordControls
            kind={tab}
            methods={methods}
            query={query}
            method={paymentMethod}
            refundStatus={refundStatus}
            posting={posting}
            from={dateFrom}
            to={dateTo}
            pagination={tab === 'payments' ? paymentPagination : refundPagination}
            loading={loading}
            onQueryChange={setQuery}
            onMethodChange={(value) => {
              setPaymentMethod(value);
              setPaymentPage(1);
            }}
            onRefundStatusChange={(value) => {
              setRefundStatus(value);
              setRefundPage(1);
            }}
            onPostingChange={(value) => {
              setPosting(value);
              setPaymentPage(1);
              setRefundPage(1);
            }}
            onFromChange={(value) => {
              setDateFrom(value);
              setPaymentPage(1);
              setRefundPage(1);
            }}
            onToChange={(value) => {
              setDateTo(value);
              setPaymentPage(1);
              setRefundPage(1);
            }}
            onApply={(event) => {
              event.preventDefault();
              setAppliedQuery(query.trim());
              if (tab === 'payments') setPaymentPage(1);
              else setRefundPage(1);
            }}
            onReset={() => {
              setQuery('');
              setAppliedQuery('');
              setPaymentMethod('ALL');
              setRefundStatus('ALL');
              setPosting('ALL');
              setDateFrom('');
              setDateTo('');
              setPaymentPage(1);
              setRefundPage(1);
            }}
            onPageChange={tab === 'payments' ? setPaymentPage : setRefundPage}
          />
        ) : null}
        {loading ? (
          <div className="skeleton-list" aria-label="Loading payment operations">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {!loading && tab === 'verification' ? (
          <VerificationQueue
            attempts={visibleAttempts}
            busy={busy}
            onDecision={(attempt, mode) => setVerification({ attempt, mode })}
          />
        ) : null}
        {!loading && tab === 'cod' ? (
          <CodCollectionQueue collections={visibleCod} busy={busy} onCollect={setCodCollection} />
        ) : null}
        {!loading && tab === 'payments' ? (
          <PaymentsTable
            payments={visiblePayments}
            busy={busy}
            canPostFinance={canPostFinance}
            hasAccounts={accounts.length > 0}
            onPost={(payment) => setPostingTarget({ kind: 'payment', item: payment })}
            onRefund={setRefundPayment}
          />
        ) : null}
        {!loading && tab === 'refunds' ? (
          <RefundsTable
            refunds={visibleRefunds}
            busy={busy}
            canPostFinance={canPostFinance}
            hasAccounts={accounts.length > 0}
            onComplete={setRefundToComplete}
            onPost={(refund) => setPostingTarget({ kind: 'refund', item: refund })}
          />
        ) : null}
        {!loading && tab === 'methods' ? (
          <PaymentMethodSettings methods={methods} busy={busy} onSave={saveMethod} />
        ) : null}
        {codCollection ? (
          <CodCollectionDialog
            collection={codCollection}
            busy={busy}
            onClose={() => setCodCollection(undefined)}
            onSubmit={submitCodCollection}
          />
        ) : null}
        {verification ? (
          <VerificationDialog
            decision={verification}
            busy={busy}
            onClose={() => setVerification(undefined)}
            onSubmit={submitVerification}
          />
        ) : null}
        {refundPayment ? (
          <RefundDialog
            payment={refundPayment}
            busy={busy}
            onClose={() => setRefundPayment(undefined)}
            onSubmit={submitRefund}
          />
        ) : null}
        {postingTarget ? (
          <FinancePostingDialog
            target={postingTarget}
            accounts={accounts}
            busy={busy}
            onClose={() => setPostingTarget(undefined)}
            onSubmit={submitPosting}
          />
        ) : null}
        {refundToComplete ? (
          <RefundCompletionDialog
            refund={refundToComplete}
            busy={busy}
            onClose={() => setRefundToComplete(undefined)}
            onSubmit={submitRefundCompletion}
          />
        ) : null}
      </section>
    </main>
  );
}
