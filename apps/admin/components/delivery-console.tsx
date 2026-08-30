'use client';

import { ArrowRight, MapPin, PackageCheck, Route, Truck } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from './operational-worklist';
import { StatusBadge } from './status-badge';

interface Delivery {
  id: string;
  version: number;
  deliveryNumber: string;
  orderNumber: string;
  fulfillmentNumber: string;
  operationalStatus:
    'READY' | 'BOOKED' | 'HANDED_OVER' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  outcomeStatus: string;
  recipient: { name: string; phone: string; address: string };
  manualCarrierName?: string;
  trackingReference?: string;
  events: readonly { type: string; occurredAt: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? 'The delivery command was rejected.'),
    );
  }
  return response.json() as Promise<T>;
}

const searchText = (item: Delivery) =>
  [
    item.deliveryNumber,
    item.orderNumber,
    item.fulfillmentNumber,
    item.recipient.name,
    item.recipient.phone,
    item.manualCarrierName,
    item.trackingReference,
  ].join(' ');
const statusOf = (item: Delivery) => item.operationalStatus;
const referenceOf = (item: Delivery) => item.deliveryNumber;
const timestampOf = (item: Delivery) => item.events.at(-1)?.occurredAt;

export function DeliveryConsole() {
  const [deliveries, setDeliveries] = useState<readonly Delivery[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = (await request<ApiEnvelope<readonly Delivery[]>>('/admin/deliveries')).data;
      setDeliveries(result);
      setSelectedId((current) =>
        current && result.some((item) => item.id === current) ? current : result[0]?.id,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load deliveries.');
      setMessageTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const worklist = useOperationalWorklist({
    items: deliveries,
    storageKey: 'admin:deliveries',
    getSearchText: searchText,
    getStatus: statusOf,
    getReference: referenceOf,
    getTimestamp: timestampOf,
  });
  const selected = useMemo(
    () => deliveries.find((item) => item.id === selectedId),
    [deliveries, selectedId],
  );

  async function simple(delivery: Delivery, action: 'dispatch' | 'delivered' | 'failed') {
    const confirmation =
      action === 'delivered'
        ? 'Confirm successful delivery? This recognizes COGS and records an immutable delivery outcome.'
        : action === 'failed'
          ? 'Mark this delivery as failed? Use RTO to process the physical return afterward.'
          : 'Confirm handover to the carrier?';
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    try {
      const body =
        action === 'failed'
          ? { version: delivery.version, reasonCode: 'MANUAL_DELIVERY_FAILURE' }
          : { version: delivery.version };
      await request(`/admin/deliveries/${delivery.id}/${action}`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      setMessage(`Delivery ${action} command completed.`);
      setMessageTone('success');
      await reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The delivery state could not be updated.',
      );
      setMessageTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function book(delivery: Delivery, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await request(`/admin/deliveries/${delivery.id}/manual-booking`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          version: delivery.version,
          carrierName: form.get('carrierName'),
          trackingReference: form.get('trackingReference'),
        }),
      });
      event.currentTarget.reset();
      setMessage('Manual carrier booking recorded.');
      setMessageTone('success');
      await reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Manual courier booking could not be recorded.',
      );
      setMessageTone('danger');
    } finally {
      setBusy(false);
    }
  }

  const inTransit = deliveries.filter((item) => item.operationalStatus === 'IN_TRANSIT').length;
  const needsBooking = deliveries.filter((item) => item.operationalStatus === 'READY').length;
  const exceptions = deliveries.filter((item) => item.operationalStatus === 'FAILED').length;

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Operations / Last mile"
          title="Delivery worklist"
          description="Book carriers, record handover, resolve exceptions, and preserve delivery outcomes independently from payment and inventory history."
          actions={
            <Link className="button secondary" href="/rto">
              Open RTO <ArrowRight aria-hidden="true" />
            </Link>
          }
        />
        <Stats aria-label="Delivery summary">
          <StatsCard>
            <StatsTitle>All deliveries</StatsTitle>
            <StatsValue>{deliveries.length}</StatsValue>
            <StatsDescription>Current tenant</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Needs booking</StatsTitle>
            <StatsValue>{needsBooking}</StatsValue>
            <StatsDescription>Ready for carrier assignment</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>In transit</StatsTitle>
            <StatsValue>{inTransit}</StatsValue>
            <StatsDescription>Awaiting a terminal outcome</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Exceptions</StatsTitle>
            <StatsValue>{exceptions}</StatsValue>
            <StatsDescription>Failed deliveries requiring RTO review</StatsDescription>
          </StatsCard>
        </Stats>
        {message ? <OperationalFeedback tone={messageTone}>{message}</OperationalFeedback> : null}
        <OperationalWorklistToolbar
          query={worklist.query}
          onQueryChange={worklist.setQuery}
          status={worklist.status}
          onStatusChange={worklist.setStatus}
          statuses={[
            'READY',
            'BOOKED',
            'HANDED_OVER',
            'IN_TRANSIT',
            'DELIVERED',
            'FAILED',
            'CANCELLED',
          ]}
          sort={worklist.sort}
          onSortChange={worklist.setSort}
          density={worklist.density}
          onDensityChange={worklist.setDensity}
          resultCount={worklist.visibleItems.length}
          savedViews={worklist.savedViews}
          onSaveView={worklist.saveView}
          onApplyView={worklist.applyView}
          searchLabel="Search delivery, order, recipient, carrier, or tracking"
        />
        <div className={`operational-workspace ${selected ? 'detail-open' : ''}`}>
          <section className={`panel worklist-panel density-${worklist.density}`}>
            {loading ? (
              <div className="skeleton-list" aria-label="Loading deliveries">
                <span />
                <span />
                <span />
              </div>
            ) : worklist.visibleItems.length ? (
              <div className="data-table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Delivery</th>
                      <th>Order</th>
                      <th>Recipient</th>
                      <th>Carrier</th>
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
                          <strong>{item.deliveryNumber}</strong>
                          <span className="cell-secondary">{item.fulfillmentNumber}</span>
                        </td>
                        <td>{item.orderNumber}</td>
                        <td>
                          {item.recipient.name}
                          <span className="cell-secondary">{item.recipient.phone}</span>
                        </td>
                        <td>
                          {item.manualCarrierName ?? 'Unassigned'}
                          <span className="cell-secondary">{item.trackingReference ?? '—'}</span>
                        </td>
                        <td>
                          <StatusBadge status={item.operationalStatus} />
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
                title="No matching deliveries"
                description="Clear filters or create a delivery after physical fulfillment dispatch."
                action={
                  <Link className="button secondary" href="/fulfillments">
                    Open fulfillments
                  </Link>
                }
              />
            )}
          </section>
          {selected ? (
            <aside className="operational-detail" aria-label={`${selected.deliveryNumber} detail`}>
              <header className="detail-header">
                <div>
                  <p className="eyebrow">Delivery</p>
                  <h2>{selected.deliveryNumber}</h2>
                  <div className="inline-status">
                    <StatusBadge status={selected.operationalStatus} />
                    <StatusBadge status={selected.outcomeStatus} />
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
              <div className="detail-body">
                <dl className="detail-facts">
                  <div>
                    <dt>Order</dt>
                    <dd>{selected.orderNumber}</dd>
                  </div>
                  <div>
                    <dt>Fulfillment</dt>
                    <dd>{selected.fulfillmentNumber}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{selected.version}</dd>
                  </div>
                </dl>
                <section className="operational-guidance">
                  <MapPin aria-hidden="true" />
                  <div>
                    <strong>{selected.recipient.name}</strong>
                    <p>
                      {selected.recipient.phone}
                      <br />
                      {selected.recipient.address}
                    </p>
                  </div>
                </section>
                {selected.operationalStatus === 'READY' ? (
                  <form
                    className="panel inset-form"
                    onSubmit={(event) => void book(selected, event)}
                  >
                    <h3>Record manual carrier booking</h3>
                    <label>
                      Carrier name
                      <input name="carrierName" autoComplete="organization" required />
                    </label>
                    <label>
                      Tracking/reference
                      <input name="trackingReference" autoComplete="off" required />
                    </label>
                    <button disabled={busy} type="submit">
                      <Truck aria-hidden="true" /> Record booking
                    </button>
                  </form>
                ) : null}
                {selected.operationalStatus === 'BOOKED' ? (
                  <section className="next-action-card">
                    <div>
                      <strong>Handover is next</strong>
                      <p>Confirm the parcel has physically left Maevelle custody.</p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => void simple(selected, 'dispatch')}
                      type="button"
                    >
                      Record handover
                    </button>
                  </section>
                ) : null}
                {selected.operationalStatus === 'IN_TRANSIT' ? (
                  <section className="next-action-card">
                    <div>
                      <strong>Record carrier outcome</strong>
                      <p>Successful delivery recognizes COGS; failure remains separate for RTO.</p>
                    </div>
                    <div className="detail-actions">
                      <button
                        disabled={busy}
                        onClick={() => void simple(selected, 'delivered')}
                        type="button"
                      >
                        <PackageCheck aria-hidden="true" /> Delivered
                      </button>
                      <button
                        className="danger-action"
                        disabled={busy}
                        onClick={() => void simple(selected, 'failed')}
                        type="button"
                      >
                        Failed
                      </button>
                    </div>
                  </section>
                ) : null}
                <section>
                  <h3>Operational timeline</h3>
                  <ol className="timeline-list">
                    {selected.events.map((entry, index) => (
                      <li key={`${entry.type}-${entry.occurredAt}-${index}`}>
                        <Route aria-hidden="true" />
                        <div>
                          <strong>{entry.type.replaceAll('_', ' ')}</strong>
                          <time dateTime={entry.occurredAt}>
                            {new Intl.DateTimeFormat('en-BD', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(entry.occurredAt))}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
