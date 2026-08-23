'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

interface Delivery {
  id: string;
  version: number;
  deliveryNumber: string;
  orderNumber: string;
  fulfillmentNumber: string;
  operationalStatus:
    'READY' | 'BOOKED' | 'HANDED_OVER' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  outcomeStatus: string;
  recipient: { name: string; phone: string; address: string };
  manualCarrierName?: string;
  trackingReference?: string;
  events: readonly { type: string; occurredAt: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('The delivery command was rejected.');
  return response.json() as Promise<T>;
}

export function DeliveryConsole() {
  const [deliveries, setDeliveries] = useState<readonly Delivery[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      setDeliveries((await request<ApiEnvelope<readonly Delivery[]>>('/admin/deliveries')).data);
    } catch {
      setMessage('Unable to load deliveries. Sign in with delivery permission.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  async function simple(delivery: Delivery, action: 'dispatch' | 'delivered' | 'failed') {
    try {
      const body =
        action === 'failed'
          ? { version: delivery.version, reasonCode: 'MANUAL_DELIVERY_FAILURE' }
          : { version: delivery.version };
      await request(`/admin/deliveries/${delivery.id}/${action}`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      await reload();
    } catch {
      setMessage('The delivery state could not be updated. Reload and try again.');
    }
  }
  async function book(delivery: Delivery, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(`/admin/deliveries/${delivery.id}/manual-booking`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version: delivery.version,
          carrierName: form.get('carrierName'),
          trackingReference: form.get('trackingReference'),
        }),
      });
      event.currentTarget.reset();
      await reload();
    } catch {
      setMessage('Manual courier booking could not be recorded.');
    }
  }
  return (
    <main>
      <section className="shell">
        <h1>Deliveries</h1>
        <p>Delivery does not alter commercial Order, payment, or physical inventory history.</p>
        {message ? <p role="status">{message}</p> : null}
        {deliveries.map((delivery) => (
          <article key={delivery.id}>
            <h2>{delivery.deliveryNumber}</h2>
            <p>
              Order {delivery.orderNumber} · Fulfillment {delivery.fulfillmentNumber} ·{' '}
              {delivery.operationalStatus}
            </p>
            <p>
              {delivery.recipient.name} · {delivery.recipient.phone}
              <br />
              {delivery.recipient.address}
            </p>
            {delivery.manualCarrierName ? (
              <p>
                {delivery.manualCarrierName} · {delivery.trackingReference}
              </p>
            ) : null}
            {delivery.operationalStatus === 'READY' ? (
              <form onSubmit={(event) => void book(delivery, event)}>
                <label>
                  Manual carrier <input name="carrierName" required />
                </label>
                <label>
                  Tracking/reference <input name="trackingReference" required />
                </label>
                <button type="submit">Record booking</button>
              </form>
            ) : null}
            {delivery.operationalStatus === 'BOOKED' ? (
              <button onClick={() => void simple(delivery, 'dispatch')} type="button">
                Hand over / dispatch
              </button>
            ) : null}
            {delivery.operationalStatus === 'IN_TRANSIT' ? (
              <>
                <button onClick={() => void simple(delivery, 'delivered')} type="button">
                  Mark delivered
                </button>
                <button onClick={() => void simple(delivery, 'failed')} type="button">
                  Mark failed
                </button>
              </>
            ) : null}
            <p>Timeline: {delivery.events.map((entry) => entry.type).join(' → ')}</p>
          </article>
        ))}
        {deliveries.length === 0 ? (
          <p>No deliveries yet. Create one after a Fulfillment is physically dispatched.</p>
        ) : null}
      </section>
    </main>
  );
}
