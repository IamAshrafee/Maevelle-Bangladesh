'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

interface Order {
  orderNumber: string;
  status: string;
  paymentMethod: 'COD';
  merchandiseGross: string;
  discountTotal: string;
  merchandiseNet: string;
  customer: { displayName: string; phone: string; email: string | null };
  address: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    area?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    countryCode: string;
  };
  lines: readonly {
    sku: string;
    productTitle: string;
    quantity: string;
    unitPrice: string;
    gross: string;
    discount: string;
    net: string;
    options: readonly { name: string; value: string }[];
  }[];
}
const money = (value: string) => `৳${value}`;
export default function OrderConfirmationPage() {
  const [order, setOrder] = useState<Order>();
  const [message, setMessage] = useState('');
  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/storefront/v1/orders/confirmation', {
        credentials: 'include',
      });
      if (response.ok) setOrder(((await response.json()) as ApiEnvelope<Order>).data);
      else
        setMessage(
          'This Order confirmation is unavailable. Use the secure checkout link from the completed session.',
        );
    })();
  }, []);
  if (!order)
    return (
      <main>
        <section className="shell">
          <h1>Order confirmation</h1>
          <p>{message || 'Loading confirmation…'}</p>
          <Link href="/">Continue shopping</Link>
        </section>
      </main>
    );
  return (
    <main>
      <section className="shell">
        <h1>Order {order.orderNumber}</h1>
        <p>Status: {order.status}</p>
        <p>
          Payment: <strong>Cash on Delivery</strong>
        </p>
        <h2>Customer</h2>
        <p>
          {order.customer.displayName} · {order.customer.phone}
          {order.customer.email ? ` · ${order.customer.email}` : ''}
        </p>
        <h2>Delivery</h2>
        <p>
          {[
            order.address.recipientName,
            order.address.addressLine1,
            order.address.addressLine2,
            order.address.area,
            order.address.city,
            order.address.district,
            order.address.postalCode,
            order.address.countryCode,
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
        <h2>Items</h2>
        {order.lines.map((line) => (
          <article key={`${line.sku}-${line.productTitle}`}>
            <h3>{line.productTitle}</h3>
            <p>
              {line.sku}
              {line.options.length
                ? ` · ${line.options.map((option) => `${option.name}: ${option.value}`).join(', ')}`
                : ''}
            </p>
            <p>
              Qty {line.quantity} · Unit {money(line.unitPrice)} · Gross {money(line.gross)} ·
              Discount {money(line.discount)} · Net {money(line.net)}
            </p>
          </article>
        ))}
        <p>Merchandise: {money(order.merchandiseGross)}</p>
        <p>Discount: {money(order.discountTotal)}</p>
        <p>
          <strong>Total: {money(order.merchandiseNet)}</strong>
        </p>
        <Link href="/">Continue shopping</Link>
      </section>
    </main>
  );
}
