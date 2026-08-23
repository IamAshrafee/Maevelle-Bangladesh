'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

interface Order {
  orderNumber: string;
  status: string;
  paymentMethod: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
  payment: {
    status: string;
    expected: string;
    collected: string;
    refunded: string;
    netCollected: string;
    outstanding: string;
  };
  merchandiseGross: string;
  discountTotal: string;
  merchandiseNet: string;
  customer: { displayName: string; phone: string; email: string | null };
  address: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    area?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    countryCode: string;
  };
  lines: readonly {
    sku: string;
    productTitle: string;
    quantity: string;
    unitPrice: string;
    gross: string;
    discount: string;
    net: string;
    options: readonly { name: string; value: string }[];
  }[];
}
interface PaymentDetail {
  summary: Order['payment'];
  instructions: {
    method: string;
    name: string;
    instructions: { accountNumber?: string; text?: string };
  } | null;
}
const money = (value: string) => `৳${value}`;
export default function OrderConfirmationPage() {
  const [order, setOrder] = useState<Order>();
  const [message, setMessage] = useState('');
  const [payment, setPayment] = useState<PaymentDetail>();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/storefront/v1/orders/confirmation', {
        credentials: 'include',
      });
      if (response.ok) setOrder(((await response.json()) as ApiEnvelope<Order>).data);
      else
        setMessage(
          'This Order confirmation is unavailable. Use the secure checkout link from the completed session.',
        );
      const paymentResponse = await fetch('/api/storefront/v1/orders/confirmation/payment', {
        credentials: 'include',
      });
      if (paymentResponse.ok)
        setPayment(((await paymentResponse.json()) as ApiEnvelope<PaymentDetail>).data);
    })();
  }, []);
  async function submitManualPayment(form: HTMLFormElement) {
    setSubmitting(true);
    setMessage('');
    const data = new FormData(form);
    const response = await fetch('/api/storefront/v1/orders/confirmation/payment-attempts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        transactionReference: data.get('transactionReference'),
        payerReference: data.get('payerReference') || undefined,
        claimedAmount: data.get('claimedAmount') || undefined,
      }),
    });
    if (response.ok) {
      setMessage('Payment submitted. It is waiting for verification.');
      const details = await fetch('/api/storefront/v1/orders/confirmation/payment', {
        credentials: 'include',
      });
      if (details.ok) setPayment(((await details.json()) as ApiEnvelope<PaymentDetail>).data);
    } else
      setMessage(
        'Payment submission could not be accepted. Check the transaction reference and try again.',
      );
    setSubmitting(false);
  }
  if (!order)
    return (
      <main>
        <section className="shell">
          <h1>Order confirmation</h1>
          <p>{message || 'Loading confirmation…'}</p>
          <Link href="/">Continue shopping</Link>
        </section>
      </main>
    );
  return (
    <main>
      <section className="shell">
        <h1>Order {order.orderNumber}</h1>
        <p>Status: {order.status}</p>
        <p>
          Payment: <strong>{payment?.instructions?.name ?? order.paymentMethod}</strong> ·{' '}
          {payment?.summary.status === 'UNPAID' && order.paymentMethod === 'COD'
            ? 'Payment due on delivery'
            : (payment?.summary.status ?? 'Payment due')}
        </p>
        <h2>Customer</h2>
        <p>
          {order.customer.displayName} · {order.customer.phone}
          {order.customer.email ? ` · ${order.customer.email}` : ''}
        </p>
        <h2>Delivery</h2>
        <p>
          {[
            order.address.recipientName,
            order.address.addressLine1,
            order.address.addressLine2,
            order.address.area,
            order.address.city,
            order.address.district,
            order.address.postalCode,
            order.address.countryCode,
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
        <h2>Items</h2>
        {order.lines.map((line) => (
          <article key={`${line.sku}-${line.productTitle}`}>
            <h3>{line.productTitle}</h3>
            <p>
              {line.sku}
              {line.options.length
                ? ` · ${line.options.map((option) => `${option.name}: ${option.value}`).join(', ')}`
                : ''}
            </p>
            <p>
              Qty {line.quantity} · Unit {money(line.unitPrice)} · Gross {money(line.gross)} ·
              Discount {money(line.discount)} · Net {money(line.net)}
            </p>
          </article>
        ))}
        <p>Merchandise: {money(order.merchandiseGross)}</p>
        <p>Discount: {money(order.discountTotal)}</p>
        <p>
          <strong>Total: {money(order.merchandiseNet)}</strong>
        </p>
        {payment?.instructions?.method === 'BKASH_MANUAL' ||
        payment?.instructions?.method === 'NAGAD_MANUAL' ? (
          <section>
            <h2>Manual payment</h2>
            <p>
              {payment.instructions.instructions.text ??
                'Follow the merchant payment instructions below.'}
            </p>
            {payment.instructions.instructions.accountNumber ? (
              <p>
                Send payment to: <strong>{payment.instructions.instructions.accountNumber}</strong>
              </p>
            ) : null}
            <p>
              Payment status: {payment.summary.status} · Outstanding:{' '}
              {money(payment.summary.outstanding)}
            </p>
            {payment.summary.status === 'UNPAID' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitManualPayment(event.currentTarget);
                }}
              >
                <label>
                  Transaction reference <input name="transactionReference" required />
                </label>
                <label>
                  Sender number <input name="payerReference" />
                </label>
                <label>
                  Claimed amount <input name="claimedAmount" inputMode="decimal" />
                </label>
                <button disabled={submitting} type="submit">
                  {submitting ? 'Submitting…' : 'Submit payment reference'}
                </button>
              </form>
            ) : null}
          </section>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        <Link href="/">Continue shopping</Link>
      </section>
    </main>
  );
}
