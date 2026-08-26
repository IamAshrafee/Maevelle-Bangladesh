'use client';

import { Banknote, CheckCircle2, CreditCard, ReceiptText, RotateCcw, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from './operational-worklist';
import { StatusBadge } from './status-badge';

type MethodCode = 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
type PaymentTab = 'verification' | 'payments' | 'refunds' | 'methods';
interface PaymentMethod {
  id: string;
  code: MethodCode;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  instructions: { accountNumber?: string; text?: string };
  displayOrder: number;
}
interface Attempt {
  id: string;
  orderNumber: string;
  methodName: string;
  expectedAmount: string;
  customerReference: string;
  claimedAmount: string | null;
  status: string;
  submittedAt: string;
}
interface Payment {
  id: string;
  paymentNumber: string;
  orderNumber: string;
  method: string;
  amount: string;
  refunded: string;
  net: string;
  externalReference: string;
}
interface Refund {
  id: string;
  refundNumber: string;
  paymentId: string;
  amount: string;
  status: string;
  reasonCode: string;
  externalReference: string | null;
}

const money = (amount: string) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount));

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
  const [methods, setMethods] = useState<readonly PaymentMethod[]>([]);
  const [pending, setPending] = useState<readonly Attempt[]>([]);
  const [payments, setPayments] = useState<readonly Payment[]>([]);
  const [refunds, setRefunds] = useState<readonly Refund[]>([]);
  const [tab, setTab] = useState<PaymentTab>('verification');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<
    { attempt: Attempt; mode: 'verify' | 'reject' } | undefined
  >();
  const [refundPayment, setRefundPayment] = useState<Payment>();

  const load = useCallback(async () => {
    try {
      const [methodResult, pendingResult, paymentResult, refundResult] = await Promise.all([
        fetchEnvelope<readonly PaymentMethod[]>('/api/admin/payments/methods'),
        fetchEnvelope<readonly Attempt[]>('/api/admin/payments/pending'),
        fetchEnvelope<readonly Payment[]>('/api/admin/payments'),
        fetchEnvelope<readonly Refund[]>('/api/admin/refunds'),
      ]);
      setMethods(methodResult);
      setPending(pendingResult);
      setPayments(paymentResult);
      setRefunds(refundResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load payment operations.');
      setMessageTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
  const visiblePayments = useMemo(
    () =>
      payments.filter((item) =>
        [item.paymentNumber, item.orderNumber, item.method, item.externalReference]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search),
      ),
    [payments, search],
  );
  const visibleRefunds = useMemo(
    () =>
      refunds.filter((item) =>
        [item.refundNumber, item.reasonCode, item.status, item.externalReference]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search),
      ),
    [refunds, search],
  );

  async function saveMethod(method: PaymentMethod, form: HTMLFormElement) {
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
    const refund = ((await created.json()) as ApiEnvelope<Refund>).data;
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

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Commerce / Payments"
          title="Payment operations"
          description="Verify manual submissions, inspect collected funds, and record refunds without conflating payment facts with order lifecycle."
        />
        <section className="metric-strip" aria-label="Payment summary">
          <article>
            <span>Needs verification</span>
            <strong>{pending.length}</strong>
            <small>Manual submissions awaiting a decision</small>
          </article>
          <article>
            <span>Collected payments</span>
            <strong>{payments.length}</strong>
            <small>Authoritative payment records</small>
          </article>
          <article>
            <span>Refunds</span>
            <strong>{refunds.length}</strong>
            <small>Requested and completed</small>
          </article>
          <article>
            <span>Active methods</span>
            <strong>{methods.filter((method) => method.status === 'ACTIVE').length}</strong>
            <small>Available at checkout</small>
          </article>
        </section>
        {message ? <OperationalFeedback tone={messageTone}>{message}</OperationalFeedback> : null}
        <nav className="workspace-tabs" aria-label="Payment operations">
          {(
            [
              ['verification', 'Verification queue', pending.length],
              ['payments', 'Collected payments', payments.length],
              ['refunds', 'Refunds', refunds.length],
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
        {tab !== 'methods' ? (
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
        {loading ? (
          <div className="skeleton-list" aria-label="Loading payment operations">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {!loading && tab === 'verification' ? (
          visibleAttempts.length ? (
            <section className="panel worklist-panel">
              <div className="data-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Method</th>
                      <th>Expected</th>
                      <th>Claimed</th>
                      <th>Customer reference</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>
                          <strong>{attempt.orderNumber}</strong>
                        </td>
                        <td>{attempt.methodName}</td>
                        <td className="numeric">{money(attempt.expectedAmount)}</td>
                        <td className="numeric">
                          {attempt.claimedAmount ? money(attempt.claimedAmount) : '—'}
                        </td>
                        <td>{attempt.customerReference}</td>
                        <td>
                          <time dateTime={attempt.submittedAt}>
                            {new Intl.DateTimeFormat('en-BD', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(attempt.submittedAt))}
                          </time>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              disabled={busy}
                              onClick={() => setVerification({ attempt, mode: 'verify' })}
                              type="button"
                            >
                              <CheckCircle2 aria-hidden="true" /> Verify
                            </button>
                            <button
                              className="danger-action"
                              disabled={busy}
                              onClick={() => setVerification({ attempt, mode: 'reject' })}
                              type="button"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <OperationalEmptyState
              title="Verification queue is clear"
              description="No matching manual payment submissions need a decision."
            />
          )
        ) : null}
        {!loading && tab === 'payments' ? (
          visiblePayments.length ? (
            <section className="panel worklist-panel">
              <div className="data-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Order</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Refunded</th>
                      <th>Net</th>
                      <th>Reference</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <strong>{payment.paymentNumber}</strong>
                        </td>
                        <td>{payment.orderNumber}</td>
                        <td>{payment.method}</td>
                        <td className="numeric">{money(payment.amount)}</td>
                        <td className="numeric">{money(payment.refunded)}</td>
                        <td className="numeric">
                          <strong>{money(payment.net)}</strong>
                        </td>
                        <td>{payment.externalReference}</td>
                        <td>
                          <button
                            disabled={busy || Number(payment.net) <= 0}
                            onClick={() => setRefundPayment(payment)}
                            type="button"
                          >
                            <RotateCcw aria-hidden="true" /> Refund
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <OperationalEmptyState
              title="No collected payments"
              description="Verified manual payments and collected COD records will appear here."
            />
          )
        ) : null}
        {!loading && tab === 'refunds' ? (
          visibleRefunds.length ? (
            <section className="panel worklist-panel">
              <div className="data-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Refund</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRefunds.map((refund) => (
                      <tr key={refund.id}>
                        <td>
                          <strong>{refund.refundNumber}</strong>
                          <span className="cell-secondary">Payment {refund.paymentId}</span>
                        </td>
                        <td className="numeric">{money(refund.amount)}</td>
                        <td>
                          <StatusBadge status={refund.status} />
                        </td>
                        <td>{refund.reasonCode.replaceAll('_', ' ')}</td>
                        <td>{refund.externalReference ?? 'Awaiting completion'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <OperationalEmptyState
              title="No refunds"
              description="Requested refunds and their completion state will appear here."
            />
          )
        ) : null}
        {!loading && tab === 'methods' ? (
          <section className="method-grid">
            {methods.map((method) => (
              <form
                className="panel"
                key={method.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveMethod(method, event.currentTarget);
                }}
              >
                <header className="panel-header">
                  <div>
                    <p className="eyebrow">{method.code}</p>
                    <h2>{method.name}</h2>
                  </div>
                  <StatusBadge status={method.status} />
                </header>
                <label>
                  Name
                  <input defaultValue={method.name} name="name" required />
                </label>
                <div className="form-row">
                  <label>
                    Status
                    <select defaultValue={method.status} name="status">
                      <option value="ACTIVE">Active</option>
                      <option value="DISABLED">Disabled</option>
                    </select>
                  </label>
                  <label>
                    Display order
                    <input
                      defaultValue={method.displayOrder}
                      min={0}
                      name="displayOrder"
                      type="number"
                      required
                    />
                  </label>
                </div>
                {method.code !== 'COD' ? (
                  <>
                    <label>
                      Customer-visible wallet number
                      <input
                        defaultValue={method.instructions.accountNumber}
                        inputMode="numeric"
                        name="accountNumber"
                      />
                    </label>
                    <label>
                      Checkout instructions
                      <textarea defaultValue={method.instructions.text} name="instructions" />
                    </label>
                  </>
                ) : (
                  <p className="muted">
                    Cash on delivery collects funds after successful delivery and never creates a
                    fake paid state.
                  </p>
                )}
                <button className="button primary" disabled={busy} type="submit">
                  <Banknote aria-hidden="true" /> Save method
                </button>
              </form>
            ))}
          </section>
        ) : null}
        {verification ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="command-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="verification-title"
            >
              <header>
                <div>
                  <p className="eyebrow">Manual payment</p>
                  <h2 id="verification-title">
                    {verification.mode === 'verify' ? 'Verify submission' : 'Reject submission'}
                  </h2>
                </div>
                <button type="button" aria-label="Close" onClick={() => setVerification(undefined)}>
                  <X aria-hidden="true" />
                </button>
              </header>
              <div className="command-summary">
                <span>
                  Order<strong>{verification.attempt.orderNumber}</strong>
                </span>
                <span>
                  Expected<strong>{money(verification.attempt.expectedAmount)}</strong>
                </span>
                <span>
                  Claimed
                  <strong>
                    {verification.attempt.claimedAmount
                      ? money(verification.attempt.claimedAmount)
                      : 'Not supplied'}
                  </strong>
                </span>
                <span>
                  Reference<strong>{verification.attempt.customerReference}</strong>
                </span>
              </div>
              <form onSubmit={(event) => void submitVerification(event)}>
                {verification.mode === 'verify' ? (
                  <label>
                    Confirmed collected amount
                    <input
                      name="confirmedAmount"
                      inputMode="decimal"
                      defaultValue={
                        verification.attempt.claimedAmount ?? verification.attempt.expectedAmount
                      }
                      required
                    />
                  </label>
                ) : (
                  <label>
                    Rejection reason code
                    <select name="reasonCode" defaultValue="REFERENCE_NOT_FOUND">
                      <option value="REFERENCE_NOT_FOUND">Reference not found</option>
                      <option value="AMOUNT_MISMATCH">Amount mismatch</option>
                      <option value="DUPLICATE_SUBMISSION">Duplicate submission</option>
                      <option value="SUSPECTED_FRAUD">Suspected fraud</option>
                    </select>
                  </label>
                )}
                <p className="muted">
                  This decision is recorded by the server with the authenticated operator context.
                </p>
                <div className="modal-actions">
                  <button type="button" onClick={() => setVerification(undefined)}>
                    Cancel
                  </button>
                  <button
                    className={verification.mode === 'reject' ? 'danger-action' : 'button primary'}
                    disabled={busy}
                    type="submit"
                  >
                    {verification.mode === 'verify' ? 'Confirm verification' : 'Reject submission'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
        {refundPayment ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="command-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="refund-title"
            >
              <header>
                <div>
                  <p className="eyebrow">Refund command</p>
                  <h2 id="refund-title">Refund {refundPayment.paymentNumber}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setRefundPayment(undefined)}
                >
                  <X aria-hidden="true" />
                </button>
              </header>
              <div className="command-summary">
                <span>
                  Order<strong>{refundPayment.orderNumber}</strong>
                </span>
                <span>
                  Collected<strong>{money(refundPayment.amount)}</strong>
                </span>
                <span>
                  Already refunded<strong>{money(refundPayment.refunded)}</strong>
                </span>
                <span>
                  Available<strong>{money(refundPayment.net)}</strong>
                </span>
              </div>
              <form onSubmit={(event) => void submitRefund(event)}>
                <label>
                  Refund amount
                  <input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={refundPayment.net}
                    required
                  />
                </label>
                <label>
                  Reason code
                  <select name="reasonCode" defaultValue="CUSTOMER_REQUEST">
                    <option value="CUSTOMER_REQUEST">Customer request</option>
                    <option value="ORDER_CANCELLED">Order cancelled</option>
                    <option value="RETURN_APPROVED">Return approved</option>
                    <option value="PAYMENT_CORRECTION">Payment correction</option>
                  </select>
                </label>
                <label>
                  External transaction reference{' '}
                  <span className="muted">(optional until completed)</span>
                  <input name="externalReference" autoComplete="off" />
                </label>
                <OperationalFeedback tone="warning">
                  <ReceiptText aria-hidden="true" /> A completed refund is immutable. Leave the
                  reference blank to create a pending request.
                </OperationalFeedback>
                <div className="modal-actions">
                  <button type="button" onClick={() => setRefundPayment(undefined)}>
                    Cancel
                  </button>
                  <button className="button primary" disabled={busy} type="submit">
                    Create refund
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
