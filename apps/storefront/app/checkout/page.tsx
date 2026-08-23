'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

interface Checkout {
  version: number;
  status: string;
  paymentMethod: 'COD';
  calculationVersion: number;
  calculationFingerprint: string;
  cart: {
    merchandiseGross: string;
    discountTotal: string;
    merchandiseNet: string;
    appliedCoupons: readonly string[];
    lines: readonly {
      id: string;
      productTitle: string;
      sku: string;
      quantity: string;
      unitPrice: string | null;
      gross: string;
      discount: string;
      net: string;
      availability: string;
    }[];
  };
  contact: { name: string; phone: string; email?: string } | null;
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
  } | null;
}

function money(value: string): string {
  return `৳${value}`;
}

async function readError(
  response: Response,
): Promise<{ code?: string; message: string; checkout?: Checkout }> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; checkout?: Checkout };
  };
  return {
    ...(payload.error?.code ? { code: payload.error.code } : {}),
    message: payload.error?.message ?? 'The checkout request could not be completed.',
    ...(payload.error?.checkout ? { checkout: payload.error.checkout } : {}),
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout>();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef<string | undefined>(undefined);

  const load = async () => {
    let response = await fetch('/api/storefront/v1/checkouts/current', { credentials: 'include' });
    if (response.status === 404)
      response = await fetch('/api/storefront/v1/checkouts', {
        method: 'POST',
        credentials: 'include',
      });
    if (!response.ok) {
      setMessage((await readError(response)).message);
      return;
    }
    setCheckout(((await response.json()) as ApiEnvelope<Checkout>).data);
  };
  useEffect(() => {
    void load();
  }, []);

  async function saveContact(form: HTMLFormElement) {
    if (!checkout) return;
    const data = new FormData(form);
    const response = await fetch('/api/storefront/v1/checkouts/current/contact', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: checkout.version,
        name: data.get('name'),
        phone: data.get('phone'),
        email: data.get('email') || undefined,
      }),
    });
    if (!response.ok) throw new Error((await readError(response)).message);
    setCheckout(((await response.json()) as ApiEnvelope<Checkout>).data);
  }
  async function saveAddress(form: HTMLFormElement) {
    if (!checkout) return;
    const data = new FormData(form);
    const response = await fetch('/api/storefront/v1/checkouts/current/address', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: checkout.version,
        recipientName: data.get('recipientName'),
        phone: data.get('deliveryPhone'),
        addressLine1: data.get('addressLine1'),
        addressLine2: data.get('addressLine2') || undefined,
        area: data.get('area') || undefined,
        city: data.get('city') || undefined,
        district: data.get('district') || undefined,
        postalCode: data.get('postalCode') || undefined,
        countryCode: data.get('countryCode'),
      }),
    });
    if (!response.ok) throw new Error((await readError(response)).message);
    setCheckout(((await response.json()) as ApiEnvelope<Checkout>).data);
  }
  async function onContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await saveContact(event.currentTarget);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save contact.');
    } finally {
      setSaving(false);
    }
  }
  async function onAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await saveAddress(event.currentTarget);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save address.');
    } finally {
      setSaving(false);
    }
  }
  async function placeOrder() {
    if (!checkout || saving) return;
    setSaving(true);
    setMessage('');
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    const response = await fetch('/api/storefront/v1/checkouts/current/place-order', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({
        calculationVersion: checkout.calculationVersion,
        calculationFingerprint: checkout.calculationFingerprint,
      }),
    });
    if (response.ok) {
      router.replace('/orders/confirmation');
      return;
    }
    const error = await readError(response);
    if (error.code === 'CHECKOUT_CHANGED' && error.checkout) {
      setCheckout(error.checkout);
      idempotencyKey.current = undefined;
      setMessage(
        'Prices, promotion, or availability changed. Please review the updated checkout before placing the Order.',
      );
    } else if (error.code === 'OUT_OF_STOCK') {
      idempotencyKey.current = undefined;
      setMessage(
        'One or more items are no longer available. Return to your Cart and review availability.',
      );
    } else if (error.code === 'CHECKOUT_COMPLETED') router.replace('/orders/confirmation');
    else setMessage(error.message);
    setSaving(false);
  }

  if (!checkout)
    return (
      <main>
        <section className="shell">
          <h1>Checkout</h1>
          <p>{message || 'Loading your authoritative checkout…'}</p>
          <Link href="/cart">Return to Cart</Link>
        </section>
      </main>
    );
  return (
    <main>
      <section className="shell">
        <h1>Checkout</h1>
        <p>
          Payment method: <strong>Cash on Delivery</strong>
        </p>
        <form onSubmit={onContact}>
          <h2>Contact</h2>
          <label>
            Name <input name="name" defaultValue={checkout.contact?.name} required />
          </label>
          <label>
            Phone <input name="phone" defaultValue={checkout.contact?.phone} required />
          </label>
          <label>
            Email <input name="email" type="email" defaultValue={checkout.contact?.email} />
          </label>
          <button disabled={saving} type="submit">
            Save contact
          </button>
        </form>
        <form onSubmit={onAddress}>
          <h2>Delivery address</h2>
          <label>
            Recipient{' '}
            <input name="recipientName" defaultValue={checkout.address?.recipientName} required />
          </label>
          <label>
            Phone <input name="deliveryPhone" defaultValue={checkout.address?.phone} required />
          </label>
          <label>
            Address{' '}
            <input name="addressLine1" defaultValue={checkout.address?.addressLine1} required />
          </label>
          <label>
            Address details{' '}
            <input name="addressLine2" defaultValue={checkout.address?.addressLine2} />
          </label>
          <label>
            Area <input name="area" defaultValue={checkout.address?.area} />
          </label>
          <label>
            City <input name="city" defaultValue={checkout.address?.city} />
          </label>
          <label>
            District <input name="district" defaultValue={checkout.address?.district} />
          </label>
          <label>
            Postcode <input name="postalCode" defaultValue={checkout.address?.postalCode} />
          </label>
          <label>
            Country code{' '}
            <input
              name="countryCode"
              defaultValue={checkout.address?.countryCode ?? 'BD'}
              required
            />
          </label>
          <button disabled={saving} type="submit">
            Save address
          </button>
        </form>
        <h2>Review</h2>
        {checkout.cart.lines.map((line) => (
          <article key={line.id}>
            <h3>{line.productTitle}</h3>
            <p>
              {line.sku} · Qty {line.quantity}
            </p>
            <p>
              Unit {line.unitPrice ? money(line.unitPrice) : 'Unavailable'} · Gross{' '}
              {money(line.gross)} · Discount {money(line.discount)} · Net {money(line.net)}
            </p>
          </article>
        ))}
        <p>Merchandise: {money(checkout.cart.merchandiseGross)}</p>
        <p>Discount: {money(checkout.cart.discountTotal)}</p>
        <p>
          <strong>Total: {money(checkout.cart.merchandiseNet)}</strong>
        </p>
        <button
          disabled={saving || !checkout.contact || !checkout.address}
          type="button"
          onClick={() => void placeOrder()}
        >
          {saving ? 'Placing Order…' : 'Place Cash on Delivery Order'}
        </button>
        <p>
          <Link href="/cart">Return to Cart</Link>
        </p>
        {message ? <p role="status">{message}</p> : null}
      </section>
    </main>
  );
}
