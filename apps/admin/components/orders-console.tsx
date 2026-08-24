'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CircleDollarSign,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from 'lucide-react';

import type { ApiEnvelope } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: string;
  customerName: string;
  customerId: string;
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
const money = (value: string) =>
  new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(Number(value));
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
  const [statusFilter, setStatusFilter] = useState('ALL');
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
    const loadedOrders = ((await response.json()) as ApiEnvelope<readonly OrderSummary[]>).data;
    setOrders(loadedOrders);
    const locationResponse = await fetch('/api/admin/warehouse/locations', {
      credentials: 'include',
    });
    if (locationResponse.ok)
      setLocations(
        ((await locationResponse.json()) as ApiEnvelope<readonly Location[]>).data.filter(
          (location) => location.capabilities.includes('STOCK_HOLDING'),
        ),
      );
    const orderId = new URLSearchParams(window.location.search).get('order');
    if (orderId && loadedOrders.some((order) => order.id === orderId)) await select(orderId);
  };
  useEffect(() => {
    void load();
  }, []);
  const visible = useMemo(() => {
    const customerId =
      typeof window === 'undefined'
        ? undefined
        : new URLSearchParams(window.location.search).get('customer');
    return orders.filter(
      (order) =>
        (!customerId || order.customerId === customerId) &&
        (statusFilter === 'ALL' || order.status === statusFilter) &&
        `${order.orderNumber} ${order.customerName} ${order.status} ${order.paymentStatus}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    );
  }, [orders, filter, statusFilter]);
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
    <main className="admin-page orders-v2">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce / Orders</p>
          <h1>Order operations</h1>
          <p>Prioritize payment, fulfillment, delivery, and exception work from one queue.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" type="button" onClick={() => void load()}>
            <RefreshCw /> Refresh
          </button>
          <Link className="button secondary" href="/payments">
            <CircleDollarSign /> Payment queue
          </Link>
          <Link className="button primary" href="/fulfillments">
            <Boxes /> Fulfillment queue
          </Link>
        </div>
      </header>
      {message ? (
        <div className="notice notice-warning" role="status">
          <AlertTriangle /> {message}
        </div>
      ) : null}
      <section className="orders-filterbar" aria-label="Order filters">
        <label className="table-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search orders</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search Order number, customer, payment…"
          />
        </label>
        <div className="filter-chips" role="group" aria-label="Order state">
          {['ALL', 'PENDING', 'CONFIRMED', 'ON_HOLD', 'CANCELLED'].map((status) => (
            <button
              aria-pressed={statusFilter === status}
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
            >
              {status === 'ALL' ? 'All orders' : status.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
        <span className="result-count">{visible.length} results</span>
      </section>
      <div className={`order-workspace ${selected ? 'detail-open' : ''}`}>
        <section className="panel order-list-panel" aria-label="Orders">
          <div className="data-table-shell">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Created</th>
                  <th>Order state</th>
                  <th>Payment</th>
                  <th className="numeric">Total</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr className={selected?.id === order.id ? 'selected-row' : ''} key={order.id}>
                    <td>
                      <strong>{order.orderNumber}</strong>
                      <small className="cell-secondary">{order.paymentMethod}</small>
                    </td>
                    <td>{order.customerName || 'Guest customer'}</td>
                    <td>
                      <time dateTime={order.createdAt}>
                        {new Date(order.createdAt).toLocaleDateString('en-BD', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </time>
                      <small className="cell-secondary">
                        {new Date(order.createdAt).toLocaleTimeString('en-BD', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </small>
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>
                      <StatusBadge status={order.paymentStatus} />
                    </td>
                    <td className="numeric">
                      <strong>{money(order.total)}</strong>
                    </td>
                    <td>
                      <button
                        className="row-link"
                        type="button"
                        onClick={() => void select(order.id)}
                      >
                        Open <ArrowRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 ? (
              <div className="empty-state">
                <ShoppingBag />
                <strong>No matching Orders</strong>
                <p>Clear filters or wait for a new Order to enter this queue.</p>
              </div>
            ) : null}
          </div>
        </section>
        {selected ? (
          <aside className="order-detail-panel" aria-label={`Order ${selected.orderNumber}`}>
            <header className="detail-header">
              <div>
                <p className="eyebrow">Order workspace</p>
                <h2>{selected.orderNumber}</h2>
                <div className="inline-status">
                  <StatusBadge status={selected.status} />
                  <StatusBadge status={selected.payment.status} />
                </div>
              </div>
              <button
                aria-label="Close Order details"
                type="button"
                onClick={() => setSelected(undefined)}
              >
                <X />
              </button>
            </header>
            <section className="next-action-card">
              <div>
                <strong>Recommended next action</strong>
                <p>
                  {selected.status === 'PENDING'
                    ? 'Confirm the Order after reviewing customer, price, and payment terms.'
                    : selected.status === 'CONFIRMED'
                      ? 'Create a Fulfillment from the reserved Order quantities.'
                      : selected.status === 'ON_HOLD'
                        ? 'Resolve the hold before fulfillment.'
                        : 'No forward commerce action is available.'}
                </p>
              </div>
              {selected.status === 'PENDING' ? (
                <button disabled={busy} type="button" onClick={() => void transition('CONFIRMED')}>
                  <PackageCheck />
                  Confirm Order
                </button>
              ) : null}
            </section>
            <section className="detail-section">
              <h3>
                <UserRound /> Customer
              </h3>
              <strong>{selected.customer.displayName}</strong>
              <p>
                {selected.customer.phone}
                {selected.customer.email ? ` · ${selected.customer.email}` : ''}
              </p>
            </section>
            <section className="detail-section">
              <h3>
                <MapPin /> Delivery address
              </h3>
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
            </section>
            <section className="detail-section">
              <h3>
                <ShoppingBag /> Items
              </h3>
              <div className="order-lines">
                {selected.lines.map((line) => (
                  <article key={line.id}>
                    <div>
                      <strong>{line.productTitle}</strong>
                      <small>
                        {line.sku}
                        {line.options.length
                          ? ` · ${line.options.map((option) => `${option.name}: ${option.value}`).join(', ')}`
                          : ''}
                      </small>
                    </div>
                    <span>
                      {line.quantity} × {money(line.unitPrice)}
                    </span>
                    <b>{money(line.net)}</b>
                  </article>
                ))}
              </div>
              <dl className="order-totals">
                <div>
                  <dt>Gross</dt>
                  <dd>{money(selected.merchandiseGross)}</dd>
                </div>
                <div>
                  <dt>Discount</dt>
                  <dd>− {money(selected.discountTotal)}</dd>
                </div>
                <div>
                  <dt>Merchandise total</dt>
                  <dd>{money(selected.merchandiseNet)}</dd>
                </div>
              </dl>
            </section>
            <section className="detail-section payment-summary">
              <h3>
                <CircleDollarSign /> Payment
              </h3>
              <div className="summary-grid">
                <span>
                  Expected<strong>{money(selected.payment.expected)}</strong>
                </span>
                <span>
                  Collected<strong>{money(selected.payment.collected)}</strong>
                </span>
                <span>
                  Outstanding<strong>{money(selected.payment.outstanding)}</strong>
                </span>
                <span>
                  Refunded<strong>{money(selected.payment.refunded)}</strong>
                </span>
              </div>
              <Link className="row-link" href="/payments">
                Review Payment workspace <ArrowRight />
              </Link>
            </section>
            <section className="detail-section">
              <h3>
                <Boxes /> Fulfillment & delivery
              </h3>
              <p>
                {fulfillments.length
                  ? fulfillments
                      .map((item) => `${item.fulfillmentNumber} (${item.status})`)
                      .join(', ')
                  : 'No Fulfillment created.'}
              </p>
              <p>
                {deliveries.length
                  ? deliveries
                      .map(
                        (item) =>
                          `${item.deliveryNumber} (${item.operationalStatus})${item.trackingReference ? ` · ${item.trackingReference}` : ''}`,
                      )
                      .join(', ')
                  : 'No Delivery created.'}
              </p>
              <div className="detail-links">
                <Link href="/fulfillments">Fulfillments</Link>
                <Link href="/deliveries">Deliveries</Link>
                <Link href="/returns">Returns</Link>
              </div>
            </section>
            {['PENDING', 'CONFIRMED'].includes(selected.status) && locations.length ? (
              <details className="detail-command">
                <summary>Create Fulfillment</summary>
                <p>
                  Choose reserved quantities. Physical stock changes only when Fulfillment is
                  dispatched.
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
                      {line.productTitle} · ordered {line.quantity}
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
                    Create Fulfillment
                  </button>
                </form>
              </details>
            ) : null}
            <footer className="detail-actions">
              {['PENDING', 'CONFIRMED'].includes(selected.status) ? (
                <button disabled={busy} type="button" onClick={() => void transition('ON_HOLD')}>
                  Put on hold
                </button>
              ) : null}
              {['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(selected.status) ? (
                <button
                  className="danger-action"
                  disabled={busy}
                  type="button"
                  onClick={() => void cancel()}
                >
                  Cancel Order
                </button>
              ) : null}
            </footer>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
