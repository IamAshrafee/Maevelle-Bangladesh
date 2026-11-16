'use client';

import { useState } from 'react';

import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatSupplyMoney as money,
  formatSupplyUnitCost as unitCostMoney,
} from '@/lib/supply/api';
import { formatQuantity } from '@/lib/format/numbers';
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

  const tabItems: readonly WorkspaceTabItem<CostingTab>[] = [
    { value: 'layers', label: 'Cost layers' },
    { value: 'positions', label: 'FIFO positions' },
    { value: 'outbound', label: 'Outbound assignments' },
    { value: 'cogs', label: 'COGS' },
    { value: 'valuation', label: 'Inventory valuation' },
  ];

  return (
    <div className="space-y-4">
      <WorkspaceTabs
        items={tabItems}
        value={tab}
        onValueChange={setTab}
        maxVisible={5}
        variant="pill"
        ariaLabel="Costing views"
      />
      <section className="rounded-xl bg-card">
        {tab === 'layers' || tab === 'positions' ? (
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Product / SKU</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Effective unit cost</TableHead>
                <TableHead>FIFO receipt time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {layers.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.product_title}
                    <br />
                    <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                  </TableCell>
                  <TableCell>
                    {item.receipt_number}
                    <br />
                    <span className="text-xs text-muted-foreground">{item.location_name}</span>
                  </TableCell>
                  <TableCell>{item.condition_code}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQuantity(item.original_quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQuantity(item.remaining_quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {unitCostMoney(item.effective_cost, item.currency_code)}
                    <br />
                    <span className="text-xs text-muted-foreground">{item.cost_state}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {date(item.received_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {tab === 'outbound' ? (
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Order / Fulfillment</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Assigned cost</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="font-mono">{item.order_number}</span>
                    <br />
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.fulfillment_id.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.product_title}
                    <br />
                    <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQuantity(item.quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {unitCostMoney(item.total_cost, item.currency_code)}
                  </TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {date(item.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {tab === 'cogs' ? (
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="text-right">Recognized cost</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cogs.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">{item.order_number}</TableCell>
                  <TableCell className="font-mono">{item.fulfillment_id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono">
                    {item.delivery_id?.slice(0, 8) ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {unitCostMoney(item.total_cost, item.currency_code)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {date(item.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {tab === 'valuation' ? (
          <Table stickyHeader density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Product / SKU</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="text-right">Costed quantity</TableHead>
                <TableHead className="text-right">Valuation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {valuation.map((item) => (
                <TableRow
                  key={`${item.inventory_item_id}-${item.location_id}-${item.condition_code}`}
                >
                  <TableCell>
                    {item.product_title}
                    <br />
                    <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                  </TableCell>
                  <TableCell>{item.location_name}</TableCell>
                  <TableCell>{item.condition_code}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQuantity(item.quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {money(item.value, item.currency_code)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {empty ? (
          <p className="p-6 text-sm text-muted-foreground">
            No authoritative costing facts exist for this view. Physical inventory without a Cost
            Layer is intentionally not presented as zero-valued inventory.
          </p>
        ) : null}
      </section>
    </div>
  );
}
