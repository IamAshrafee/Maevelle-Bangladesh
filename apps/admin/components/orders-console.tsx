'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
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
    setSelected(((await response.json()) as ApiEnvelope<OrderDetail>).data);
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
                <td>COD</td>
                <td>{money(order.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {selected ? (
          <section>
            <h2>{selected.orderNumber}</h2>
            <p>Status: {selected.status} · Payment: COD</p>
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
