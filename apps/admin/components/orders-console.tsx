'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { ApiEnvelope } from '@maevelle/contracts';

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: string;
  customerName: string;
  createdAt: string;
}
interface OrderDetail {
  id: string;
  version: number;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  payment: {
    status: string;
    expected: string;
    collected: string;
    refunded: string;
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
    id: string;
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
interface Location {
  id: string;
  name: string;
  capabilities: readonly string[];
}
interface FulfillmentSummary {
  id: string;
  orderId: string;
  fulfillmentNumber: string;
  status: string;
}
interface DeliverySummary {
  id: string;
  orderId: string;
  deliveryNumber: string;
  operationalStatus: string;
  trackingReference?: string;
}
const money = (value: string) => `৳${value}`;
async function errorText(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string } | string;
  };
  return typeof body.error === 'object'
    ? (body.error.message ?? body.error.code ?? 'Request failed.')
    : (body.error ?? 'Request failed.');
}

export function OrdersConsole() {
  const [orders, setOrders] = useState<readonly OrderSummary[]>([]);
  const [selected, setSelected] = useState<OrderDetail>();
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<readonly Location[]>([]);
  const [fulfillments, setFulfillments] = useState<readonly FulfillmentSummary[]>([]);
  const [deliveries, setDeliveries] = useState<readonly DeliverySummary[]>([]);
  const load = async () => {
    const response = await fetch('/api/admin/orders', { credentials: 'include' });
    if (!response.ok) {
      setMessage(
        response.status === 403
          ? 'You do not have permission to view Orders.'
          : await errorText(response),
      );
      return;
    }
    setOrders(((await response.json()) as ApiEnvelope<readonly OrderSummary[]>).data);
    const locationResponse = await fetch('/api/admin/warehouse/locations', {
      credentials: 'include',
    });
    if (locationResponse.ok)
      setLocations(
        ((await locationResponse.json()) as ApiEnvelope<readonly Location[]>).data.filter(
          (location) => location.capabilities.includes('STOCK_HOLDING'),
        ),
      );
  };
  useEffect(() => {
    void load();
  }, []);
  const visible = useMemo(
    () =>
      orders.filter((order) =>
        `${order.orderNumber} ${order.customerName} ${order.status}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [orders, filter],
  );
  async function select(id: string) {
    const response = await fetch(`/api/admin/orders/${id}`, { credentials: 'include' });
    if (!response.ok) {
      setMessage(await errorText(response));
      return;
    }
    const detail = ((await response.json()) as ApiEnvelope<OrderDetail>).data;
    setSelected(detail);
    const [fulfillmentResponse, deliveryResponse] = await Promise.all([
      fetch('/api/admin/fulfillments', { credentials: 'include' }),
      fetch('/api/admin/deliveries', { credentials: 'include' }),
    ]);
    if (fulfillmentResponse.ok)
      setFulfillments(
        (
          (await fulfillmentResponse.json()) as ApiEnvelope<readonly FulfillmentSummary[]>
        ).data.filter((fulfillment) => fulfillment.orderId === detail.id),
      );
    if (deliveryResponse.ok)
      setDeliveries(
        ((await deliveryResponse.json()) as ApiEnvelope<readonly DeliverySummary[]>).data.filter(
          (delivery) => delivery.orderId === detail.id,
        ),
      );
  }
  async function transition(status: 'CONFIRMED' | 'ON_HOLD') {
    if (!selected || busy) return;
    setBusy(true);
    const response = await fetch(`/api/admin/orders/${selected.id}/status`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: selected.version, status }),
    });
    if (response.ok) {
      setSelected(((await response.json()) as ApiEnvelope<OrderDetail>).data);
      await load();
    } else setMessage(await errorText(response));
    setBusy(false);
  }
  async function cancel() {
    if (!selected || busy || !window.confirm('Cancel this Order and release its reservation?'))
      return;
    setBusy(true);
    const response = await fetch(`/api/admin/orders/${selected.id}/cancel`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ version: selected.version, reasonCode: 'ADMIN_REQUEST' }),
    });
    if (response.ok) {
      setSelected(((await response.json()) as ApiEnvelope<{ order: OrderDetail }>).data.order);
      await load();
    } else setMessage(await errorText(response));
    setBusy(false);
  }
  async function createFulfillment(form: HTMLFormElement) {
    if (!selected || busy) return;
    setBusy(true);
    const values = new FormData(form);
    const lines = selected.lines
      .map((line) => ({
        orderLineId: line.id,
        quantity: String(values.get(`quantity-${line.id}`) ?? ''),
      }))
      .filter((line) => Number(line.quantity) > 0);
    const response = await fetch(`/api/admin/orders/${selected.id}/fulfillments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ locationId: values.get('locationId'), lines }),
    });
    if (response.ok) {
      setMessage('Fulfillment created. Continue picking and packing in Operations → Fulfillments.');
      form.reset();
    } else setMessage(await errorText(response));
    setBusy(false);
  }
  return (
    <main>
      <section className="shell">
        <h1>Orders</h1>
        <label>
          Search{' '}
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Order number, customer, status"
          />
        </label>
        {message ? <p role="status">{message}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Created</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((order) => (
              <tr key={order.id}>
                <td>
                  <button type="button" onClick={() => void select(order.id)}>
                    {order.orderNumber}
                  </button>
                </td>
                <td>{order.customerName}</td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
                <td>{order.status}</td>
                <td>
                  {order.paymentMethod} · {order.paymentStatus}
                </td>
                <td>{money(order.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {selected ? (
          <section>
            <h2>{selected.orderNumber}</h2>
            <p>
              Status: {selected.status} · Payment method: {selected.paymentMethod}
            </p>
            {['PENDING', 'CONFIRMED'].includes(selected.status) && locations.length ? (
              <section>
                <h3>Create fulfillment</h3>
                <p>
                  Choose quantities from this Order reservation. Stock is physically deducted only
                  at dispatch.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createFulfillment(event.currentTarget);
                  }}
                >
                  <label>
                    Stock location
                    <select name="locationId" required defaultValue="">
                      <option disabled value="">
                        Choose location
                      </option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selected.lines.map((line) => (
                    <label key={line.id}>
                      {line.productTitle} · {line.sku} · ordered {line.quantity}
                      <input
                        defaultValue={line.quantity}
                        inputMode="decimal"
                        min="0"
                        name={`quantity-${line.id}`}
                        step="0.000001"
                      />
                    </label>
                  ))}
                  <button disabled={busy} type="submit">
                    Create fulfillment
                  </button>
                </form>
              </section>
            ) : null}
            <p>
              Payment status: {selected.payment.status} · Expected{' '}
              {money(selected.payment.expected)} · Collected {money(selected.payment.collected)} ·
              Refunded {money(selected.payment.refunded)} · Outstanding{' '}
              {money(selected.payment.outstanding)}
            </p>
            <p>
              {selected.customer.displayName} · {selected.customer.phone}
              {selected.customer.email ? ` · ${selected.customer.email}` : ''}
            </p>
            <p>
              {[
                selected.address.recipientName,
                selected.address.addressLine1,
                selected.address.addressLine2,
                selected.address.area,
                selected.address.city,
                selected.address.district,
                selected.address.postalCode,
                selected.address.countryCode,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            <h3>Items</h3>
            {selected.lines.map((line) => (
              <p key={`${line.sku}-${line.productTitle}`}>
                {line.productTitle} · {line.sku}
                {line.options.length
                  ? ` · ${line.options.map((option) => `${option.name}: ${option.value}`).join(', ')}`
                  : ''}{' '}
                · Qty {line.quantity} · {money(line.net)}
              </p>
            ))}
            <p>
              Gross {money(selected.merchandiseGross)} · Discount {money(selected.discountTotal)} ·{' '}
              <strong>Total {money(selected.merchandiseNet)}</strong>
            </p>
            <section>
              <h3>Operations</h3>
              <p>
                Fulfillment:{' '}
                {fulfillments.length
                  ? fulfillments
                      .map((item) => `${item.fulfillmentNumber} (${item.status})`)
                      .join(', ')
                  : 'Not yet created'}{' '}
                · Delivery:{' '}
                {deliveries.length
                  ? deliveries
                      .map(
                        (item) =>
                          `${item.deliveryNumber} (${item.operationalStatus})${item.trackingReference ? ` · ${item.trackingReference}` : ''}`,
                      )
                      .join(', ')
                  : 'Not yet created'}
              </p>
              <p>
                <Link href="/fulfillments">Open Fulfillments</Link> ·{' '}
                <Link href="/deliveries">Open Deliveries</Link>
              </p>
            </section>
            {selected.status === 'PENDING' ? (
              <button disabled={busy} type="button" onClick={() => void transition('CONFIRMED')}>
                Confirm
              </button>
            ) : null}
            {['PENDING', 'CONFIRMED'].includes(selected.status) ? (
              <button disabled={busy} type="button" onClick={() => void transition('ON_HOLD')}>
                Put on hold
              </button>
            ) : null}
            {['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(selected.status) ? (
              <button disabled={busy} type="button" onClick={() => void cancel()}>
                Cancel Order
              </button>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
