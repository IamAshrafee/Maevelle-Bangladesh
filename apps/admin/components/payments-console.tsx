'use client';

import { useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

type MethodCode = 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
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

const money = (amount: string) => `৳${amount}`;
async function errorText(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  return typeof payload.error === 'string'
    ? payload.error
    : (payload.error?.message ?? 'Request failed.');
}

export function PaymentsConsole() {
  const [methods, setMethods] = useState<readonly PaymentMethod[]>([]);
  const [pending, setPending] = useState<readonly Attempt[]>([]);
  const [payments, setPayments] = useState<readonly Payment[]>([]);
  const [refunds, setRefunds] = useState<readonly Refund[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [methodResponse, pendingResponse, paymentResponse, refundResponse] = await Promise.all([
      fetch('/api/admin/payments/methods', { credentials: 'include' }),
      fetch('/api/admin/payments/pending', { credentials: 'include' }),
      fetch('/api/admin/payments', { credentials: 'include' }),
      fetch('/api/admin/refunds', { credentials: 'include' }),
    ]);
    if (methodResponse.ok)
      setMethods(((await methodResponse.json()) as ApiEnvelope<readonly PaymentMethod[]>).data);
    if (pendingResponse.ok)
      setPending(((await pendingResponse.json()) as ApiEnvelope<readonly Attempt[]>).data);
    if (paymentResponse.ok)
      setPayments(((await paymentResponse.json()) as ApiEnvelope<readonly Payment[]>).data);
    if (refundResponse.ok)
      setRefunds(((await refundResponse.json()) as ApiEnvelope<readonly Refund[]>).data);
    if (!methodResponse.ok && methodResponse.status !== 403)
      setMessage(await errorText(methodResponse));
  };
  useEffect(() => {
    void load();
  }, []);
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
    if (!response.ok) setMessage(await errorText(response));
    else await load();
    setBusy(false);
  }
  async function verify(attempt: Attempt) {
    const confirmedAmount = window.prompt(
      `Confirm collected amount for ${attempt.orderNumber}`,
      attempt.claimedAmount ?? attempt.expectedAmount,
    );
    if (!confirmedAmount) return;
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/admin/payments/attempts/${attempt.id}/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ confirmedAmount }),
    });
    if (!response.ok) setMessage(await errorText(response));
    else await load();
    setBusy(false);
  }
  async function reject(attempt: Attempt) {
    const reasonCode = window.prompt('Rejection reason code');
    if (!reasonCode) return;
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/admin/payments/attempts/${attempt.id}/reject`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasonCode }),
    });
    if (!response.ok) setMessage(await errorText(response));
    else await load();
    setBusy(false);
  }
  async function createAndCompleteRefund(payment: Payment) {
    const amount = window.prompt(`Refund amount; remaining net is ${payment.net}`);
    if (!amount) return;
    const reasonCode = window.prompt('Refund reason code');
    if (!reasonCode) return;
    setBusy(true);
    setMessage('');
    const created = await fetch(`/api/admin/payments/${payment.id}/refunds`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ amount, reasonCode }),
    });
    if (!created.ok) {
      setMessage(await errorText(created));
      setBusy(false);
      return;
    }
    const refund = ((await created.json()) as ApiEnvelope<Refund>).data;
    const externalReference = window.prompt('Manual refund transaction reference');
    if (!externalReference) {
      setMessage('Refund is recorded as requested and awaits manual completion.');
      setBusy(false);
      await load();
      return;
    }
    const completed = await fetch(`/api/admin/refunds/${refund.id}/complete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ externalReference }),
    });
    if (!completed.ok) setMessage(await errorText(completed));
    else await load();
    setBusy(false);
  }
  return (
    <main>
      <section className="shell">
        <h1>Payments</h1>
        <p>Commercial Order status and payment collection are separate operational facts.</p>
        {message ? <p role="status">{message}</p> : null}
        <h2>Payment methods</h2>
        {methods.map((method) => (
          <form
            key={method.id}
            onSubmit={(event) => {
              event.preventDefault();
              void saveMethod(method, event.currentTarget);
            }}
          >
            <h3>{method.code}</h3>
            <label>
              Name <input defaultValue={method.name} name="name" required />
            </label>
            <label>
              Status{' '}
              <select defaultValue={method.status} name="status">
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
            <label>
              Display order{' '}
              <input
                defaultValue={method.displayOrder}
                name="displayOrder"
                type="number"
                required
              />
            </label>
            {method.code !== 'COD' ? (
              <>
                <label>
                  Customer-visible wallet number{' '}
                  <input defaultValue={method.instructions.accountNumber} name="accountNumber" />
                </label>
                <label>
                  Instructions{' '}
                  <textarea defaultValue={method.instructions.text} name="instructions" />
                </label>
              </>
            ) : null}
            <button disabled={busy} type="submit">
              Save method
            </button>
          </form>
        ))}
        <h2>Pending verification</h2>
        {pending.length === 0 ? (
          <p>No payment submissions need verification.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Method</th>
                <th>Expected</th>
                <th>Claimed</th>
                <th>Reference</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((attempt) => (
                <tr key={attempt.id}>
                  <td>{attempt.orderNumber}</td>
                  <td>{attempt.methodName}</td>
                  <td>{money(attempt.expectedAmount)}</td>
                  <td>{attempt.claimedAmount ? money(attempt.claimedAmount) : '—'}</td>
                  <td>{attempt.customerReference}</td>
                  <td>{new Date(attempt.submittedAt).toLocaleString()}</td>
                  <td>
                    <button disabled={busy} onClick={() => void verify(attempt)} type="button">
                      Verify
                    </button>{' '}
                    <button disabled={busy} onClick={() => void reject(attempt)} type="button">
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h2>Confirmed payments</h2>
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
              <th />
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.paymentNumber}</td>
                <td>{payment.orderNumber}</td>
                <td>{payment.method}</td>
                <td>{money(payment.amount)}</td>
                <td>{money(payment.refunded)}</td>
                <td>{money(payment.net)}</td>
                <td>{payment.externalReference}</td>
                <td>
                  <button
                    disabled={busy || payment.net === '0'}
                    onClick={() => void createAndCompleteRefund(payment)}
                    type="button"
                  >
                    Refund
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Refunds</h2>
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
            {refunds.map((refund) => (
              <tr key={refund.id}>
                <td>{refund.refundNumber}</td>
                <td>{money(refund.amount)}</td>
                <td>{refund.status}</td>
                <td>{refund.reasonCode}</td>
                <td>{refund.externalReference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
