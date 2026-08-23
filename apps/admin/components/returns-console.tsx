'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ApiEnvelope } from '@maevelle/contracts';
type ReturnCase = {
  id: string;
  return_number: string;
  case_type: string;
  case_status: string;
  authorization_status: string;
  receipt_status: string;
  version: string;
  created_at: string;
};
type ReturnDetail = ReturnCase & {
  lines: readonly {
    id: string;
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
async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('Return command was rejected.');
  return response.json() as Promise<T>;
}
export function ReturnsConsole({ rto = false }: { rto?: boolean }) {
  const [cases, setCases] = useState<readonly ReturnCase[]>([]);
  const [selected, setSelected] = useState<ReturnDetail>();
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      setCases((await request<ApiEnvelope<readonly ReturnCase[]>>('/admin/returns')).data);
    } catch {
      setMessage('Unable to load reverse logistics. Sign in with Returns permission.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  const open = async (id: string) => {
    try {
      setSelected((await request<ApiEnvelope<ReturnDetail>>(`/admin/returns/${id}`)).data);
    } catch {
      setMessage('Unable to open this reverse logistics case.');
    }
  };
  return (
    <main>
      <section className="shell">
        <h1>{rto ? 'RTO' : 'Returns'}</h1>
        <p>
          Commercial return intent, physical reverse receipt, refund, and cost recovery remain
          separate facts.
        </p>
        <nav aria-label="Reverse logistics navigation">
          <Link href="/returns">Returns</Link> · <Link href="/rto">RTO</Link> ·{' '}
          <Link href="/orders">Orders</Link> · <Link href="/fulfillments">Fulfillments</Link> ·{' '}
          <Link href="/costing">Costing</Link>
        </nav>
        {message ? <p role="status">{message}</p> : null}
        {rto ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void request('/admin/rto', {
                method: 'POST',
                body: JSON.stringify({
                  deliveryId: form.get('deliveryId'),
                  idempotencyKey: crypto.randomUUID(),
                }),
              })
                .then(reload)
                .catch(() =>
                  setMessage('RTO creation was rejected. Only failed deliveries are eligible.'),
                );
            }}
          >
            <label>
              Failed delivery ID <input name="deliveryId" required />
            </label>
            <button type="submit">Initiate RTO</button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void request('/admin/returns', {
                method: 'POST',
                body: JSON.stringify({
                  orderId: form.get('orderId'),
                  reasonCode: form.get('reasonCode'),
                  lines: [
                    {
                      orderLineId: form.get('orderLineId'),
                      deliveryLineId: form.get('deliveryLineId') || undefined,
                      quantity: form.get('quantity'),
                    },
                  ],
                  idempotencyKey: crypto.randomUUID(),
                }),
              })
                .then(reload)
                .catch(() =>
                  setMessage('Return request was rejected. It must reference delivered quantity.'),
                );
            }}
          >
            <label>
              Order ID <input name="orderId" required />
            </label>
            <label>
              Order line ID <input name="orderLineId" required />
            </label>
            <label>
              Delivery line ID <input name="deliveryLineId" />
            </label>
            <label>
              Quantity <input name="quantity" defaultValue="1" required />
            </label>
            <label>
              Reason{' '}
              <select name="reasonCode" defaultValue="OTHER">
                <option value="WRONG_SIZE">Wrong size</option>
                <option value="DAMAGED_ON_ARRIVAL">Damaged</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <button type="submit">Request return</button>
          </form>
        )}
        {cases
          .filter((x) => (rto ? x.case_type === 'RTO' : x.case_type === 'CUSTOMER_RETURN'))
          .map((item) => (
            <article key={item.id}>
              <h2>{item.return_number}</h2>
              <p>
                {item.case_status} · authorization {item.authorization_status} · receipt{' '}
                {item.receipt_status}
              </p>
              {!rto && item.authorization_status === 'PENDING' ? (
                <button
                  type="button"
                  onClick={() =>
                    void request(`/admin/returns/${item.id}/authorize`, {
                      method: 'POST',
                      body: JSON.stringify({
                        expectedVersion: Number(item.version),
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    })
                      .then(reload)
                      .catch(() =>
                        setMessage('Authorization was rejected. Reload before retrying.'),
                      )
                  }
                >
                  Authorize return
                </button>
              ) : null}
              <button type="button" onClick={() => void open(item.id)}>
                Open operational detail
              </button>
            </article>
          ))}
        {selected ? (
          <section aria-label="Reverse receipt detail">
            <h2>{selected.return_number}</h2>
            <p>
              {selected.case_status} · {selected.authorization_status} · {selected.receipt_status}
            </p>
            <h3>Physical lines</h3>
            {selected.lines.map((line) => (
              <p key={line.id}>
                {line.product_title} / {line.sku}: requested {line.requested_quantity}, authorized{' '}
                {line.authorized_quantity}, received {line.received_quantity}
              </p>
            ))}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void request(`/admin/returns/${selected.id}/receipts`, {
                  method: 'POST',
                  body: JSON.stringify({
                    locationId: form.get('locationId'),
                    idempotencyKey: crypto.randomUUID(),
                    lines: [
                      {
                        returnLineId: form.get('returnLineId'),
                        condition: form.get('condition'),
                        quantity: form.get('quantity'),
                      },
                    ],
                  }),
                })
                  .then(async () => {
                    await reload();
                    await open(selected.id);
                    setMessage(
                      'Reverse receipt posted. Inventory and cost recovery were recorded together.',
                    );
                  })
                  .catch(() =>
                    setMessage(
                      'Reverse receipt was rejected. Confirm authorization, location capability, quantity, and provenance.',
                    ),
                  );
              }}
            >
              <h3>Post reverse receipt</h3>
              <label>
                Return line
                <select name="returnLineId" defaultValue={selected.lines[0]?.id} required>
                  {selected.lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.sku} (remaining{' '}
                      {Number(line.authorized_quantity) - Number(line.received_quantity)})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Return-receiving location ID <input name="locationId" required />
              </label>
              <label>
                Condition
                <select name="condition" defaultValue="INSPECTION">
                  <option value="SELLABLE">Sellable</option>
                  <option value="INSPECTION">Inspection</option>
                  <option value="DAMAGED">Damaged</option>
                  <option value="QUARANTINE">Quarantine</option>
                </select>
              </label>
              <label>
                Received quantity <input name="quantity" defaultValue="1" required />
              </label>
              <button type="submit">Post immutable reverse receipt</button>
            </form>
            <h3>Receipt and refund links</h3>
            {selected.receipts.map((receipt) => (
              <p key={receipt.id}>
                {receipt.receipt_number} · {receipt.status}
              </p>
            ))}
            {selected.refunds.map((refund) => (
              <p key={refund.id}>Linked refund {refund.refund_id}</p>
            ))}
            <p>
              COGS recovery: {selected.cogsRecovery?.total_cost ?? '0'}{' '}
              {selected.cogsRecovery?.currency_code}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void request(`/admin/returns/${selected.id}/refunds`, {
                  method: 'POST',
                  body: JSON.stringify({ refundId: form.get('refundId') }),
                })
                  .then(async () => {
                    await open(selected.id);
                    setMessage(
                      'Existing payment refund linked to this commercial return resolution.',
                    );
                  })
                  .catch(() =>
                    setMessage(
                      'Refund link was rejected. Refunds remain owned by Payments and must match this Order.',
                    ),
                  );
              }}
            >
              <label>
                Existing payment refund ID <input name="refundId" required />
              </label>
              <button type="submit">Link existing refund</button>
            </form>
          </section>
        ) : null}
        {cases.length === 0 ? <p>No {rto ? 'RTO cases' : 'customer returns'} yet.</p> : null}
      </section>
    </main>
  );
}
