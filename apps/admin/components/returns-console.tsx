'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Stats, StatsCard, StatsTitle, StatsValue } from '@/components/ui/stats';

import type { ApiEnvelope, PaginatedEnvelope } from '@maevelle/contracts';

import { StatusBadge } from './status-badge';

type ReturnCase = {
  id: string;
  return_number: string;
  case_type: string;
  case_status: string;
  authorization_status: string;
  receipt_status: string;
  version: string;
  created_at: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  reason_code: string;
};
type ReturnDetail = ReturnCase & {
  reason_text: string | null;
  lines: readonly {
    id: string;
    order_line_id: string;
    sku: string;
    product_title: string;
    requested_quantity: string;
    authorized_quantity: string;
    received_quantity: string;
  }[];
  receipts: readonly { id: string; receipt_number: string; status: string; posted_at: string }[];
  refunds: readonly { id: string; refund_id: string; created_at: string }[];
  cogsRecovery: { total_cost: string; currency_code: string } | undefined;
};
type OrderSummary = { id: string; orderNumber: string; customerName: string; status: string };
type OrderDetail = {
  id: string;
  orderNumber: string;
  lines: readonly { id: string; sku: string; productTitle: string; quantity: string }[];
};
type Delivery = {
  id: string;
  deliveryNumber: string;
  orderNumber: string;
  operationalStatus: string;
};
type Location = { id: string; name: string; status: string; capabilities: readonly string[] };
type Refund = {
  id: string;
  refundNumber: string;
  amount: string;
  status: string;
  reasonCode: string;
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => undefined)) as
    (T & { error?: { message?: string } | string }) | undefined;
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(
      typeof error === 'object' && error?.message
        ? error.message
        : 'The reverse-logistics operation could not be completed.',
    );
  }
  return payload as T;
}

export function ReturnsConsole({ rto = false }: { rto?: boolean }) {
  const [cases, setCases] = useState<readonly ReturnCase[]>([]);
  const [orders, setOrders] = useState<readonly OrderSummary[]>([]);
  const [deliveries, setDeliveries] = useState<readonly Delivery[]>([]);
  const [locations, setLocations] = useState<readonly Location[]>([]);
  const [refunds, setRefunds] = useState<readonly Refund[]>([]);
  const [selected, setSelected] = useState<ReturnDetail>();
  const [order, setOrder] = useState<OrderDetail>();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const open = useCallback(async (id: string) => {
    try {
      setSelected((await request<ApiEnvelope<ReturnDetail>>(`/admin/returns/${id}`)).data);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open this case.');
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [caseRows, orderRows, deliveryRows, locationRows, refundRows] = await Promise.all([
        request<ApiEnvelope<readonly ReturnCase[]>>('/admin/returns'),
        request<ApiEnvelope<PaginatedEnvelope<OrderSummary>>>('/admin/orders'),
        request<ApiEnvelope<readonly Delivery[]>>('/admin/deliveries'),
        request<ApiEnvelope<readonly Location[]>>('/admin/warehouse/locations'),
        request<ApiEnvelope<readonly Refund[]>>('/admin/refunds'),
      ]);
      setCases(caseRows.data);
      setOrders(orderRows.data.items);
      setDeliveries(deliveryRows.data);
      setLocations(locationRows.data.filter((item) => item.capabilities.includes('STOCK_HOLDING')));
      setRefunds(refundRows.data);
      const parameters = new URLSearchParams(window.location.search);
      const requested = parameters.get('return');
      const currentId =
        requested ??
        selected?.id ??
        caseRows.data.find((item) => item.case_type === (rto ? 'RTO' : 'CUSTOMER_RETURN'))?.id;
      if (currentId) await open(currentId);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load reverse logistics.');
    } finally {
      setLoading(false);
    }
  }, [open, rto, selected?.id]);

  useEffect(() => {
    void reload();
  }, [rto]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return cases.filter(
      (item) =>
        item.case_type === (rto ? 'RTO' : 'CUSTOMER_RETURN') &&
        (status === 'ALL' || item.case_status === status || item.receipt_status === status) &&
        (!term ||
          `${item.return_number} ${item.order_number} ${item.customer_name ?? ''} ${item.reason_code}`
            .toLocaleLowerCase()
            .includes(term)),
    );
  }, [cases, query, rto, status]);

  const chooseOrder = async (orderId: string) => {
    if (!orderId) return setOrder(undefined);
    try {
      setOrder((await request<ApiEnvelope<OrderDetail>>(`/admin/orders/${orderId}`)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load Order lines.');
    }
  };

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await work();
      setMessage(success);
      setError('');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The command was rejected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Sales / Reverse logistics</p>
          <h1>{rto ? 'Return to origin' : 'Customer returns'}</h1>
          <p>
            {rto
              ? 'Track failed-delivery stock back to a physical receipt. RTO is not a customer Return.'
              : 'Keep commercial return intent, physical receipt, refund, and cost recovery as connected but separate facts.'}
          </p>
        </div>
        <nav aria-label="Reverse logistics">
          <Link href="/returns">Customer returns</Link> · <Link href="/rto">RTO</Link> ·{' '}
          <Link href="/payments">Refunds</Link> · <Link href="/costing">Costing</Link>
        </nav>
      </header>
      <Stats>
        <StatsCard>
          <StatsTitle>Open</StatsTitle>
          <StatsValue>{visible.filter((item) => item.case_status === 'OPEN').length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Awaiting authorization</StatsTitle>
          <StatsValue>{visible.filter((item) => item.authorization_status === 'PENDING').length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Partial receipts</StatsTitle>
          <StatsValue>{visible.filter((item) => item.receipt_status === 'PARTIALLY_RECEIVED').length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Resolved</StatsTitle>
          <StatsValue>{visible.filter((item) => item.case_status === 'RESOLVED').length}</StatsValue>
        </StatsCard>
      </Stats>
      {message ? (
        <p className="success-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="error-panel" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}

      <section className="command-panel return-create-panel">
        <div>
          <p className="eyebrow">New case</p>
          <h2>{rto ? 'Start from a failed Delivery' : 'Start from a delivered Order line'}</h2>
          <p>
            The server validates eligibility, delivered quantity, tenant, and duplicate commands.
          </p>
        </div>
        {rto ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(
                () =>
                  request('/admin/rto', {
                    method: 'POST',
                    body: JSON.stringify({
                      deliveryId: form.get('deliveryId'),
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  }),
                'RTO case created from the failed Delivery.',
              );
            }}
          >
            <label>
              Failed Delivery
              <select name="deliveryId" required defaultValue="">
                <option value="" disabled>
                  Choose a failed Delivery
                </option>
                {deliveries
                  .filter((item) => item.operationalStatus === 'FAILED')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.deliveryNumber} · Order {item.orderNumber}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={busy} type="submit">
              Create RTO case
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(
                () =>
                  request('/admin/returns', {
                    method: 'POST',
                    body: JSON.stringify({
                      orderId: form.get('orderId'),
                      reasonCode: form.get('reasonCode'),
                      reasonText: form.get('reasonText') || undefined,
                      lines: [
                        {
                          orderLineId: form.get('orderLineId'),
                          quantity: String(form.get('quantity')),
                        },
                      ],
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  }),
                'Customer Return request created. Authorize it before receiving stock.',
              );
            }}
          >
            <label>
              Order
              <select
                name="orderId"
                required
                value={order?.id ?? ''}
                onChange={(event) => void chooseOrder(event.target.value)}
              >
                <option value="">Choose an Order</option>
                {orders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.orderNumber} · {item.customerName} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Order line
              <select name="orderLineId" required defaultValue="">
                <option value="" disabled>
                  Choose a delivered line
                </option>
                {order?.lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.sku} · {line.productTitle} · ordered {line.quantity}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input name="quantity" type="number" min="0.0001" step="0.0001" required />
            </label>
            <label>
              Reason
              <select name="reasonCode">
                <option value="CUSTOMER_CHANGED_MIND">Customer changed mind</option>
                <option value="DAMAGED">Damaged</option>
                <option value="WRONG_ITEM">Wrong item</option>
                <option value="SIZE_OR_FIT">Size or fit</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Context
              <textarea name="reasonText" maxLength={1000} />
            </label>
            <button disabled={busy || !order} type="submit">
              Create Return request
            </button>
          </form>
        )}
      </section>

      <section className="review-layout">
        <div className="worklist-panel">
          <div className="worklist-toolbar">
            <label>
              Search
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Return, Order, customer, or reason"
              />
            </label>
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="ALL">All</option>
                <option value="OPEN">Open</option>
                <option value="RESOLVED">Resolved</option>
                <option value="NOT_RECEIVED">Not received</option>
                <option value="PARTIALLY_RECEIVED">Partially received</option>
                <option value="RECEIVED">Received</option>
              </select>
            </label>
          </div>
          {loading ? <p>Loading cases…</p> : null}
          {!loading && visible.length === 0 ? (
            <div className="empty-state">
              <h2>No matching cases</h2>
              <p>Create a case above or clear the filters.</p>
            </div>
          ) : null}
          <div className="review-list">
            {visible.map((item) => (
              <button
                type="button"
                className={selected?.id === item.id ? 'review-row active' : 'review-row'}
                key={item.id}
                onClick={() => void open(item.id)}
              >
                <span>
                  <strong>{item.return_number}</strong>
                  <small>
                    Order {item.order_number} · {item.customer_name ?? 'Guest customer'}
                  </small>
                </span>
                <span>
                  <StatusBadge status={item.case_status} />
                  <small>{item.receipt_status.replaceAll('_', ' ')}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <aside className="detail-panel">
          {selected ? (
            <>
              <div className="detail-panel-header">
                <div>
                  <p className="eyebrow">{selected.case_type.replaceAll('_', ' ')}</p>
                  <h2>{selected.return_number}</h2>
                </div>
                <StatusBadge status={selected.case_status} />
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Order</dt>
                  <dd>
                    <Link href={`/orders?order=${selected.order_id}`}>{selected.order_number}</Link>
                  </dd>
                </div>
                <div>
                  <dt>Customer</dt>
                  <dd>{selected.customer_name ?? 'Guest customer'}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{selected.reason_code.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt>Authorization</dt>
                  <dd>{selected.authorization_status.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt>Receipt</dt>
                  <dd>{selected.receipt_status.replaceAll('_', ' ')}</dd>
                </div>
              </dl>
              {selected.reason_text ? <p>{selected.reason_text}</p> : null}
              <h3>Return lines</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Requested</th>
                      <th>Authorized</th>
                      <th>Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.product_title}</td>
                        <td>{line.sku}</td>
                        <td>{line.requested_quantity}</td>
                        <td>{line.authorized_quantity}</td>
                        <td>{line.received_quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.case_type === 'CUSTOMER_RETURN' &&
              selected.authorization_status === 'PENDING' ? (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    if (window.confirm('Authorize the requested quantities for physical return?'))
                      void run(
                        () =>
                          request(`/admin/returns/${selected.id}/authorize`, {
                            method: 'POST',
                            body: JSON.stringify({
                              expectedVersion: Number(selected.version),
                              idempotencyKey: crypto.randomUUID(),
                            }),
                          }),
                        'Return authorized.',
                      );
                  }}
                >
                  Authorize Return
                </button>
              ) : null}
              {selected.authorization_status !== 'PENDING' &&
              selected.receipt_status !== 'RECEIVED' ? (
                <form
                  className="command-panel"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run(
                      () =>
                        request(`/admin/returns/${selected.id}/receipts`, {
                          method: 'POST',
                          body: JSON.stringify({
                            locationId: form.get('locationId'),
                            idempotencyKey: crypto.randomUUID(),
                            lines: [
                              {
                                returnLineId: form.get('returnLineId'),
                                condition: form.get('condition'),
                                quantity: String(form.get('quantity')),
                              },
                            ],
                          }),
                        }),
                      'Physical return receipt posted; Inventory and Costing were updated atomically.',
                    );
                  }}
                >
                  <h3>Post physical receipt</h3>
                  <label>
                    Warehouse
                    <select name="locationId" required>
                      {locations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Line
                    <select name="returnLineId" required>
                      {selected.lines
                        .filter(
                          (line) =>
                            Number(line.received_quantity) < Number(line.authorized_quantity),
                        )
                        .map((line) => (
                          <option key={line.id} value={line.id}>
                            {line.sku} · remaining{' '}
                            {Number(line.authorized_quantity) - Number(line.received_quantity)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Condition
                    <select name="condition">
                      <option>SELLABLE</option>
                      <option>INSPECTION</option>
                      <option>QUARANTINE</option>
                      <option>DAMAGED</option>
                    </select>
                  </label>
                  <label>
                    Receive now
                    <input name="quantity" type="number" min="0.0001" step="0.0001" required />
                  </label>
                  <button disabled={busy} type="submit">
                    Review and post receipt
                  </button>
                </form>
              ) : null}
              <section>
                <h3>Refund relationship</h3>
                <p>
                  Return approval does not create a Refund. Link only an existing Payments refund
                  for this Order.
                </p>
                <form
                  className="inline-actions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const refundId = String(new FormData(event.currentTarget).get('refundId'));
                    void run(
                      () =>
                        request(`/admin/returns/${selected.id}/refunds`, {
                          method: 'POST',
                          body: JSON.stringify({ refundId }),
                        }),
                      'Existing Refund linked to this Return.',
                    );
                  }}
                >
                  <select name="refundId" required defaultValue="">
                    <option value="" disabled>
                      Choose an existing Refund
                    </option>
                    {refunds.map((refund) => (
                      <option key={refund.id} value={refund.id}>
                        {refund.refundNumber} · {refund.amount} · {refund.status}
                      </option>
                    ))}
                  </select>
                  <button disabled={busy} type="submit">
                    Link Refund
                  </button>
                </form>
                <p>
                  {selected.refunds.length} linked Refund{selected.refunds.length === 1 ? '' : 's'}{' '}
                  · COGS recovery {selected.cogsRecovery?.total_cost ?? '0'}{' '}
                  {selected.cogsRecovery?.currency_code}
                </p>
              </section>
              <section>
                <h3>Receipt history</h3>
                {selected.receipts.length ? (
                  selected.receipts.map((receipt) => (
                    <p key={receipt.id}>
                      {receipt.receipt_number} · {receipt.status} ·{' '}
                      {new Date(receipt.posted_at).toLocaleString()}
                    </p>
                  ))
                ) : (
                  <p className="muted">No physical receipt posted.</p>
                )}
              </section>
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a case</h2>
              <p>Inspect the commercial and physical state together.</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
