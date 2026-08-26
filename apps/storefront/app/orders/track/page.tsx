'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

interface Order {
  orderNumber: string;
  status: string;
  merchandiseNet: string;
  payment: { status: string };
  lines: readonly { productTitle: string; sku: string; quantity: string }[];
}
interface Journey {
  fulfillment: 'PREPARING' | 'DISPATCHED' | null;
  delivery: 'PREPARING' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | null;
}

const stages = [
  'Order confirmed',
  'Payment',
  'Preparing order',
  'Dispatched',
  'Delivered',
] as const;

export default function TrackOrderPage() {
  const [order, setOrder] = useState<Order>();
  const [journey, setJourney] = useState<Journey>();
  const [message, setMessage] = useState('Checking your secure order link…');
  useEffect(() => {
    void Promise.all([
      fetch('/api/storefront/v1/orders/confirmation', { credentials: 'include' }),
      fetch('/api/storefront/v1/orders/confirmation/fulfillment', { credentials: 'include' }),
    ])
      .then(async ([orderResponse, journeyResponse]) => {
        if (!orderResponse.ok)
          throw new Error(
            'A valid secure order link is required. Open tracking from your confirmation link.',
          );
        setOrder(((await orderResponse.json()) as ApiEnvelope<Order>).data);
        if (journeyResponse.ok)
          setJourney(((await journeyResponse.json()) as ApiEnvelope<Journey>).data);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Order tracking is unavailable.'),
      );
  }, []);
  const completed = order
    ? journey?.delivery === 'DELIVERED'
      ? 5
      : journey?.delivery === 'IN_TRANSIT'
        ? 4
        : journey?.fulfillment === 'DISPATCHED'
          ? 4
          : journey?.fulfillment === 'PREPARING'
            ? 3
            : order.payment.status !== 'UNPAID'
              ? 2
              : 1
    : 0;
  return (
    <main>
      <section className="tracking-page">
        <p className="eyebrow">Secure order tracking</p>
        <h1>Track your order</h1>
        {message ? (
          <div className="checkout-message" role="status">
            {message}
          </div>
        ) : null}
        {order ? (
          <>
            <div className="tracking-summary">
              <div>
                <span>Order</span>
                <strong>{order.orderNumber}</strong>
              </div>
              <div>
                <span>Order status</span>
                <strong>{order.status.replaceAll('_', ' ')}</strong>
              </div>
              <div>
                <span>Payment</span>
                <strong>{order.payment.status.replaceAll('_', ' ')}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>
                  {new Intl.NumberFormat('en-BD', {
                    style: 'currency',
                    currency: 'BDT',
                    maximumFractionDigits: 0,
                  }).format(Number(order.merchandiseNet))}
                </strong>
              </div>
            </div>
            <ol className="order-timeline">
              {stages.map((stage, index) => (
                <li
                  className={index < completed ? 'complete' : index === completed ? 'current' : ''}
                  key={stage}
                >
                  <span aria-hidden="true">{index < completed ? '✓' : index + 1}</span>
                  <div>
                    <strong>{stage}</strong>
                    <small>
                      {index < completed
                        ? 'Completed'
                        : index === completed
                          ? 'Current step'
                          : 'Upcoming'}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
            {journey?.delivery === 'FAILED' ? (
              <p className="line-warning">
                A delivery attempt needs attention. Maevelle operations can help with the next step.
              </p>
            ) : null}
            <section className="tracked-items">
              <h2>Items in this order</h2>
              {order.lines.map((line) => (
                <p key={line.sku}>
                  <strong>{line.productTitle}</strong>
                  <span>
                    {line.sku} · Qty {line.quantity}
                  </span>
                </p>
              ))}
            </section>
          </>
        ) : null}
        <p>
          <Link href="/">Return to Maevelle</Link>
        </p>
      </section>
    </main>
  );
}
