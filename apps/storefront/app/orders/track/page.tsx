'use client';

import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

interface Order {
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  total: string;
  currency: string;
  lines: readonly { productTitle: string; sku: string; quantity: string }[];
}

export default function TrackOrderPage() {
  const [order, setOrder] = useState<Order>();
  const [message, setMessage] = useState('Checking your secure Order credential…');
  useEffect(() => {
    void fetch('/api/storefront/v1/orders/confirmation', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('A valid secure Order credential is required.');
        setOrder(((await response.json()) as ApiEnvelope<Order>).data);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Order tracking is unavailable.'),
      );
  }, []);
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Secure tracking</p>
        <h1>Track your Order</h1>
        {message ? <p role="status">{message}</p> : null}
        {order ? (
          <>
            <dl>
              <dt>Order</dt>
              <dd>{order.orderNumber}</dd>
              <dt>Status</dt>
              <dd>{order.status}</dd>
              <dt>Payment</dt>
              <dd>{order.paymentStatus ?? 'Pending confirmation'}</dd>
              <dt>Total</dt>
              <dd>
                {order.currency} {order.total}
              </dd>
            </dl>
            <h2>Items</h2>
            {order.lines.map((line) => (
              <p key={line.sku}>
                {line.productTitle} · {line.sku} · Qty {line.quantity}
              </p>
            ))}
          </>
        ) : null}
      </section>
    </main>
  );
}
