'use client';

import { useState } from 'react';

import { formatSupplyMoney as money } from '@/lib/supply/api';
import type { Assignment, Cogs, CostingTab, Layer, Valuation } from '@/lib/supply/costing-types';

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';

export function CostingEvidence({
  layers,
  assignments,
  cogs,
  valuation,
}: {
  layers: readonly Layer[];
  assignments: readonly Assignment[];
  cogs: readonly Cogs[];
  valuation: readonly Valuation[];
}) {
  const [tab, setTab] = useState<CostingTab>('layers');
  const empty =
    tab === 'layers' || tab === 'positions'
      ? !layers.length
      : tab === 'outbound'
        ? !assignments.length
        : tab === 'cogs'
          ? !cogs.length
          : !valuation.length;

  return (
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
                    <span className="text-muted-foreground">{item.fulfillment_id.slice(0, 8)}</span>
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
            No authoritative costing facts exist for this view. Physical inventory without a Cost
            Layer is intentionally not presented as zero-valued inventory.
          </p>
        ) : null}
      </section>
    </>
  );
}
