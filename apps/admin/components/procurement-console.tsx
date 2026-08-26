'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type {
  ApiEnvelope,
  CatalogVariantChoiceDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

type Screen = 'suppliers' | 'purchases' | 'shipments' | 'receiving';

interface Supplier {
  id: string;
  code: string;
  name: string;
  status: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  version: number;
}
interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierName: string;
  currencyCode: string;
  status: string;
  version: number;
  lines: readonly {
    id: string;
    sku: string;
    productTitle: string;
    quantity: string;
    unitPrice: string;
  }[];
}
interface Shipment {
  id: string;
  shipmentNumber: string;
  receivingLocationName: string;
  transportMode: string;
  status: string;
  receivingStatus: string;
  version: number;
  allocations: readonly {
    id: string;
    purchaseNumber: string;
    sku: string;
    productTitle: string;
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

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  }).format(Number(amount));
}

export function ProcurementConsole({ screen }: { readonly screen: Screen }) {
  const [suppliers, setSuppliers] = useState<readonly Supplier[]>([]);
  const [purchases, setPurchases] = useState<readonly Purchase[]>([]);
  const [shipments, setShipments] = useState<readonly Shipment[]>([]);
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const [variants, setVariants] = useState<readonly CatalogVariantChoiceDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setMessage('');
    try {
      const tasks: Promise<void>[] = [];
      if (screen === 'suppliers' || screen === 'purchases')
        tasks.push(
          request<ApiEnvelope<readonly Supplier[]>>('/admin/suppliers').then((value) =>
            setSuppliers(value.data),
          ),
        );
      if (screen === 'suppliers' || screen === 'purchases' || screen === 'shipments')
        tasks.push(
          request<ApiEnvelope<readonly Purchase[]>>('/admin/purchases').then((value) =>
            setPurchases(value.data),
          ),
        );
      if (screen === 'purchases')
        tasks.push(
          request<ApiEnvelope<readonly CatalogVariantChoiceDto[]>>('/admin/catalog/variants').then(
            (value) => setVariants(value.data),
          ),
        );
      if (screen === 'shipments' || screen === 'receiving')
        tasks.push(
          request<ApiEnvelope<readonly Shipment[]>>('/admin/inbound-shipments').then((value) =>
            setShipments(value.data),
          ),
        );
      if (screen === 'shipments')
        tasks.push(
          request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations').then(
            (value) => setLocations(value.data),
          ),
        );
      if (screen === 'receiving')
        tasks.push(
          request<ApiEnvelope<readonly Receipt[]>>('/admin/inbound-receipts').then((value) =>
            setReceipts(value.data),
          ),
        );
      await Promise.all(tasks);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load this operation.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, [screen]);

  const draftPurchases = purchases.filter((purchase) => purchase.status === 'DRAFT');
  const shippableLines = purchases.flatMap((purchase) =>
    purchase.status === 'PLACED'
      ? purchase.lines.map((line) => ({ ...line, purchaseNumber: purchase.purchaseNumber }))
      : [],
  );
  const receivableAllocations = useMemo(
    () =>
      shipments.flatMap((shipment) =>
        shipment.status === 'ARRIVED'
          ? shipment.allocations
              .filter(
                (allocation) =>
                  Number(allocation.allocatedQuantity) > Number(allocation.receivedQuantity),
              )
              .map((allocation) => ({ ...allocation, shipment }))
          : [],
      ),
    [shipments],
  );

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request('/admin/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          code: form.get('code'),
          name: form.get('name'),
          contactName: form.get('contactName') || undefined,
          contactEmail: form.get('contactEmail') || undefined,
          contactPhone: form.get('contactPhone') || undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage('Supplier created.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Supplier could not be created.');
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
      setMessage('Draft purchase created. Add catalog lines, then place it when ready.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Purchase could not be created.');
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
      setMessage('Purchase placed. It can now be allocated to an inbound shipment.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Purchase could not be placed.');
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
      setMessage('Inbound shipment planned. Arrival does not change stock.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Shipment could not be planned.');
    }
  }

  async function arrive(shipment: Shipment) {
    try {
      await request(`/admin/inbound-shipments/${shipment.id}/arrive`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: shipment.version }),
      });
      setMessage('Shipment arrival recorded. Stock changes only after receipt posting.');
      await reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Shipment arrival could not be recorded.',
      );
    }
  }

  async function postReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selection = receivableAllocations.find(
      (allocation) => allocation.id === form.get('shipmentAllocationId'),
    );
    if (!selection) {
      setMessage('Choose an arrived shipment line that still has quantity to receive.');
      return;
    }
    try {
      await request(`/admin/inbound-shipments/${selection.shipment.id}/receipts`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          lines: [
            {
              shipmentAllocationId: selection.id,
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
        <p className="eyebrow">Supply operations</p>
        <h1>
          {screen === 'suppliers'
            ? 'Suppliers'
            : screen === 'purchases'
              ? 'Purchases'
              : screen === 'shipments'
                ? 'Inbound shipments'
                : 'Receiving'}
        </h1>
        <p>
          {screen === 'receiving'
            ? 'Review what was expected and received before posting an immutable stock receipt.'
            : 'Procurement, transit, and physical receipt remain separate operational facts.'}
        </p>
        {message ? <p role="status">{message}</p> : null}
        {loading ? <p aria-live="polite">Loading authoritative supply records…</p> : null}

        {screen === 'suppliers' && !loading ? (
          <>
            <form onSubmit={(event) => void createSupplier(event)}>
              <h2>Create supplier</h2>
              <label>
                Supplier code <input name="code" required placeholder="SHENZHEN-TEXTILES" />
              </label>
              <label>
                Supplier name <input name="name" required autoComplete="organization" />
              </label>
              <label>
                Contact name <input name="contactName" autoComplete="name" />
              </label>
              <label>
                Contact email <input name="contactEmail" type="email" autoComplete="email" />
              </label>
              <label>
                Contact phone <input name="contactPhone" type="tel" autoComplete="tel" />
              </label>
              <button type="submit">Create supplier</button>
            </form>
            {suppliers.length === 0 ? <p>No suppliers yet.</p> : null}
            {suppliers.map((supplier) => {
              const related = purchases.filter(
                (purchase) => purchase.supplierName === supplier.name,
              );
              return (
                <article key={supplier.id}>
                  <p className="eyebrow">{supplier.code}</p>
                  <h2>{supplier.name}</h2>
                  <p>{supplier.status}</p>
                  {supplier.contactName || supplier.contactEmail || supplier.contactPhone ? (
                    <p>
                      {[supplier.contactName, supplier.contactEmail, supplier.contactPhone]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                  <p>
                    {related.length} purchase{related.length === 1 ? '' : 's'} ·{' '}
                    {related
                      .slice(0, 3)
                      .map((purchase) => purchase.purchaseNumber)
                      .join(', ') || 'No recent purchasing activity'}
                  </p>
                </article>
              );
            })}
          </>
        ) : null}

        {screen === 'purchases' && !loading ? (
          <>
            <form onSubmit={(event) => void createPurchase(event)}>
              <h2>Create draft purchase</h2>
              <label>
                Supplier
                <select name="supplierId" required defaultValue="">
                  <option value="" disabled>
                    Choose an active supplier
                  </option>
                  {suppliers
                    .filter((supplier) => supplier.status === 'ACTIVE')
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} · {supplier.code}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Currency
                <select defaultValue="CNY" name="currencyCode">
                  <option value="BDT">BDT — Bangladeshi taka</option>
                  <option value="CNY">CNY — Chinese yuan</option>
                  <option value="USD">USD — US dollar</option>
                </select>
              </label>
              <button disabled={suppliers.length === 0} type="submit">
                Create draft purchase
              </button>
            </form>
            <form onSubmit={(event) => void addPurchaseLine(event)}>
              <h2>Add a purchase line</h2>
              <label>
                Draft purchase
                <select name="purchaseId" required defaultValue="">
                  <option value="" disabled>
                    Choose a draft purchase
                  </option>
                  {draftPurchases.map((purchase) => (
                    <option key={purchase.id} value={purchase.id}>
                      {purchase.purchaseNumber} · {purchase.supplierName} · {purchase.currencyCode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Product variant
                <select name="variantId" required defaultValue="">
                  <option value="" disabled>
                    Choose a product and SKU
                  </option>
                  {variants
                    .filter((variant) => variant.status === 'ACTIVE')
                    .map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.productTitle} · {variant.sku}
                        {variant.optionSummary ? ` · ${variant.optionSummary}` : ''}
                      </option>
                    ))}
                </select>
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
                Unit cost{' '}
                <input
                  defaultValue="0"
                  min="0"
                  name="unitPrice"
                  required
                  step="0.0001"
                  type="number"
                  inputMode="decimal"
                />
              </label>
              <button disabled={draftPurchases.length === 0 || variants.length === 0} type="submit">
                Add purchase line
              </button>
            </form>
            {purchases.length === 0 ? <p>No purchases yet.</p> : null}
            {purchases.map((purchase) => (
              <article key={purchase.id}>
                <p className="eyebrow">{purchase.status}</p>
                <h2>{purchase.purchaseNumber}</h2>
                <p>
                  {purchase.supplierName} · {purchase.currencyCode}
                </p>
                {purchase.lines.length === 0 ? <p>No lines have been added.</p> : null}
                {purchase.lines.map((line) => (
                  <p key={line.id}>
                    {line.productTitle} · {line.sku} · {line.quantity} ×{' '}
                    {formatMoney(line.unitPrice, purchase.currencyCode)}
                  </p>
                ))}
                {purchase.status === 'DRAFT' ? (
                  <button
                    disabled={purchase.lines.length === 0}
                    onClick={() => void placePurchase(purchase)}
                    type="button"
                  >
                    Place purchase
                  </button>
                ) : null}
              </article>
            ))}
          </>
        ) : null}

        {screen === 'shipments' && !loading ? (
          <>
            <form onSubmit={(event) => void createShipment(event)}>
              <h2>Plan an inbound shipment</h2>
              <label>
                Receiving location
                <select name="receivingLocationId" required defaultValue="">
                  <option value="" disabled>
                    Choose a receiving warehouse
                  </option>
                  {locations
                    .filter(
                      (location) =>
                        location.status === 'ACTIVE' &&
                        location.capabilities.includes('PURCHASE_RECEIVING'),
                    )
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} · {location.code}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Purchase line
                <select name="purchaseLineId" required defaultValue="">
                  <option value="" disabled>
                    Choose a placed purchase line
                  </option>
                  {shippableLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.purchaseNumber} · {line.productTitle} · {line.sku} · ordered{' '}
                      {line.quantity}
                    </option>
                  ))}
                </select>
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
              <button
                disabled={shippableLines.length === 0 || locations.length === 0}
                type="submit"
              >
                Plan inbound shipment
              </button>
            </form>
            {shipments.length === 0 ? <p>No inbound shipments yet.</p> : null}
            {shipments.map((shipment) => (
              <article key={shipment.id}>
                <p className="eyebrow">
                  {shipment.status} · {shipment.receivingStatus}
                </p>
                <h2>{shipment.shipmentNumber}</h2>
                <p>
                  {shipment.receivingLocationName} · {shipment.transportMode}
                </p>
                {shipment.allocations.map((allocation) => (
                  <p key={allocation.id}>
                    {allocation.purchaseNumber} · {allocation.productTitle} · {allocation.sku} ·{' '}
                    {allocation.supplierName} · planned {allocation.allocatedQuantity} · received{' '}
                    {allocation.receivedQuantity}
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

        {screen === 'receiving' && !loading ? (
          <>
            <form onSubmit={(event) => void postReceipt(event)}>
              <h2>Post a receipt</h2>
              <label>
                Arrived shipment line
                <select name="shipmentAllocationId" required defaultValue="">
                  <option value="" disabled>
                    Choose a line with quantity remaining
                  </option>
                  {receivableAllocations.map((allocation) => (
                    <option key={allocation.id} value={allocation.id}>
                      {allocation.shipment.shipmentNumber} · {allocation.productTitle} ·{' '}
                      {allocation.sku} · expected {allocation.allocatedQuantity} · received{' '}
                      {allocation.receivedQuantity}
                    </option>
                  ))}
                </select>
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
                Receive now{' '}
                <input
                  defaultValue="1"
                  min="0.000001"
                  name="quantity"
                  required
                  step="0.000001"
                  type="number"
                />
              </label>
              <button disabled={receivableAllocations.length === 0} type="submit">
                Review and post receipt
              </button>
              <p>
                Posting creates an immutable physical inventory movement. Verify the count and
                condition first.
              </p>
            </form>
            {receipts.length === 0 ? <p>No receipts have been posted.</p> : null}
            {receipts.map((receipt) => {
              const shipment = shipments.find((item) => item.id === receipt.shipmentId);
              return (
                <article key={receipt.id}>
                  <p className="eyebrow">{receipt.status}</p>
                  <h2>{receipt.receiptNumber}</h2>
                  <p>
                    {shipment?.shipmentNumber ?? 'Inbound shipment'} ·{' '}
                    {shipment?.receivingLocationName ?? 'Receiving location'}
                  </p>
                  {receipt.lines.map((line, index) => (
                    <p key={`${receipt.id}-${index}`}>
                      {line.condition} · {line.quantity}
                    </p>
                  ))}
                </article>
              );
            })}
          </>
        ) : null}
      </section>
    </main>
  );
}
