'use client';

import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

interface CartView {
  version: number;
  merchandiseGross: string;
  discountTotal: string;
  merchandiseNet: string;
  appliedCoupons: readonly string[];
  lines: readonly {
    id: string;
    productTitle: string;
    sku: string;
    quantity: string;
    gross: string;
    discount: string;
    net: string;
    availability: string;
  }[];
}

function money(value: string): string {
  return `৳${value}`;
}

export default function CartPage() {
  const [cart, setCart] = useState<CartView>();
  const [message, setMessage] = useState('');
  const reload = async () => {
    const response = await fetch('/api/storefront/v1/carts/current', { credentials: 'include' });
    if (response.ok) setCart(((await response.json()) as ApiEnvelope<CartView>).data);
  };
  useEffect(() => {
    void reload();
  }, []);
  async function mutate(path: string, init: RequestInit) {
    if (!cart) return;
    const response = await fetch(`/api/storefront/v1/carts/current${path}`, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    if (!response.ok)
      throw new Error('Cart changed or the requested item is unavailable. Refresh and try again.');
    setCart(((await response.json()) as ApiEnvelope<CartView>).data);
  }
  async function update(lineId: string, next: string) {
    try {
      await mutate(`/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: next, version: cart?.version }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update cart.');
    }
  }
  async function remove(lineId: string) {
    try {
      await mutate(`/lines/${lineId}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: cart?.version }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove line.');
    }
  }
  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = new FormData(form).get('couponCode');
    if (typeof code !== 'string') return;
    try {
      await mutate('/coupons', {
        method: 'POST',
        body: JSON.stringify({ couponCode: code, version: cart?.version }),
      });
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coupon could not be applied.');
    }
  }
  async function removeCoupon(code: string) {
    try {
      await mutate(`/coupons/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: cart?.version }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Coupon could not be removed.');
    }
  }
  return (
    <main>
      <section className="shell">
        <h1>Your cart</h1>
        {!cart ? (
          <p>Your guest cart is empty.</p>
        ) : (
          <>
            {cart.lines.map((line) => (
              <article key={line.id}>
                <h2>{line.productTitle}</h2>
                <p>
                  {line.sku} · {line.availability}
                </p>
                <p>{money(line.net)}</p>
                <label>
                  Quantity{' '}
                  <input
                    type="number"
                    min="1"
                    defaultValue={line.quantity}
                    onBlur={(event) => {
                      if (event.currentTarget.value !== line.quantity)
                        void update(line.id, event.currentTarget.value);
                    }}
                  />
                </label>
                <button type="button" onClick={() => void remove(line.id)}>
                  Remove
                </button>
              </article>
            ))}
            <form onSubmit={applyCoupon}>
              <label htmlFor="coupon">Coupon</label>
              <input id="coupon" name="couponCode" required />
              <button type="submit">Apply coupon</button>
            </form>
            {cart.appliedCoupons.map((code) => (
              <p key={code}>
                {code}{' '}
                <button type="button" onClick={() => void removeCoupon(code)}>
                  Remove
                </button>
              </p>
            ))}
            <p>Merchandise: {money(cart.merchandiseGross)}</p>
            <p>Discount: {money(cart.discountTotal)}</p>
            <p>
              <strong>Total: {money(cart.merchandiseNet)}</strong>
            </p>
          </>
        )}
        {message ? <p role="status">{message}</p> : null}
      </section>
    </main>
  );
}
