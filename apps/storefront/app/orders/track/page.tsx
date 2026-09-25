'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { ApiEnvelope, PublicOrderTrackingDto } from '@maevelle/contracts';

const stages = [
  'Order Confirmed',
  'Payment Verified',
  'Preparing Order',
  'In Transit',
  'Delivered',
] as const;

const money = (value: string) => `৳${Number(value).toLocaleString('en-BD')}`;

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const paramOrderNumber = searchParams.get('orderNumber') ?? '';
  const paramPhone = searchParams.get('phone') ?? '';

  const [orderNumber, setOrderNumber] = useState(paramOrderNumber);
  const [phone, setPhone] = useState(paramPhone);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<PublicOrderTrackingDto | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Track an order by order number and phone via the public tracking API
  async function performLookup(num: string, ph: string) {
    if (!num.trim() || !ph.trim()) {
      setErrorMessage('Please enter both your Order Number and Phone Number.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/storefront/v1/orders/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderNumber: num.trim(),
          phone: ph.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message ??
            'Order was not found. Please verify your order number and phone number.',
        );
      }

      const result = (await response.json()) as ApiEnvelope<PublicOrderTrackingDto>;
      setOrder(result.data);
    } catch (err) {
      setOrder(null);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to track order.');
    } finally {
      setLoading(false);
    }
  }

  // On mount: if query parameters were provided, perform lookup immediately;
  // otherwise, attempt to load the active checkout session confirmation if available.
  useEffect(() => {
    if (paramOrderNumber && paramPhone) {
      void performLookup(paramOrderNumber, paramPhone);
      return;
    }

    // Try reading confirmation cookie for recent orders
    void (async () => {
      try {
        const response = await fetch('/api/storefront/v1/orders/confirmation', {
          credentials: 'include',
        });
        if (response.ok) {
          const confirmation = (await response.json()) as ApiEnvelope<{
            orderNumber: string;
            customer: { phone: string };
          }>;
          if (confirmation?.data?.orderNumber && confirmation?.data?.customer?.phone) {
            setOrderNumber(confirmation.data.orderNumber);
            setPhone(confirmation.data.customer.phone);
            void performLookup(confirmation.data.orderNumber, confirmation.data.customer.phone);
          }
        }
      } catch {
        // Silent fail — user can use manual lookup form
      }
    })();
  }, [paramOrderNumber, paramPhone]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performLookup(orderNumber, phone);
  }

  // Calculate progress stage index (0 to 4)
  const completedStageIndex = (() => {
    if (!order) return -1;
    if (order.status === 'CANCELLED') return -1;
    if (order.deliveryStatus === 'DELIVERED') return 4;
    if (order.deliveryStatus === 'IN_TRANSIT') return 3;
    if (order.fulfillmentStatus === 'FULFILLED' || order.fulfillmentStatus === 'PARTIALLY_FULFILLED')
      return 3;
    if (order.fulfillmentStatus === 'IN_PROGRESS') return 2;
    if (['PAID', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) return 1;
    if (order.paymentMethod === 'COD' && order.status === 'CONFIRMED') return 1;
    return 0;
  })();

  return (
    <section className="tracking-page">
      <p className="eyebrow">Order Tracking</p>
      <h1>Track Your Order</h1>

      {/* Lookup Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Order Number</span>
            <input
              type="text"
              placeholder="e.g. ORD-2026-000001"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              required
              style={{ padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Phone Number</span>
            <input
              type="tel"
              placeholder="e.g. 01700000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              style={{ padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={loading}
              className="button-link dark"
              style={{ width: '100%', padding: '0.625rem 1rem', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Tracking…' : 'Track Order'}
            </button>
          </div>
        </div>
      </form>

      {errorMessage ? (
        <div className="checkout-message" role="alert" style={{ marginBottom: '1.5rem', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '0.75rem', borderRadius: '4px' }}>
          {errorMessage}
        </div>
      ) : null}

      {order ? (
        <>
          {/* Summary Box */}
          <div className="tracking-summary">
            <div>
              <span>Order Number</span>
              <strong>{order.orderNumber}</strong>
            </div>
            <div>
              <span>Order Status</span>
              <strong>{order.status.replaceAll('_', ' ')}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>{order.paymentStatus.replaceAll('_', ' ')} ({order.paymentMethod})</strong>
            </div>
            <div>
              <span>Delivery</span>
              <strong>{order.deliveryStatus.replaceAll('_', ' ')}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{money(order.total)}</strong>
            </div>
          </div>

          {/* Stepper Timeline */}
          {order.status === 'CANCELLED' ? (
            <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px', margin: '1.5rem 0' }}>
              <strong>This order has been cancelled.</strong>
            </div>
          ) : (
            <ol className="order-timeline">
              {stages.map((stage, index) => {
                const isComplete = index <= completedStageIndex;
                const isCurrent = index === completedStageIndex;
                return (
                  <li
                    key={stage}
                    className={isComplete && !isCurrent ? 'complete' : isCurrent ? 'current' : ''}
                  >
                    <span aria-hidden="true">{isComplete && !isCurrent ? '✓' : index + 1}</span>
                    <div>
                      <strong>{stage}</strong>
                      <small>
                        {isCurrent ? 'In progress' : isComplete ? 'Completed' : 'Upcoming'}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Delivery & Carrier Info */}
          {order.delivery ? (
            <div style={{ margin: '1.5rem 0', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Shipment Details</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.875rem' }}>
                {order.delivery.carrierName ? (
                  <div>
                    <span style={{ color: '#6b7280', display: 'block' }}>Carrier</span>
                    <strong>{order.delivery.carrierName}</strong>
                  </div>
                ) : null}
                {order.delivery.trackingReference ? (
                  <div>
                    <span style={{ color: '#6b7280', display: 'block' }}>Tracking Reference</span>
                    <strong>{order.delivery.trackingReference}</strong>
                  </div>
                ) : null}
                {order.delivery.estimatedDeliveryAt ? (
                  <div>
                    <span style={{ color: '#6b7280', display: 'block' }}>Estimated Delivery</span>
                    <strong>{new Date(order.delivery.estimatedDeliveryAt).toLocaleDateString('en-BD')}</strong>
                  </div>
                ) : null}
                {order.delivery.deliveredAt ? (
                  <div>
                    <span style={{ color: '#6b7280', display: 'block' }}>Delivered On</span>
                    <strong>{new Date(order.delivery.deliveredAt).toLocaleDateString('en-BD')}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Destination */}
          <div style={{ margin: '1rem 0', fontSize: '0.875rem', color: '#4b5563' }}>
            <span>Destination: </span>
            <strong>
              {[order.destination.area, order.destination.city, order.destination.district, order.destination.countryCode]
                .filter(Boolean)
                .join(', ')}
            </strong>
          </div>

          {/* Ordered Items */}
          <section className="tracked-items">
            <h2>Items in this order</h2>
            {order.lines.map((line) => (
              <div
                key={`${line.sku}-${line.productTitle}`}
                style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f3f4f6' }}
              >
                {line.imageUrl ? (
                  <img
                    src={line.imageUrl}
                    alt={line.productTitle}
                    style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                  />
                ) : null}
                <div style={{ flex: 1 }}>
                  <strong>{line.productTitle}</strong>
                  {line.variantTitle ? <span> · {line.variantTitle}</span> : null}
                  <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                    {line.sku} · Qty {line.quantity} · {money(line.net)}
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* Totals Breakdown */}
          <dl className="confirmation-totals" style={{ marginTop: '1.5rem' }}>
            <div>
              <dt>Merchandise</dt>
              <dd>{money(order.merchandiseGross)}</dd>
            </div>
            {Number(order.discountTotal) > 0 ? (
              <div>
                <dt>Discount</dt>
                <dd>−{money(order.discountTotal)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Delivery</dt>
              <dd>{Number(order.deliveryAmount) === 0 ? 'Free' : money(order.deliveryAmount)}</dd>
            </div>
            <div style={{ fontWeight: 'bold', borderTop: '1px solid #e5e7eb', paddingTop: '0.5rem' }}>
              <dt>Total</dt>
              <dd>{money(order.total)}</dd>
            </div>
          </dl>
        </>
      ) : null}

      <p style={{ marginTop: '2rem' }}>
        <Link href="/">Return to Maevelle Store</Link>
      </p>
    </section>
  );
}

export default function TrackOrderPage() {
  return (
    <main>
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading tracker…</div>}>
        <TrackOrderContent />
      </Suspense>
    </main>
  );
}
