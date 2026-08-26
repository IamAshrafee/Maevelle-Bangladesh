'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';
import { notifyCartChanged } from '@/components/storefront-context';

interface CartView {
  currency: string;
  version: number;
  merchandiseGross: string;
  discountTotal: string;
  merchandiseNet: string;
  appliedCoupons: readonly string[];
  lines: readonly {
    id: string;
    productTitle: string;
    productHandle: string;
    mediaAssetId: string | null;
    options: readonly { name: string; value: string }[];
    sku: string;
    quantity: string;
    unitPrice: string | null;
    compareAtUnitPrice: string | null;
    gross: string;
    discount: string;
    net: string;
    availability: string;
  }[];
}

function money(value: string, currency: string) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}
const availabilityMessage: Record<string, string> = {
  UNAVAILABLE: 'This option is currently out of stock.',
  INSUFFICIENT_CURRENT_STOCK: 'Only part of this quantity is currently available.',
  UNPRICED: 'The price is no longer available.',
};

export default function CartPage() {
  const [cart, setCart] = useState<CartView>();
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [message, setMessage] = useState('');
  const [busyLine, setBusyLine] = useState<string>();
  const reload = async () => {
    const response = await fetch('/api/storefront/v1/carts/current', { credentials: 'include' });
    if (response.ok) setCart(((await response.json()) as ApiEnvelope<CartView>).data);
    setState('ready');
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
      throw new Error(
        'Your bag changed or this item is no longer available. Review the latest details and try again.',
      );
    setCart(((await response.json()) as ApiEnvelope<CartView>).data);
    notifyCartChanged();
  }
  async function update(lineId: string, next: string) {
    setBusyLine(lineId);
    setMessage('');
    try {
      await mutate(`/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: next, version: cart?.version }),
      });
      setMessage('Quantity updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update your bag.');
    } finally {
      setBusyLine(undefined);
    }
  }
  async function remove(lineId: string) {
    setBusyLine(lineId);
    setMessage('');
    try {
      await mutate(`/lines/${lineId}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: cart?.version }),
      });
      setMessage('Item removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove the item.');
    } finally {
      setBusyLine(undefined);
    }
  }
  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get('couponCode') ?? '').trim();
    if (!code) return;
    setMessage('');
    try {
      await mutate('/coupons', {
        method: 'POST',
        body: JSON.stringify({ couponCode: code, version: cart?.version }),
      });
      form.reset();
      setMessage('Promotion applied.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That promotion could not be applied.');
    }
  }
  async function removeCoupon(code: string) {
    try {
      await mutate(`/coupons/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: cart?.version }),
      });
      setMessage('Promotion removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promotion could not be removed.');
    }
  }

  if (state === 'loading')
    return (
      <main>
        <section className="cart-shell">
          <h1>Your bag</h1>
          <div className="cart-loading" aria-label="Loading bag" aria-busy="true">
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  if (!cart || cart.lines.length === 0)
    return (
      <main>
        <section className="empty-cart">
          <span aria-hidden="true">M</span>
          <p className="eyebrow">Your bag is waiting</p>
          <h1>Find something you will love</h1>
          <p>
            Explore the collection, choose an available color and size, then come back here to check
            out.
          </p>
          <Link className="button-link dark" href="/categories">
            Start shopping
          </Link>
        </section>
      </main>
    );

  const canCheckout = cart.lines.every((line) => line.availability === 'AVAILABLE');
  return (
    <main>
      <section className="cart-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>Bag</span>
        </nav>
        <div className="cart-heading">
          <div>
            <p className="eyebrow">Your selection</p>
            <h1>Your bag</h1>
          </div>
          <p>
            {cart.lines.length} item{cart.lines.length === 1 ? '' : 's'}
          </p>
        </div>
        {message ? (
          <p className="cart-page-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="cart-layout">
          <section className="cart-lines" aria-label="Bag items">
            {cart.lines.map((line) => (
              <article className="cart-line" key={line.id}>
                <Link className="cart-line-media" href={`/products/${line.productHandle}`}>
                  {line.mediaAssetId ? (
                    <img
                      src={`/api/media/public/${line.mediaAssetId}`}
                      alt=""
                      width="180"
                      height="240"
                    />
                  ) : (
                    <span className="product-image-fallback" aria-hidden="true">
                      M
                    </span>
                  )}
                </Link>
                <div className="cart-line-copy">
                  <div>
                    <h2>
                      <Link href={`/products/${line.productHandle}`}>{line.productTitle}</Link>
                    </h2>
                    {line.options.length ? (
                      <p>
                        {line.options
                          .map((option) => `${option.name}: ${option.value}`)
                          .join(' · ')}
                      </p>
                    ) : (
                      <p>SKU {line.sku}</p>
                    )}
                  </div>
                  <div className="cart-line-price">
                    {line.compareAtUnitPrice ? (
                      <del>{money(line.compareAtUnitPrice, cart.currency)}</del>
                    ) : null}
                    <strong>
                      {line.unitPrice ? money(line.unitPrice, cart.currency) : 'Unavailable'}
                    </strong>
                  </div>
                  {line.availability !== 'AVAILABLE' ? (
                    <p className="line-warning" role="alert">
                      {availabilityMessage[line.availability] ??
                        'Review this item before checkout.'}
                    </p>
                  ) : null}
                  <div className="cart-line-actions">
                    <label>
                      Quantity
                      <select
                        aria-label={`Quantity for ${line.productTitle}`}
                        value={line.quantity}
                        disabled={busyLine === line.id}
                        onChange={(event) => void update(line.id, event.target.value)}
                      >
                        {Array.from({ length: 10 }, (_, index) => (
                          <option value={index + 1} key={index + 1}>
                            {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busyLine === line.id}
                      onClick={() => void remove(line.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="line-totals">
                    <span>Line total</span>
                    <strong>{money(line.net, cart.currency)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </section>
          <aside className="cart-summary">
            <h2>Order summary</h2>
            <dl>
              <div>
                <dt>Merchandise</dt>
                <dd>{money(cart.merchandiseGross, cart.currency)}</dd>
              </div>
              {Number(cart.discountTotal) > 0 ? (
                <div className="discount">
                  <dt>Discount</dt>
                  <dd>−{money(cart.discountTotal, cart.currency)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Delivery</dt>
                <dd>Calculated at checkout</dd>
              </div>
              <div className="summary-total">
                <dt>Total</dt>
                <dd>{money(cart.merchandiseNet, cart.currency)}</dd>
              </div>
            </dl>
            <form className="coupon-form" onSubmit={applyCoupon}>
              <label htmlFor="coupon">Promotion code</label>
              <div>
                <input id="coupon" name="couponCode" autoComplete="off" placeholder="Enter code" />
                <button type="submit">Apply</button>
              </div>
            </form>
            {cart.appliedCoupons.map((code) => (
              <p className="coupon-chip" key={code}>
                <span>{code}</span>
                <button
                  type="button"
                  aria-label={`Remove promotion ${code}`}
                  onClick={() => void removeCoupon(code)}
                >
                  ×
                </button>
              </p>
            ))}
            {canCheckout ? (
              <Link className="button-link checkout-button" href="/checkout">
                Continue to checkout
              </Link>
            ) : (
              <>
                <button className="checkout-button" type="button" disabled>
                  Review unavailable items
                </button>
                <p className="summary-help">
                  Remove or update unavailable items before continuing.
                </p>
              </>
            )}
            <p className="secure-note">
              <span aria-hidden="true">◇</span> Secure guest checkout · No account required
            </p>
          </aside>
        </div>
        <Link className="continue-link" href="/categories">
          ← Continue shopping
        </Link>
      </section>
    </main>
  );
}
