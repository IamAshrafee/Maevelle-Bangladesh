'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
  };
  if (!response.ok)
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : (result.error?.message ?? 'The command was rejected.'),
    );
  return result;
}
interface Layer {
  id: string;
  receipt_line_id: string;
  remaining_quantity: string;
  original_quantity: string;
  effective_cost: string;
  currency_code: string;
  condition_code: string;
}
export function CostingConsole({ section }: { readonly section: 'landed-cost' | 'costing' }) {
  const [layers, setLayers] = useState<readonly Layer[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    try {
      setLayers((await request<ApiEnvelope<readonly Layer[]>>('/admin/cost-layers')).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load costing.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  async function worksheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const created = await request<ApiEnvelope<{ revisionId: string }>>(
        '/admin/landed-cost/worksheets',
        {
          method: 'POST',
          body: JSON.stringify({
            shipmentId: form.get('shipmentId'),
            baseCurrencyCode: form.get('baseCurrencyCode'),
          }),
        },
      );
      setMessage(`Worksheet created. Draft revision: ${created.data.revisionId}`);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Worksheet could not be created.');
    }
  }
  async function component(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(`/admin/landed-cost/revisions/${form.get('revisionId')}/components`, {
        method: 'POST',
        body: JSON.stringify({
          costType: form.get('costType'),
          scope: 'GLOBAL',
          originalAmount: form.get('amount'),
          originalCurrencyCode: form.get('currencyCode'),
          valueStatus: form.get('valueStatus'),
          allocationMethod: form.get('method'),
        }),
      });
      setMessage('Cost component added. Preview and finalization remain explicit commands.');
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Component could not be added.');
    }
  }
  return (
    <main>
      <section className="shell">
        <h1>{section === 'landed-cost' ? 'Landed Cost' : 'FIFO Cost Layers'}</h1>
        <p>
          Shipment acquisition costs are revisioned. Physical inventory and cost positions remain
          separate authorities.
        </p>
        {message ? <p role="status">{message}</p> : null}
        {section === 'landed-cost' ? (
          <>
            <form onSubmit={(event) => void worksheet(event)}>
              <label>
                Shipment ID <input name="shipmentId" required />
              </label>
              <label>
                Base currency{' '}
                <input defaultValue="CNY" maxLength={3} name="baseCurrencyCode" required />
              </label>
              <button type="submit">Create worksheet</button>
            </form>
            <form onSubmit={(event) => void component(event)}>
              <label>
                Revision ID <input name="revisionId" required />
              </label>
              <label>
                Cost type <input defaultValue="INTERNATIONAL_FREIGHT" name="costType" required />
              </label>
              <label>
                Amount <input defaultValue="0.0000" name="amount" required />
              </label>
              <label>
                Currency <input defaultValue="CNY" maxLength={3} name="currencyCode" required />
              </label>
              <label>
                Status{' '}
                <select defaultValue="ACTUAL" name="valueStatus">
                  <option>ESTIMATED</option>
                  <option>ACTUAL</option>
                  <option>CREDIT</option>
                </select>
              </label>
              <label>
                Method{' '}
                <select defaultValue="QUANTITY" name="method">
                  <option>QUANTITY</option>
                  <option>EQUAL</option>
                  <option>PURCHASE_VALUE</option>
                </select>
              </label>
              <button type="submit">Add component</button>
            </form>
          </>
        ) : null}
        <h2>Cost layers</h2>
        {layers.map((layer) => (
          <article key={layer.id}>
            <strong>
              {layer.currency_code} {layer.effective_cost}
            </strong>
            <p>
              Remaining {layer.remaining_quantity} of {layer.original_quantity} ·{' '}
              {layer.condition_code}
            </p>
            <p>Receipt line: {layer.receipt_line_id}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
