'use client';

import { useEffect, useState } from 'react';

import type { ApiEnvelope, WarehouseLocationDto } from '@maevelle/contracts';

interface Fulfillment {
  id: string;
  version: number;
  fulfillmentNumber: string;
  orderNumber: string;
  locationName: string;
  status: 'DRAFT' | 'READY' | 'PICKING' | 'PACKED' | 'DISPATCHED' | 'CANCELLED';
  lines: readonly { sku: string; productTitle: string; quantity: string; consumed: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
    };
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? 'The fulfillment command was rejected.'),
    );
  }
  return response.json() as Promise<T>;
}

export function FulfillmentConsole() {
  const [fulfillments, setFulfillments] = useState<readonly Fulfillment[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      const [fulfillmentResult, locationResult] = await Promise.all([
        request<ApiEnvelope<readonly Fulfillment[]>>('/admin/fulfillments'),
        request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations'),
      ]);
      setFulfillments(fulfillmentResult.data);
      setLocations(
        locationResult.data.filter((location) => location.capabilities.includes('STOCK_HOLDING')),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load fulfillment operations.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  async function action(
    fulfillment: Fulfillment,
    actionName: 'ready' | 'start-picking' | 'pack' | 'dispatch' | 'cancel',
  ) {
    try {
      if (
        actionName === 'dispatch' &&
        !window.confirm('Dispatch will physically deduct the reserved inventory. Continue?')
      )
        return;
      await request(`/admin/fulfillments/${fulfillment.id}/${actionName}`, {
        method: 'POST',
        ...(actionName === 'dispatch' || actionName === 'cancel'
          ? { headers: { 'idempotency-key': crypto.randomUUID() } }
          : {}),
        body: JSON.stringify({ version: fulfillment.version }),
      });
      setMessage(`Fulfillment ${actionName.replace('-', ' ')} completed.`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The fulfillment command was rejected.');
    }
  }
  async function createDelivery(fulfillment: Fulfillment) {
    try {
      await request(`/admin/fulfillments/${fulfillment.id}/deliveries`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      setMessage('Delivery created. Continue in Operations → Deliveries.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delivery could not be created.');
    }
  }
  return (
    <main>
      <section className="shell">
        <h1>Fulfillments</h1>
        <p>
          Prepare Orders from their existing reservation. Dispatch is the only step that physically
          deducts stock.
        </p>
        {locations.length === 0 ? (
          <p>Create an active stock-holding warehouse before fulfilling Orders.</p>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        {fulfillments.map((fulfillment) => (
          <article key={fulfillment.id}>
            <h2>{fulfillment.fulfillmentNumber}</h2>
            <p>
              Order {fulfillment.orderNumber} · {fulfillment.locationName} · {fulfillment.status}
            </p>
            {fulfillment.lines.map((line) => (
              <p key={`${line.sku}-${line.productTitle}`}>
                {line.productTitle} · {line.sku} · Qty {line.quantity}
                {fulfillment.status === 'DISPATCHED'
                  ? ` · Physically consumed ${line.consumed}`
                  : ''}
              </p>
            ))}
            {fulfillment.status === 'DRAFT' ? (
              <button onClick={() => void action(fulfillment, 'ready')} type="button">
                Ready
              </button>
            ) : null}
            {fulfillment.status === 'READY' ? (
              <button onClick={() => void action(fulfillment, 'start-picking')} type="button">
                Start picking
              </button>
            ) : null}
            {fulfillment.status === 'PICKING' ? (
              <button onClick={() => void action(fulfillment, 'pack')} type="button">
                Pack
              </button>
            ) : null}
            {fulfillment.status === 'PACKED' ? (
              <button onClick={() => void action(fulfillment, 'dispatch')} type="button">
                Dispatch and consume stock
              </button>
            ) : null}
            {fulfillment.status === 'DISPATCHED' ? (
              <button onClick={() => void createDelivery(fulfillment)} type="button">
                Create delivery
              </button>
            ) : null}
            {['DRAFT', 'READY', 'PICKING', 'PACKED'].includes(fulfillment.status) ? (
              <button onClick={() => void action(fulfillment, 'cancel')} type="button">
                Cancel fulfillment
              </button>
            ) : null}
          </article>
        ))}
        {fulfillments.length === 0 ? (
          <p>No Fulfillments yet. Create one from an eligible Order.</p>
        ) : null}
      </section>
    </main>
  );
}
