'use client';

import type { DeliveryDto } from '@maevelle/contracts';
import { formatQuantity, formatWholeTaka } from '@/lib/format/numbers';

export function DeliveryPrintableLabel({ delivery }: { readonly delivery: DeliveryDto }) {
  const carrier =
    delivery.manualCarrierName || delivery.activeBooking?.providerCode || 'Unassigned';
  const consignment =
    delivery.activeBooking?.externalConsignmentId || delivery.trackingReference || 'Pending';

  return (
    <section
      aria-label={`Printable consignment label for delivery ${delivery.deliveryNumber}`}
      className="printable-document hidden print:block max-w-md space-y-4 border border-neutral-400 bg-white p-5 text-black"
    >
      <header className="flex items-start justify-between border-b border-neutral-300 pb-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]">Maevelle Bangladesh</p>
          <h1 className="text-lg font-bold">Courier Consignment Label</h1>
        </div>
        <div className="text-right font-mono text-xs">
          <p className="font-bold">{delivery.deliveryNumber}</p>
          <p>{carrier}</p>
        </div>
      </header>

      <div className="space-y-1 border-b border-neutral-300 pb-3 text-xs">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          Deliver To
        </p>
        <p className="text-sm font-bold">{delivery.recipient.name}</p>
        <p className="font-mono font-semibold">{delivery.recipient.phone}</p>
        <p className="leading-snug">{delivery.recipient.address}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-neutral-300 pb-3 text-xs">
        <div>
          <p className="text-[10px] uppercase text-neutral-600">Consignment / Tracking</p>
          <p className="font-mono font-bold">{consignment}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-neutral-600">COD Collectible</p>
          <p className="font-mono text-sm font-bold tabular-nums">
            {delivery.cod.required ? formatWholeTaka(delivery.cod.expectedAmount) : 'PREPAID (৳0)'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-neutral-600">Order</p>
          <p className="font-mono">{delivery.orderNumber}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-neutral-600">Fulfillment</p>
          <p className="font-mono">{delivery.fulfillmentNumber}</p>
        </div>
      </div>

      <div className="space-y-1 text-[11px]">
        <p className="font-semibold uppercase text-neutral-600">Contents</p>
        {delivery.lines.map((line) => (
          <div key={`${line.orderLineId}-${line.sku}`} className="flex justify-between font-mono">
            <span>{line.sku}</span>
            <span>x{formatQuantity(line.quantity)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
