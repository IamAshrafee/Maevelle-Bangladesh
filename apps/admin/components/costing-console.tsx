'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

type Screen = 'landed-cost' | 'costing';
type Notice = { tone: 'error' | 'success'; message: string } | undefined;
interface Shipment {
  id: string;
  shipmentNumber: string;
  receivingLocationName: string;
  status: string;
  allocations: readonly {
    id: string;
    purchaseNumber: string;
    supplierName: string;
    sku: string;
    productTitle: string;
    allocatedQuantity: string;
    receivedQuantity: string;
  }[];
}
interface Worksheet {
  id: string;
  shipment_id: string;
  worksheet_number: string;
  base_currency_code: string;
  status: string;
  current_revision_id: string | null;
  finalized_at: string | null;
  revisions: readonly {
    id: string;
    revision_number: string;
    revision_kind: string;
    status: string;
    created_at: string;
    finalized_at: string | null;
    total_effect: string;
  }[];
  components: readonly {
    id: string;
    cost_type: string;
    original_amount: string;
    original_currency_code: string;
    value_status: string;
    allocation_method: string;
    fx_rate: string | null;
    fx_rate_recorded_at: string | null;
    fx_source: string | null;
    reference: string | null;
  }[];
  results: readonly {
    allocation_target_id: string;
    purchase_cost: string;
    additional_cost: string;
    total_acquisition_cost: string;
    unit_acquisition_cost: string;
    currency_code: string;
    sku: string;
    product_title: string;
    quantity: string;
  }[];
}
interface Layer {
  id: string;
  remaining_quantity: string;
  original_quantity: string;
  effective_cost: string;
  currency_code: string;
  location_name: string;
  condition_code: string;
  product_title: string;
  sku: string;
  receipt_number: string;
  received_at: string;
  cost_state: string;
}
interface Assignment {
  id: string;
  fulfillment_id: string;
  status: string;
  total_cost: string;
  currency_code: string;
  quantity: string;
  order_number: string;
  product_title: string;
  sku: string;
  created_at: string;
}
interface Cogs {
  id: string;
  delivery_id: string | null;
  fulfillment_id: string;
  order_number: string;
  total_cost: string;
  currency_code: string;
  created_at: string;
}
interface Valuation {
  inventory_item_id: string;
  location_id: string;
  product_title: string;
  sku: string;
  location_name: string;
  condition_code: string;
  currency_code: string;
  quantity: string;
  value: string;
}
interface Preview {
  components: readonly {
    id: string;
    allocations: readonly { shipmentAllocationId: string; amount: string }[];
  }[];
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
  if (!response.ok)
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? 'The command was rejected.'),
    );
  return body;
}
const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const money = (amount: string, currency: string) => `${currency} ${amount}`;
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';

export function CostingConsole({ section }: { readonly section: Screen }) {
  const [shipments, setShipments] = useState<readonly Shipment[]>([]);
  const [worksheets, setWorksheets] = useState<readonly Worksheet[]>([]);
  const [layers, setLayers] = useState<readonly Layer[]>([]);
  const [assignments, setAssignments] = useState<readonly Assignment[]>([]);
  const [cogs, setCogs] = useState<readonly Cogs[]>([]);
  const [valuation, setValuation] = useState<readonly Valuation[]>([]);
  const [shipmentId, setShipmentId] = useState('');
  const [worksheetId, setWorksheetId] = useState('');
  const [preview, setPreview] = useState<Preview>();
  const [tab, setTab] = useState<'layers' | 'positions' | 'outbound' | 'cogs' | 'valuation'>(
    'layers',
  );
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(true);
  const worksheet = useMemo(
    () => worksheets.find((item) => item.id === worksheetId),
    [worksheetId, worksheets],
  );
  const shipment = useMemo(
    () => shipments.find((item) => item.id === shipmentId),
    [shipmentId, shipments],
  );
  const worksheetShipment = useMemo(
    () => shipments.find((item) => item.id === worksheet?.shipment_id),
    [shipments, worksheet?.shipment_id],
  );
  const revisionId = worksheet?.current_revision_id ?? '';
  const mutable = worksheet?.status === 'DRAFT';

  async function reload() {
    setLoading(true);
    try {
      if (section === 'landed-cost') {
        const [shipmentResult, worksheetResult] = await Promise.all([
          request<ApiEnvelope<readonly Shipment[]>>('/admin/inbound-shipments'),
          request<ApiEnvelope<readonly Worksheet[]>>('/admin/landed-cost/worksheets'),
        ]);
        setShipments(shipmentResult.data);
        setWorksheets(worksheetResult.data);
        setShipmentId((current) => current || shipmentResult.data[0]?.id || '');
        setWorksheetId((current) => current || worksheetResult.data[0]?.id || '');
      } else {
        const [layerResult, assignmentResult, cogsResult, valuationResult] = await Promise.all([
          request<ApiEnvelope<readonly Layer[]>>('/admin/cost-layers'),
          request<ApiEnvelope<readonly Assignment[]>>('/admin/costing/outbound-assignments'),
          request<ApiEnvelope<readonly Cogs[]>>('/admin/costing/cogs'),
          request<ApiEnvelope<readonly Valuation[]>>('/admin/costing/valuation'),
        ]);
        setLayers(layerResult.data);
        setAssignments(assignmentResult.data);
        setCogs(cogsResult.data);
        setValuation(valuationResult.data);
      }
    } catch (error) {
      setNotice({ tone: 'error', message: message(error, 'Unable to load costing operations.') });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, [section]);

  async function createWorksheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<ApiEnvelope<{ id: string }>>('/admin/landed-cost/worksheets', {
        method: 'POST',
        body: JSON.stringify({
          shipmentId: form.get('shipmentId'),
          baseCurrencyCode: form.get('baseCurrencyCode'),
          notes: form.get('notes') || undefined,
        }),
      });
      setWorksheetId(result.data.id);
      setPreview(undefined);
      setNotice({
        tone: 'success',
        message: 'Draft worksheet created. Add components, preview, then finalize.',
      });
      await reload();
    } catch (error) {
      setNotice({ tone: 'error', message: message(error, 'Worksheet could not be created.') });
    }
  }
  async function addComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revisionId) return;
    const form = new FormData(event.currentTarget);
    const scope = String(form.get('scope'));
    try {
      await request(`/admin/landed-cost/revisions/${revisionId}/components`, {
        method: 'POST',
        body: JSON.stringify({
          costType: form.get('costType'),
          scope,
          directShipmentAllocationId:
            scope === 'DIRECT' ? form.get('directShipmentAllocationId') || undefined : undefined,
          originalAmount: form.get('amount'),
          originalCurrencyCode: String(form.get('currencyCode')).toUpperCase(),
          fxRate: form.get('fxRate') || undefined,
          fxSource: form.get('fxSource') || undefined,
          valueStatus: form.get('valueStatus'),
          allocationMethod: scope === 'DIRECT' ? 'DIRECT' : form.get('allocationMethod'),
          reference: form.get('reference') || undefined,
          notes: form.get('notes') || undefined,
        }),
      });
      event.currentTarget.reset();
      setPreview(undefined);
      setNotice({
        tone: 'success',
        message: 'Component added. Preview is calculated by the server.',
      });
      await reload();
    } catch (error) {
      setNotice({ tone: 'error', message: message(error, 'Component could not be added.') });
    }
  }
  async function loadPreview() {
    if (!revisionId) return;
    try {
      setPreview(
        (await request<ApiEnvelope<Preview>>(`/admin/landed-cost/revisions/${revisionId}/preview`))
          .data,
      );
      setNotice({ tone: 'success', message: 'Server allocation preview loaded.' });
    } catch (error) {
      setNotice({ tone: 'error', message: message(error, 'Preview could not be calculated.') });
    }
  }
  async function finalize() {
    if (!revisionId) return;
    try {
      await request(`/admin/landed-cost/revisions/${revisionId}/finalize`, { method: 'POST' });
      setPreview(undefined);
      setNotice({
        tone: 'success',
        message: 'Revision finalized. Its costing evidence is now read-only.',
      });
      await reload();
    } catch (error) {
      setNotice({ tone: 'error', message: message(error, 'Finalization was rejected.') });
    }
  }
  async function createRevision(kind: 'ADJUSTMENT' | 'CREDIT') {
    if (!worksheet) return;
    try {
      await request(`/admin/landed-cost/worksheets/${worksheet.id}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ kind }),
      });
      setPreview(undefined);
      setNotice({
        tone: 'success',
        message: `${kind === 'CREDIT' ? 'Credit' : 'Adjustment'} revision created.`,
      });
      await reload();
    } catch (error) {
      setNotice({ tone: 'error', message: message(error, 'Revision could not be created.') });
    }
  }
  const empty =
    tab === 'layers' || tab === 'positions'
      ? !layers.length
      : tab === 'outbound'
        ? !assignments.length
        : tab === 'cogs'
          ? !cogs.length
          : !valuation.length;

  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Maevelle / Operations</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {section === 'landed-cost' ? 'Landed Cost' : 'Costing'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {section === 'landed-cost'
                ? 'Revisioned acquisition costing. Finalized evidence is immutable.'
                : 'Read-only FIFO, outbound-cost, COGS, and valuation facts.'}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link className="rounded-md border px-3 py-2 text-sm" href="/inbound-shipments">
              Inbound shipments
            </Link>
            <Link className="rounded-md border px-3 py-2 text-sm" href="/landed-cost">
              Landed Cost
            </Link>
            <Link className="rounded-md border px-3 py-2 text-sm" href="/costing">
              Costing
            </Link>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => void reload()}
              type="button"
            >
              Refresh
            </button>
          </nav>
        </header>
        {notice ? (
          <p
            className={
              notice.tone === 'error'
                ? 'rounded-md bg-destructive/10 p-3 text-sm text-destructive'
                : 'rounded-md bg-secondary p-3 text-sm'
            }
            role="status"
          >
            {notice.message}
          </p>
        ) : null}
        {loading ? (
          <p className="rounded-md border bg-background p-6 text-sm text-muted-foreground">
            Loading operational costing data…
          </p>
        ) : null}
        {!loading && section === 'landed-cost' ? (
          <>
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="grid gap-4">
                <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <h2 className="font-semibold">1. Select inbound shipment</h2>
                  {shipments.length ? (
                    <select
                      className="mt-3 w-full rounded-md border bg-background p-2"
                      onChange={(event) => setShipmentId(event.target.value)}
                      value={shipmentId}
                    >
                      {shipments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.shipmentNumber} · {item.status} · {item.receivingLocationName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No inbound shipments are available yet.
                    </p>
                  )}
                  {shipment ? (
                    <div className="mt-4 grid gap-2 text-sm">
                      {shipment.allocations.map((item) => (
                        <div className="rounded-md border p-3" key={item.id}>
                          <strong>
                            {item.productTitle} · {item.sku}
                          </strong>
                          <br />
                          {item.purchaseNumber} · {item.supplierName} · received{' '}
                          {item.receivedQuantity} of {item.allocatedQuantity}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
                <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <h2 className="font-semibold">2. Create worksheet</h2>
                  <form
                    className="mt-3 grid gap-3"
                    onSubmit={(event) => void createWorksheet(event)}
                  >
                    <input name="shipmentId" readOnly type="hidden" value={shipmentId} />
                    <label className="grid gap-1 text-sm">
                      Base currency{' '}
                      <input
                        className="rounded-md border p-2"
                        defaultValue="CNY"
                        maxLength={3}
                        name="baseCurrencyCode"
                        required
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Notes <textarea className="rounded-md border p-2" name="notes" />
                    </label>
                    <button
                      className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
                      disabled={!shipmentId}
                      type="submit"
                    >
                      Create draft worksheet
                    </button>
                  </form>
                </section>
              </div>
              <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <h2 className="font-semibold">Worksheet and revision history</h2>
                {worksheets.length ? (
                  <select
                    className="mt-3 w-full rounded-md border bg-background p-2"
                    onChange={(event) => {
                      const next = worksheets.find((item) => item.id === event.target.value);
                      setWorksheetId(event.target.value);
                      setShipmentId(next?.shipment_id ?? '');
                      setPreview(undefined);
                    }}
                    value={worksheetId}
                  >
                    {worksheets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.worksheet_number} · {item.status}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create a worksheet from an inbound shipment to begin.
                  </p>
                )}
                {worksheet ? (
                  <>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {worksheet.base_currency_code} · finalized {date(worksheet.finalized_at)}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {worksheet.revisions.map((item) => (
                        <div className="rounded-md border p-3 text-sm" key={item.id}>
                          <strong>
                            Revision {item.revision_number} · {item.revision_kind}
                          </strong>
                          <br />
                          {item.status} · effect{' '}
                          {money(item.total_effect, worksheet.base_currency_code)} ·{' '}
                          {date(item.finalized_at ?? item.created_at)}
                        </div>
                      ))}
                    </div>
                    {worksheet.status === 'FINALIZED' ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          className="rounded-md border px-3 py-2 text-sm"
                          onClick={() => void createRevision('ADJUSTMENT')}
                          type="button"
                        >
                          Create adjustment
                        </button>
                        <button
                          className="rounded-md border px-3 py-2 text-sm"
                          onClick={() => void createRevision('CREDIT')}
                          type="button"
                        >
                          Create credit
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </section>
            </section>
            {worksheet ? (
              <section className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <h2 className="font-semibold">3. Add cost component</h2>
                  {mutable ? (
                    <form
                      className="mt-3 grid gap-3"
                      onSubmit={(event) => void addComponent(event)}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          Type{' '}
                          <select
                            className="rounded-md border bg-background p-2"
                            defaultValue="INTERNATIONAL_FREIGHT"
                            name="costType"
                          >
                            <option>INTERNATIONAL_FREIGHT</option>
                            <option>LOCAL_FREIGHT</option>
                            <option>CUSTOMS_DUTY</option>
                            <option>TAX_OR_IMPORT_FEE</option>
                            <option>FORWARDER_FEE</option>
                            <option>HANDLING</option>
                            <option>INSURANCE</option>
                            <option>OTHER_ACQUISITION_COST</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          Amount{' '}
                          <input
                            className="rounded-md border p-2"
                            defaultValue="0.0000"
                            name="amount"
                            required
                            step="0.0001"
                            type="number"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Currency{' '}
                          <input
                            className="rounded-md border p-2"
                            defaultValue={worksheet.base_currency_code}
                            maxLength={3}
                            name="currencyCode"
                            required
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          Value status{' '}
                          <select
                            className="rounded-md border bg-background p-2"
                            defaultValue="ACTUAL"
                            name="valueStatus"
                          >
                            <option>ESTIMATED</option>
                            <option>ACTUAL</option>
                            <option>CREDIT</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          Scope{' '}
                          <select
                            className="rounded-md border bg-background p-2"
                            defaultValue="GLOBAL"
                            name="scope"
                          >
                            <option>GLOBAL</option>
                            <option>DIRECT</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          Allocation{' '}
                          <select
                            className="rounded-md border bg-background p-2"
                            defaultValue="QUANTITY"
                            name="allocationMethod"
                          >
                            <option>QUANTITY</option>
                            <option>EQUAL</option>
                            <option>PURCHASE_VALUE</option>
                            <option>WEIGHT</option>
                            <option>VOLUME</option>
                            <option>CHARGEABLE_WEIGHT</option>
                            <option>PERCENTAGE</option>
                            <option>MANUAL</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm">
                          FX rate{' '}
                          <input
                            className="rounded-md border p-2"
                            name="fxRate"
                            step="0.000000000001"
                            type="number"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          FX source <input className="rounded-md border p-2" name="fxSource" />
                        </label>
                      </div>
                      <label className="grid gap-1 text-sm">
                        Direct item (for DIRECT only){' '}
                        <select
                          className="rounded-md border bg-background p-2"
                          name="directShipmentAllocationId"
                        >
                          <option value="">Choose item</option>
                          {worksheetShipment?.allocations.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.productTitle} · {item.sku}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        Reference <input className="rounded-md border p-2" name="reference" />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Notes <textarea className="rounded-md border p-2" name="notes" />
                      </label>
                      <button
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                        type="submit"
                      >
                        Add component
                      </button>
                    </form>
                  ) : (
                    <p className="mt-3 rounded-md bg-muted p-3 text-sm">
                      Finalized facts are read-only. Create an adjustment or credit revision for a
                      new cost fact.
                    </p>
                  )}
                  <div className="mt-5 grid gap-2">
                    {worksheet.components.map((item) => (
                      <div className="rounded-md border p-3 text-sm" key={item.id}>
                        <strong>{item.cost_type}</strong> ·{' '}
                        {money(item.original_amount, item.original_currency_code)} ·{' '}
                        {item.value_status}
                        <br />
                        <span className="text-muted-foreground">
                          {item.allocation_method} ·{' '}
                          {item.fx_rate
                            ? `FX ${item.fx_rate} from ${item.fx_source} recorded ${date(item.fx_rate_recorded_at)}`
                            : 'base currency'}{' '}
                          · {item.reference ?? 'No reference'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <h2 className="font-semibold">4. Preview and finalize</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Allocation, acquisition totals, and unit cost are calculated only by the server.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-md border px-3 py-2 text-sm"
                      onClick={() => void loadPreview()}
                      type="button"
                    >
                      Load allocation preview
                    </button>
                    {mutable ? (
                      <button
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                        onClick={() => void finalize()}
                        type="button"
                      >
                        Finalize immutable revision
                      </button>
                    ) : null}
                  </div>
                  {preview ? (
                    <div className="mt-4 grid gap-2 text-sm">
                      {preview.components.map((item) => (
                        <div className="rounded-md border p-3" key={item.id}>
                          <strong>Component {item.id.slice(0, 8)}</strong>
                          {item.allocations.map((allocation) => (
                            <p key={allocation.shipmentAllocationId}>
                              Shipment item {allocation.shipmentAllocationId.slice(0, 8)}:{' '}
                              {money(allocation.amount, worksheet.base_currency_code)}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {worksheet.results.length ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="p-2">Item</th>
                            <th className="p-2">Qty</th>
                            <th className="p-2">Purchase</th>
                            <th className="p-2">Additional</th>
                            <th className="p-2">Total / unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {worksheet.results.map((item) => (
                            <tr className="border-b" key={item.allocation_target_id}>
                              <td className="p-2">
                                {item.product_title}
                                <br />
                                <span className="text-muted-foreground">{item.sku}</span>
                              </td>
                              <td className="p-2">{item.quantity}</td>
                              <td className="p-2">
                                {money(item.purchase_cost, item.currency_code)}
                              </td>
                              <td className="p-2">
                                {money(item.additional_cost, item.currency_code)}
                              </td>
                              <td className="p-2">
                                {money(item.total_acquisition_cost, item.currency_code)}
                                <br />
                                {money(item.unit_acquisition_cost, item.currency_code)} / unit
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      No finalized acquisition results yet.
                    </p>
                  )}
                </section>
              </section>
            ) : null}
          </>
        ) : null}
        {!loading && section === 'costing' ? (
          <>
            <section className="flex flex-wrap gap-2" aria-label="Costing views">
              {(['layers', 'positions', 'outbound', 'cogs', 'valuation'] as const).map((item) => (
                <button
                  className={
                    tab === item
                      ? 'rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'rounded-md border px-3 py-2 text-sm'
                  }
                  key={item}
                  onClick={() => setTab(item)}
                  type="button"
                >
                  {item === 'positions'
                    ? 'FIFO positions'
                    : item === 'outbound'
                      ? 'Outbound assignments'
                      : item === 'cogs'
                        ? 'COGS'
                        : item === 'valuation'
                          ? 'Inventory valuation'
                          : 'Cost layers'}
                </button>
              ))}
            </section>
            <section className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
              {tab === 'layers' || tab === 'positions' ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3">Receipt</th>
                      <th className="p-3">Condition</th>
                      <th className="p-3">Original</th>
                      <th className="p-3">Remaining</th>
                      <th className="p-3">Effective cost</th>
                      <th className="p-3">FIFO receipt time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layers.map((item) => (
                      <tr className="border-b" key={item.id}>
                        <td className="p-3">
                          {item.product_title}
                          <br />
                          <span className="text-muted-foreground">{item.sku}</span>
                        </td>
                        <td className="p-3">
                          {item.receipt_number}
                          <br />
                          <span className="text-muted-foreground">{item.location_name}</span>
                        </td>
                        <td className="p-3">{item.condition_code}</td>
                        <td className="p-3">{item.original_quantity}</td>
                        <td className="p-3">{item.remaining_quantity}</td>
                        <td className="p-3">
                          {money(item.effective_cost, item.currency_code)}
                          <br />
                          <span className="text-muted-foreground">{item.cost_state}</span>
                        </td>
                        <td className="p-3">{date(item.received_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {tab === 'outbound' ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">Order / Fulfillment</th>
                      <th className="p-3">Product</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Assigned cost</th>
                      <th className="p-3">State</th>
                      <th className="p-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((item) => (
                      <tr className="border-b" key={item.id}>
                        <td className="p-3">
                          {item.order_number}
                          <br />
                          <span className="text-muted-foreground">
                            {item.fulfillment_id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="p-3">
                          {item.product_title}
                          <br />
                          <span className="text-muted-foreground">{item.sku}</span>
                        </td>
                        <td className="p-3">{item.quantity}</td>
                        <td className="p-3">{money(item.total_cost, item.currency_code)}</td>
                        <td className="p-3">{item.status}</td>
                        <td className="p-3">{date(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {tab === 'cogs' ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">Order</th>
                      <th className="p-3">Fulfillment</th>
                      <th className="p-3">Delivery</th>
                      <th className="p-3">Recognized cost</th>
                      <th className="p-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cogs.map((item) => (
                      <tr className="border-b" key={item.id}>
                        <td className="p-3">{item.order_number}</td>
                        <td className="p-3">{item.fulfillment_id.slice(0, 8)}</td>
                        <td className="p-3">{item.delivery_id?.slice(0, 8) ?? '—'}</td>
                        <td className="p-3">{money(item.total_cost, item.currency_code)}</td>
                        <td className="p-3">{date(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {tab === 'valuation' ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Condition</th>
                      <th className="p-3">Costed quantity</th>
                      <th className="p-3">Valuation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valuation.map((item) => (
                      <tr
                        className="border-b"
                        key={`${item.inventory_item_id}-${item.location_id}-${item.condition_code}`}
                      >
                        <td className="p-3">
                          {item.product_title}
                          <br />
                          <span className="text-muted-foreground">{item.sku}</span>
                        </td>
                        <td className="p-3">{item.location_name}</td>
                        <td className="p-3">{item.condition_code}</td>
                        <td className="p-3">{item.quantity}</td>
                        <td className="p-3">{money(item.value, item.currency_code)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {empty ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No authoritative costing facts exist for this view. Physical inventory without a
                  Cost Layer is intentionally not presented as zero-valued inventory.
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
