'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

type Screen = 'suppliers' | 'purchases' | 'shipments' | 'receiving';

interface Supplier {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
}
interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierName: string;
  currencyCode: string;
  status: string;
  version: number;
  lines: readonly { id: string; sku: string; quantity: string; unitPrice: string }[];
}
interface Shipment {
  id: string;
  shipmentNumber: string;
  receivingLocationName: string;
  status: string;
  receivingStatus: string;
  version: number;
  allocations: readonly {
    id: string;
    sku: string;
    supplierName: string;
    allocatedQuantity: string;
    receivedQuantity: string;
  }[];
}
interface Receipt {
  id: string;
  receiptNumber: string;
  shipmentId: string;
  status: string;
  lines: readonly { condition: string; quantity: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    const error = body.error;
    throw new Error(
      typeof error === 'string' ? error : (error?.message ?? 'The command was rejected.'),
    );
  }
  return body;
}

export function ProcurementConsole({ screen }: { readonly screen: Screen }) {
  const [suppliers, setSuppliers] = useState<readonly Supplier[]>([]);
  const [purchases, setPurchases] = useState<readonly Purchase[]>([]);
  const [shipments, setShipments] = useState<readonly Shipment[]>([]);
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const [message, setMessage] = useState('');

  const reload = async () => {
    try {
      if (screen === 'suppliers')
        setSuppliers((await request<ApiEnvelope<readonly Supplier[]>>('/admin/suppliers')).data);
      if (screen === 'purchases')
        setPurchases((await request<ApiEnvelope<readonly Purchase[]>>('/admin/purchases')).data);
      if (screen === 'shipments')
        setShipments(
          (await request<ApiEnvelope<readonly Shipment[]>>('/admin/inbound-shipments')).data,
        );
      if (screen === 'receiving')
        setReceipts(
          (await request<ApiEnvelope<readonly Receipt[]>>('/admin/inbound-receipts')).data,
        );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load this operation.');
    }
  };
  useEffect(() => {
    void reload();
  }, [screen]);

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request('/admin/suppliers', {
        method: 'POST',
        body: JSON.stringify({ code: form.get('code'), name: form.get('name') }),
      });
      event.currentTarget.reset();
      setMessage('Supplier created.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Supplier could not be created.');
    }
  }

  async function arrive(shipment: Shipment) {
    try {
      await request(`/admin/inbound-shipments/${shipment.id}/arrive`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: shipment.version }),
      });
      setMessage('Shipment arrival recorded. Inventory remains unchanged until receipt posting.');
      await reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Shipment arrival could not be recorded.',
      );
    }
  }

  async function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request('/admin/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: form.get('supplierId'),
          currencyCode: form.get('currencyCode'),
        }),
      });
      event.currentTarget.reset();
      setMessage('Draft Purchase created. Add catalog Variant lines before placing it.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Purchase could not be created.');
    }
  }

  async function createShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request('/admin/inbound-shipments', {
        method: 'POST',
        body: JSON.stringify({
          receivingLocationId: form.get('receivingLocationId'),
          transportMode: form.get('transportMode'),
          allocations: [
            { purchaseLineId: form.get('purchaseLineId'), quantity: form.get('quantity') },
          ],
        }),
      });
      event.currentTarget.reset();
      setMessage('Inbound Shipment planned. Arrival never changes stock.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Shipment could not be planned.');
    }
  }

  async function addPurchaseLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const purchaseId = String(form.get('purchaseId'));
    try {
      await request(`/admin/purchases/${purchaseId}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          variantId: form.get('variantId'),
          quantity: form.get('quantity'),
          unitPrice: form.get('unitPrice'),
        }),
      });
      event.currentTarget.reset();
      setMessage('Purchase line added.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Purchase line could not be added.');
    }
  }

  async function placePurchase(purchase: Purchase) {
    try {
      await request(`/admin/purchases/${purchase.id}/place`, {
        method: 'POST',
        body: JSON.stringify({ version: purchase.version }),
      });
      setMessage('Purchase placed. It can now be allocated to inbound shipments.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Purchase could not be placed.');
    }
  }

  async function postReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request(`/admin/inbound-shipments/${form.get('shipmentId')}/receipts`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          lines: [
            {
              shipmentAllocationId: form.get('shipmentAllocationId'),
              condition: form.get('condition'),
              quantity: form.get('quantity'),
            },
          ],
        }),
      });
      event.currentTarget.reset();
      setMessage('Receipt posted to the immutable inventory ledger.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Receipt could not be posted.');
    }
  }

  return (
    <main>
      <section className="shell">
        <h1>
          {screen === 'suppliers'
            ? 'Suppliers'
            : screen === 'purchases'
              ? 'Purchases'
              : screen === 'shipments'
                ? 'Inbound shipments'
                : 'Inbound receipts'}
        </h1>
        <p>
          {screen === 'receiving'
            ? 'Posted receipts are immutable and create the canonical inventory ledger movement.'
            : 'Procurement, transit, and physical receipt remain distinct operational facts.'}
        </p>
        {message ? <p role="status">{message}</p> : null}
        {screen === 'suppliers' ? (
          <>
            <form onSubmit={(event) => void createSupplier(event)}>
              <label>
                Code <input name="code" required />
              </label>
              <label>
                Supplier name <input name="name" required />
              </label>
              <button type="submit">Create supplier</button>
            </form>
            {suppliers.map((supplier) => (
              <article key={supplier.id}>
                <h2>{supplier.name}</h2>
                <p>
                  {supplier.code} · {supplier.status}
                </p>
                <p>Supplier ID: {supplier.id}</p>
              </article>
            ))}
          </>
        ) : null}
        {screen === 'purchases' ? (
          <>
            <form onSubmit={(event) => void createPurchase(event)}>
              <label>
                Supplier ID <input name="supplierId" required />
              </label>
              <label>
                Currency
                <select defaultValue="CNY" name="currencyCode">
                  <option value="BDT">BDT</option>
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <button type="submit">Create draft purchase</button>
            </form>
            <form onSubmit={(event) => void addPurchaseLine(event)}>
              <label>
                Draft Purchase ID <input name="purchaseId" required />
              </label>
              <label>
                Catalog Variant ID <input name="variantId" required />
              </label>
              <label>
                Quantity{' '}
                <input
                  defaultValue="1"
                  min="0.000001"
                  name="quantity"
                  required
                  step="0.000001"
                  type="number"
                />
              </label>
              <label>
                Unit price{' '}
                <input
                  defaultValue="0"
                  min="0"
                  name="unitPrice"
                  required
                  step="0.0001"
                  type="number"
                />
              </label>
              <button type="submit">Add purchase line</button>
            </form>
            {purchases.map((purchase) => (
              <article key={purchase.id}>
                <h2>{purchase.purchaseNumber}</h2>
                <p>
                  {purchase.supplierName} · {purchase.currencyCode} · {purchase.status}
                </p>
                <p>Purchase ID: {purchase.id}</p>
                {purchase.lines.map((line) => (
                  <p key={line.id}>
                    {line.sku} · {line.quantity} × {line.unitPrice} · Purchase Line ID: {line.id}
                  </p>
                ))}
                {purchase.status === 'DRAFT' ? (
                  <button onClick={() => void placePurchase(purchase)} type="button">
                    Place purchase
                  </button>
                ) : null}
              </article>
            ))}
          </>
        ) : null}
        {screen === 'shipments' ? (
          <>
            <form onSubmit={(event) => void createShipment(event)}>
              <label>
                Receiving Location ID <input name="receivingLocationId" required />
              </label>
              <label>
                Purchase Line ID <input name="purchaseLineId" required />
              </label>
              <label>
                Quantity{' '}
                <input
                  defaultValue="1"
                  min="0.000001"
                  name="quantity"
                  required
                  step="0.000001"
                  type="number"
                />
              </label>
              <label>
                Transport
                <select defaultValue="SEA" name="transportMode">
                  <option value="AIR">Air</option>
                  <option value="SEA">Sea</option>
                  <option value="ROAD">Road</option>
                  <option value="RAIL">Rail</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <button type="submit">Plan inbound shipment</button>
            </form>
            {shipments.map((shipment) => (
              <article key={shipment.id}>
                <h2>{shipment.shipmentNumber}</h2>
                <p>
                  {shipment.receivingLocationName} · {shipment.status} · {shipment.receivingStatus}
                </p>
                <p>Shipment ID: {shipment.id}</p>
                {shipment.allocations.map((allocation) => (
                  <p key={allocation.id}>
                    {allocation.sku} · {allocation.supplierName} · planned{' '}
                    {allocation.allocatedQuantity} · received {allocation.receivedQuantity} ·
                    Allocation ID: {allocation.id}
                  </p>
                ))}
                {shipment.status !== 'ARRIVED' && shipment.status !== 'CANCELLED' ? (
                  <button onClick={() => void arrive(shipment)} type="button">
                    Mark arrived
                  </button>
                ) : null}
              </article>
            ))}
          </>
        ) : null}
        {screen === 'receiving' ? (
          <>
            <form onSubmit={(event) => void postReceipt(event)}>
              <label>
                Arrived Shipment ID <input name="shipmentId" required />
              </label>
              <label>
                Shipment Allocation ID <input name="shipmentAllocationId" required />
              </label>
              <label>
                Condition
                <select defaultValue="SELLABLE" name="condition">
                  <option value="SELLABLE">Sellable</option>
                  <option value="DAMAGED">Damaged</option>
                  <option value="QUARANTINE">Quarantine</option>
                  <option value="INSPECTION">Inspection</option>
                </select>
              </label>
              <label>
                Counted Quantity{' '}
                <input
                  defaultValue="1"
                  min="0.000001"
                  name="quantity"
                  required
                  step="0.000001"
                  type="number"
                />
              </label>
              <button type="submit">Post inbound receipt</button>
            </form>
            {receipts.map((receipt) => (
              <article key={receipt.id}>
                <h2>{receipt.receiptNumber}</h2>
                <p>
                  {receipt.status} · Shipment {receipt.shipmentId}
                </p>
                {receipt.lines.map((line, index) => (
                  <p key={`${receipt.id}-${index}`}>
                    {line.condition} · {line.quantity}
                  </p>
                ))}
              </article>
            ))}
          </>
        ) : null}
      </section>
    </main>
  );
}
