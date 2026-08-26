'use client';

import { ArrowRight, Boxes, PackageCheck, Truck, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope, WarehouseLocationDto } from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from './operational-worklist';
import { StatusBadge } from './status-badge';

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

const searchText = (item: Fulfillment) =>
  [
    item.fulfillmentNumber,
    item.orderNumber,
    item.locationName,
    ...item.lines.flatMap((line) => [line.sku, line.productTitle]),
  ].join(' ');
const statusOf = (item: Fulfillment) => item.status;
const referenceOf = (item: Fulfillment) => item.fulfillmentNumber;
type FulfillmentAction = 'ready' | 'start-picking' | 'pack' | 'dispatch' | 'cancel';

function nextActionFor(
  status: Fulfillment['status'],
): readonly [string, FulfillmentAction] | undefined {
  if (status === 'DRAFT') return ['Mark ready', 'ready'];
  if (status === 'READY') return ['Start picking', 'start-picking'];
  if (status === 'PICKING') return ['Mark packed', 'pack'];
  if (status === 'PACKED') return ['Dispatch and consume stock', 'dispatch'];
  return undefined;
}

export function FulfillmentConsole() {
  const [fulfillments, setFulfillments] = useState<readonly Fulfillment[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [fulfillmentResult, locationResult] = await Promise.all([
        request<ApiEnvelope<readonly Fulfillment[]>>('/admin/fulfillments'),
        request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations'),
      ]);
      setFulfillments(fulfillmentResult.data);
      setLocations(
        locationResult.data.filter((location) => location.capabilities.includes('STOCK_HOLDING')),
      );
      setSelectedId((current) =>
        current && fulfillmentResult.data.some((item) => item.id === current)
          ? current
          : fulfillmentResult.data[0]?.id,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load fulfillment operations.');
      setMessageTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const worklist = useOperationalWorklist({
    items: fulfillments,
    storageKey: 'admin:fulfillments',
    getSearchText: searchText,
    getStatus: statusOf,
    getReference: referenceOf,
  });
  const selected = useMemo(
    () => fulfillments.find((item) => item.id === selectedId),
    [fulfillments, selectedId],
  );
  const awaitingDispatch = fulfillments.filter((item) => item.status === 'PACKED').length;
  const inProgress = fulfillments.filter((item) =>
    ['READY', 'PICKING', 'PACKED'].includes(item.status),
  ).length;

  async function action(fulfillment: Fulfillment, actionName: FulfillmentAction) {
    if (
      actionName === 'dispatch' &&
      !window.confirm(
        'Dispatch will physically consume reserved inventory and create immutable costing facts. Continue?',
      )
    )
      return;
    if (
      actionName === 'cancel' &&
      !window.confirm('Cancel this fulfillment? Its order reservation is retained.')
    )
      return;
    setBusy(true);
    try {
      await request(`/admin/fulfillments/${fulfillment.id}/${actionName}`, {
        method: 'POST',
        ...(actionName === 'dispatch' || actionName === 'cancel'
          ? { headers: { 'idempotency-key': crypto.randomUUID() } }
          : {}),
        body: JSON.stringify({ version: fulfillment.version }),
      });
      setMessage(`Fulfillment ${actionName.replace('-', ' ')} completed.`);
      setMessageTone('success');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The fulfillment command was rejected.');
      setMessageTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function createDelivery(fulfillment: Fulfillment) {
    setBusy(true);
    try {
      await request(`/admin/fulfillments/${fulfillment.id}/deliveries`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      setMessage('Delivery created. Continue in Operations → Deliveries.');
      setMessageTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delivery could not be created.');
      setMessageTone('danger');
    } finally {
      setBusy(false);
    }
  }

  const nextAction = selected ? nextActionFor(selected.status) : undefined;

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Operations / Fulfillment"
          title="Fulfillment worklist"
          description="Move reserved order lines through pick, pack, and physical dispatch with one authoritative next action."
          actions={
            <Link className="button secondary" href="/deliveries">
              Open deliveries <ArrowRight aria-hidden="true" />
            </Link>
          }
        />
        <section className="metric-strip" aria-label="Fulfillment summary">
          <article>
            <span>All fulfillments</span>
            <strong>{fulfillments.length}</strong>
            <small>Across every lifecycle state</small>
          </article>
          <article>
            <span>In progress</span>
            <strong>{inProgress}</strong>
            <small>Ready, picking, or packed</small>
          </article>
          <article>
            <span>Ready to dispatch</span>
            <strong>{awaitingDispatch}</strong>
            <small>Physical stock not yet consumed</small>
          </article>
          <article>
            <span>Stock-holding locations</span>
            <strong>{locations.length}</strong>
            <small>Eligible fulfillment warehouses</small>
          </article>
        </section>
        {locations.length === 0 && !loading ? (
          <OperationalFeedback tone="warning">
            Create an active stock-holding warehouse before fulfilling orders.
          </OperationalFeedback>
        ) : null}
        {message ? <OperationalFeedback tone={messageTone}>{message}</OperationalFeedback> : null}
        <OperationalWorklistToolbar
          query={worklist.query}
          onQueryChange={worklist.setQuery}
          status={worklist.status}
          onStatusChange={worklist.setStatus}
          statuses={['DRAFT', 'READY', 'PICKING', 'PACKED', 'DISPATCHED', 'CANCELLED']}
          sort={worklist.sort}
          onSortChange={worklist.setSort}
          density={worklist.density}
          onDensityChange={worklist.setDensity}
          resultCount={worklist.visibleItems.length}
          savedViews={worklist.savedViews}
          onSaveView={worklist.saveView}
          onApplyView={worklist.applyView}
          searchLabel="Search fulfillment, order, SKU, or warehouse"
        />
        <div className={`operational-workspace ${selected ? 'detail-open' : ''}`}>
          <section className={`panel worklist-panel density-${worklist.density}`}>
            {loading ? (
              <div className="skeleton-list" aria-label="Loading fulfillments">
                <span />
                <span />
                <span />
              </div>
            ) : worklist.visibleItems.length ? (
              <div className="data-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Fulfillment</th>
                      <th>Order</th>
                      <th>Warehouse</th>
                      <th>Lines</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {worklist.visibleItems.map((item) => (
                      <tr key={item.id} className={item.id === selectedId ? 'selected-row' : ''}>
                        <td>
                          <strong>{item.fulfillmentNumber}</strong>
                        </td>
                        <td>{item.orderNumber}</td>
                        <td>{item.locationName}</td>
                        <td className="numeric">{item.lines.length}</td>
                        <td>
                          <StatusBadge status={item.status} />
                        </td>
                        <td>
                          <button type="button" onClick={() => setSelectedId(item.id)}>
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <OperationalEmptyState
                title="No matching fulfillments"
                description="Clear filters or create a fulfillment from an eligible order."
                action={
                  <Link className="button secondary" href="/orders">
                    Open orders
                  </Link>
                }
              />
            )}
          </section>
          {selected ? (
            <aside
              className="operational-detail"
              aria-label={`${selected.fulfillmentNumber} detail`}
            >
              <header className="detail-header">
                <div>
                  <p className="eyebrow">Fulfillment</p>
                  <h2>{selected.fulfillmentNumber}</h2>
                  <div className="inline-status">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(undefined)}
                  aria-label="Close detail"
                >
                  ×
                </button>
              </header>
              {nextAction ? (
                <section className="next-action-card">
                  <div>
                    <strong>Recommended next action</strong>
                    <p>Continue the canonical fulfillment lifecycle.</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void action(selected, nextAction[1])}
                  >
                    {nextAction[0]}
                  </button>
                </section>
              ) : null}
              <div className="detail-body">
                <dl className="detail-facts">
                  <div>
                    <dt>Order</dt>
                    <dd>{selected.orderNumber}</dd>
                  </div>
                  <div>
                    <dt>Warehouse</dt>
                    <dd>{selected.locationName}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{selected.version}</dd>
                  </div>
                </dl>
                <section>
                  <h3>Physical lines</h3>
                  <div className="data-table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Product / SKU</th>
                          <th>Quantity</th>
                          <th>Consumed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.lines.map((line) => (
                          <tr key={`${line.sku}-${line.productTitle}`}>
                            <td>
                              <strong>{line.productTitle}</strong>
                              <span className="cell-secondary">{line.sku}</span>
                            </td>
                            <td className="numeric">{line.quantity}</td>
                            <td className="numeric">
                              {selected.status === 'DISPATCHED' ? line.consumed : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <div className="detail-actions">
                  {selected.status === 'DISPATCHED' ? (
                    <button
                      disabled={busy}
                      onClick={() => void createDelivery(selected)}
                      type="button"
                    >
                      <Truck aria-hidden="true" /> Create delivery
                    </button>
                  ) : null}
                  {['DRAFT', 'READY', 'PICKING', 'PACKED'].includes(selected.status) ? (
                    <button
                      className="danger-action"
                      disabled={busy}
                      onClick={() => void action(selected, 'cancel')}
                      type="button"
                    >
                      Cancel fulfillment
                    </button>
                  ) : null}
                </div>
                <section className="operational-guidance">
                  <Boxes aria-hidden="true" />
                  <div>
                    <strong>Inventory boundary</strong>
                    <p>Cart and checkout never consume stock. Dispatch is the physical event.</p>
                  </div>
                </section>
                <section className="operational-guidance">
                  <PackageCheck aria-hidden="true" />
                  <div>
                    <strong>Costing boundary</strong>
                    <p>FIFO assignment is committed atomically with dispatch.</p>
                  </div>
                </section>
                <section className="operational-guidance">
                  <Warehouse aria-hidden="true" />
                  <div>
                    <strong>Warehouse</strong>
                    <p>{selected.locationName} owns the physical fulfillment movement.</p>
                  </div>
                </section>
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
