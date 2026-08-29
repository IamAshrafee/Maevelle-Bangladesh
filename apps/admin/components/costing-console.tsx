'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

import { CostingEvidence } from '@/components/supply/costing-evidence';
import {
  CostingHelpButton,
  CostingHelpDialog,
  CostingSummary,
  LandedCostHelpDialog,
  LandedCostSummary,
} from '@/components/supply/costing-page-ui';
import { CostComponentDialog, WorksheetDialog } from '@/components/supply/landed-cost-dialogs';
import { Button } from '@/components/ui/button';
import { formatSupplyMoney as money, supplyRequest as request } from '@/lib/supply/api';
import type {
  Assignment,
  Cogs,
  CostingNotice as Notice,
  CostingScreen as Screen,
  Layer,
  Preview,
  Shipment,
  Valuation,
  Worksheet,
} from '@/lib/supply/costing-types';

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
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
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(true);
  const [worksheetDialogOpen, setWorksheetDialogOpen] = useState(false);
  const [componentDialogOpen, setComponentDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
          request<ApiEnvelope<readonly Shipment[]>>('/admin/inbound-shipments?pageSize=100'),
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
      setWorksheetDialogOpen(false);
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
      setComponentDialogOpen(false);
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
  return (
    <main >
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
          <div className="flex flex-wrap items-center gap-2">
            <CostingHelpButton onClick={() => setHelpOpen(true)} />
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => void reload()}
              type="button"
            >
              Refresh
            </button>
          </div>
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
          <LandedCostSummary shipments={shipments} worksheets={worksheets} />
        ) : null}
        {!loading && section === 'costing' ? (
          <CostingSummary
            layers={layers}
            assignments={assignments}
            cogs={cogs}
            valuation={valuation}
          />
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
                  <p className="mt-2 text-sm text-muted-foreground">
                    Start a revisioned workspace for the selected shipment. Creation opens in a
                    focused dialog so this page stays easy to scan.
                  </p>
                  <Button
                    className="mt-3"
                    disabled={!shipmentId}
                    onClick={() => setWorksheetDialogOpen(true)}
                    title="Create a landed cost worksheet"
                    type="button"
                  >
                    Create draft worksheet
                  </Button>
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
                    <>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Add freight, duty, handling, or another acquisition cost in a focused form.
                      </p>
                      <Button
                        className="mt-3"
                        onClick={() => setComponentDialogOpen(true)}
                        title="Add a landed cost component"
                        type="button"
                      >
                        Add cost component
                      </Button>
                      <CostComponentDialog
                        open={componentDialogOpen}
                        onOpenChange={setComponentDialogOpen}
                        worksheet={worksheet}
                        shipment={worksheetShipment}
                        onSubmit={(event) => void addComponent(event)}
                      />
                    </>
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
          <CostingEvidence
            layers={layers}
            assignments={assignments}
            cogs={cogs}
            valuation={valuation}
          />
        ) : null}
      </div>
      <WorksheetDialog
        open={worksheetDialogOpen}
        onOpenChange={setWorksheetDialogOpen}
        shipmentId={shipmentId}
        onSubmit={(event) => void createWorksheet(event)}
      />
      {section === 'landed-cost' ? (
        <LandedCostHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      ) : (
        <CostingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      )}
    </main>
  );
}
