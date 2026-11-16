'use client';

import type { FulfillmentDto } from '@maevelle/contracts';
import { formatQuantity } from '@/lib/format/numbers';

export function FulfillmentPrintablePicklist({
  fulfillment,
}: {
  readonly fulfillment: FulfillmentDto;
}) {
  return (
    <section
      aria-label={`Printable picklist for fulfillment ${fulfillment.fulfillmentNumber}`}
      className="printable-document hidden print:block space-y-5 bg-white p-6 text-black"
    >
      <header className="flex items-start justify-between border-b border-neutral-300 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">
            Maevelle Warehouse Operations
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Warehouse Picklist</h1>
          <p className="mt-1 text-xs text-neutral-600">Location: {fulfillment.locationName}</p>
        </div>
        <div className="text-right font-mono text-xs">
          <p className="font-bold text-base">{fulfillment.fulfillmentNumber}</p>
          <p>Order: {fulfillment.orderNumber}</p>
          <p>Status: {fulfillment.status}</p>
        </div>
      </header>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-300 text-left uppercase text-neutral-600">
            <th className="py-2 pr-3 font-semibold">Picked</th>
            <th className="py-2 px-3 font-semibold">SKU</th>
            <th className="py-2 px-3 font-semibold">Item</th>
            <th className="py-2 px-3 text-right font-semibold">Required Qty</th>
            <th className="py-2 pl-3 text-right font-semibold">Consumed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {fulfillment.lines.map((line) => (
            <tr key={line.id}>
              <td className="py-2.5 pr-3 font-mono">[ ]</td>
              <td className="py-2.5 px-3 font-mono font-semibold">{line.sku}</td>
              <td className="py-2.5 px-3 font-medium">{line.productTitle}</td>
              <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                {formatQuantity(line.quantity)}
              </td>
              <td className="py-2.5 pl-3 text-right font-mono tabular-nums">
                {fulfillment.status === 'DISPATCHED' ? line.consumed : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="grid grid-cols-2 gap-6 border-t border-neutral-300 pt-6 text-xs text-neutral-700">
        <div>
          <p className="font-semibold">Picked By</p>
          <p className="mt-5 border-b border-neutral-400" />
        </div>
        <div>
          <p className="font-semibold">Packed & Verified By</p>
          <p className="mt-5 border-b border-neutral-400" />
        </div>
      </footer>
    </section>
  );
}
