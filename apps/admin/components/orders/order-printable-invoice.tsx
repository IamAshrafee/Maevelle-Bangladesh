'use client';

import type { OrderDetailDto } from '@maevelle/contracts';
import { formatQuantity, formatWholeTaka } from '@/lib/format/numbers';

export function OrderPrintableInvoice({ order }: { readonly order: OrderDetailDto }) {
  const activeLines = order.lines.filter((line) => line.status === 'ACTIVE');
  const activeDelivery = order.deliveries?.[0];
  const tracking = activeDelivery?.trackingNumber || null;

  return (
    <section
      aria-label={`Printable invoice for order ${order.orderNumber}`}
      className="printable-document hidden print:block space-y-6 bg-white p-6 text-black"
    >
      <header className="flex items-start justify-between border-b border-neutral-300 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">
            Maevelle Bangladesh
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Customer Invoice & Packing Slip
          </h1>
          <p className="mt-1 text-xs text-neutral-600">
            Placed{' '}
            {new Intl.DateTimeFormat('en-BD', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(order.createdAt))}
          </p>
        </div>
        <div className="text-right font-mono">
          <p className="text-xs uppercase text-neutral-600">Order Number</p>
          <p className="text-lg font-bold">{order.orderNumber}</p>
          <p className="mt-1 text-xs uppercase text-neutral-600">
            {order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-6 border-b border-neutral-200 pb-4 text-xs">
        <div className="space-y-1">
          <p className="font-semibold uppercase tracking-wider text-neutral-600">Customer</p>
          <p className="text-sm font-semibold">{order.customer.displayName || 'Customer'}</p>
          <p className="font-mono">{order.customer.phone}</p>
          {order.customer.email ? <p>{order.customer.email}</p> : null}
        </div>
        <div className="space-y-1">
          <p className="font-semibold uppercase tracking-wider text-neutral-600">
            Delivery Address
          </p>
          <p className="text-sm font-semibold">{order.address.recipientName}</p>
          <p className="font-mono">{order.address.phone}</p>
          <p>{order.address.addressLine1}</p>
          {order.address.addressLine2 ? <p>{order.address.addressLine2}</p> : null}
          <p className="text-neutral-700">
            {[order.address.area, order.address.city, order.address.district]
              .filter(Boolean)
              .join(', ')}
          </p>
          {tracking ? <p className="pt-1 font-mono text-[11px]">Tracking: {tracking}</p> : null}
        </div>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-300 text-left uppercase text-neutral-600">
            <th className="py-2 pr-3 font-semibold">Item & SKU</th>
            <th className="py-2 px-3 text-right font-semibold">Qty</th>
            <th className="py-2 px-3 text-right font-semibold">Unit Price</th>
            <th className="py-2 pl-3 text-right font-semibold">Line Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {activeLines.map((line) => (
            <tr key={line.id}>
              <td className="py-2 pr-3">
                <p className="font-semibold">{line.productTitle}</p>
                {line.variantTitle ? (
                  <p className="text-[11px] text-neutral-700">{line.variantTitle}</p>
                ) : null}
                <p className="font-mono text-[11px] text-neutral-600">
                  SKU: {line.sku}
                  {line.options.length > 0
                    ? ` · ${line.options.map((opt) => `${opt.name}: ${opt.value}`).join(', ')}`
                    : ''}
                </p>
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums">
                {formatQuantity(line.quantity)}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums">
                {formatWholeTaka(line.unitPrice)}
              </td>
              <td className="py-2 pl-3 text-right font-mono font-semibold tabular-nums">
                {formatWholeTaka(line.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="ml-auto w-72 space-y-1.5 border-t border-neutral-300 pt-3 text-xs">
        <div className="flex justify-between">
          <span className="text-neutral-600">Merchandise Subtotal</span>
          <span className="font-mono tabular-nums">{formatWholeTaka(order.merchandiseGross)}</span>
        </div>
        {Number(order.discountTotal) > 0 ? (
          <div className="flex justify-between">
            <span className="text-neutral-600">Discounts</span>
            <span className="font-mono tabular-nums">-{formatWholeTaka(order.discountTotal)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-neutral-600">Delivery Charge</span>
          <span className="font-mono tabular-nums">{formatWholeTaka(order.deliveryAmount)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-300 pt-2 text-sm font-bold">
          <span>Payable Total (BDT)</span>
          <span className="font-mono tabular-nums">{formatWholeTaka(order.total)}</span>
        </div>
        <div className="flex justify-between pt-1 text-[11px] text-neutral-700">
          <span>Paid</span>
          <span className="font-mono tabular-nums">{formatWholeTaka(order.payment.collected)}</span>
        </div>
        <div className="flex justify-between text-[11px] font-semibold">
          <span>{order.paymentMethod === 'COD' ? 'COD Collectible' : 'Balance Due'}</span>
          <span className="font-mono tabular-nums">
            {formatWholeTaka(order.payment.outstanding)}
          </span>
        </div>
      </footer>
    </section>
  );
}
