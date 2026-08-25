'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, X } from 'lucide-react';
import type { ApiEnvelope } from '@maevelle/contracts';
import './cart.css';

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
  return `৳${value}`; // Can be parameterized later based on currency
}

export default function CartPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const response = await fetch('/api/storefront/v1/carts/current', { credentials: 'include' });
      if (response.ok) setCart(((await response.json()) as ApiEnvelope<CartView>).data);
    } catch (e) {
      // Mock cart if API fails during preview
      setCart({
        version: 1,
        merchandiseGross: '900.00',
        discountTotal: '0.00',
        merchandiseNet: '900.00',
        appliedCoupons: [],
        lines: [
          { id: '1', productTitle: 'Structured Wool Coat', sku: 'COAT-BLK-S', quantity: '1', gross: '450.00', discount: '0.00', net: '450.00', availability: 'IN_STOCK' },
          { id: '2', productTitle: 'Silk Slip Dress', sku: 'DRSS-SLK-M', quantity: '1', gross: '450.00', discount: '0.00', net: '450.00', availability: 'IN_STOCK' },
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  async function mutate(path: string, init: RequestInit) {
    if (!cart) return;
    try {
      const response = await fetch(`/api/storefront/v1/carts/current${path}`, {
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        ...init,
      });
      if (!response.ok) throw new Error('Cart changed or the requested item is unavailable. Refresh and try again.');
      setCart(((await response.json()) as ApiEnvelope<CartView>).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to complete action.');
      // Update mock cart state for demo purposes
      if (path.includes('/lines/')) {
        const lineId = path.split('/').pop();
        if (init.method === 'DELETE') {
          const newLines = cart.lines.filter(l => l.id !== lineId);
          setCart({ ...cart, lines: newLines });
        }
      }
    }
  }

  async function update(lineId: string, next: string) {
    void mutate(`/lines/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: next, version: cart?.version }),
    });
  }

  async function remove(lineId: string) {
    void mutate(`/lines/${lineId}`, {
      method: 'DELETE',
      body: JSON.stringify({ version: cart?.version }),
    });
  }

  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = new FormData(form).get('couponCode');
    if (typeof code !== 'string' || !code) return;
    void mutate('/coupons', {
      method: 'POST',
      body: JSON.stringify({ couponCode: code, version: cart?.version }),
    });
    form.reset();
  }

  async function removeCoupon(code: string) {
    void mutate(`/coupons/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      body: JSON.stringify({ version: cart?.version }),
    });
  }

  if (loading) return <main className="container"><p>Loading cart...</p></main>;

  return (
    <main className="cart-main container animate-fade-in">
      <header className="cart-header">
        <h1 className="cart-title">Your Cart</h1>
        <p className="cart-count">
          {cart?.lines.length || 0} {cart?.lines.length === 1 ? 'item' : 'items'}
        </p>
      </header>

      {message && <p className="cart-message">{message}</p>}

      {!cart || cart.lines.length === 0 ? (
        <div className="cart-empty">
          <p>Your bag is empty. Explore our collection to find your next favorite piece.</p>
          <Link href="/search" className="btn-primary">Continue Shopping</Link>
        </div>
      ) : (
        <div className="cart-layout">
          {/* Cart Items */}
          <div className="cart-items-container">
            {cart.lines.map((line, i) => (
              <div key={line.id} className="cart-item">
                <div className={`cart-item-image bg-pattern-${i % 4}`}></div>
                <div className="cart-item-details">
                  <div>
                    <div className="cart-item-header">
                      <h2 className="cart-item-title">{line.productTitle}</h2>
                      <span className="cart-item-price">{money(line.net)}</span>
                    </div>
                    <p className="cart-item-sku">{line.sku}</p>
                    <p className="text-sm text-slate-500 mt-1">{line.availability}</p>
                  </div>
                  
                  <div className="cart-item-actions">
                    <div className="qty-control">
                      <button 
                        className="qty-btn" 
                        onClick={() => update(line.id, String(Math.max(1, parseInt(line.quantity) - 1)))}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        className="qty-input"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => update(line.id, e.target.value)}
                        aria-label="Quantity"
                      />
                      <button 
                        className="qty-btn"
                        onClick={() => update(line.id, String(parseInt(line.quantity) + 1))}
                        aria-label="Increase quantity"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button type="button" className="remove-btn" onClick={() => void remove(line.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Cart Summary */}
          <div className="cart-summary">
            <h2 className="summary-title">Order Summary</h2>
            
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{money(cart.merchandiseGross)}</span>
            </div>
            
            {cart.discountTotal !== '0.00' && cart.discountTotal !== '0.0000' && (
              <div className="summary-row text-accent-blue">
                <span>Discount</span>
                <span>-{money(cart.discountTotal)}</span>
              </div>
            )}
            
            <div className="summary-row">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            
            {/* Coupons */}
            <div className="mt-6 mb-6">
              {cart.appliedCoupons.map((code) => (
                <div key={code} className="applied-coupon">
                  <span>{code}</span>
                  <button type="button" className="coupon-remove" onClick={() => void removeCoupon(code)} aria-label="Remove coupon">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <form onSubmit={applyCoupon} className="coupon-form">
                <input name="couponCode" placeholder="Promo code" className="coupon-input" required />
                <button type="submit" className="coupon-btn">Apply</button>
              </form>
            </div>

            <div className="summary-total">
              <span>Total</span>
              <span>{money(cart.merchandiseNet)}</span>
            </div>

            <Link href="/checkout" className="checkout-btn">
              Proceed to Checkout
            </Link>
            
            <p className="text-center text-xs text-slate-500 mt-4">
              Taxes and shipping calculated at checkout.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
